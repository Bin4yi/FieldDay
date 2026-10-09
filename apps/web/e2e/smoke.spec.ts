import { expect, test } from '@playwright/test';

test('home → quick game → play Sky Toss with taps → result saved', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FieldDay' })).toBeVisible();
  await page.getByRole('link', { name: 'Quick Games' }).click();
  await expect(page.locator('.game-card')).toHaveCount(12);

  await page.getByRole('link', { name: /Sky Toss Showdown/ }).click();
  await page.getByRole('button', { name: 'Fewer players' }).click();
  await page.getByRole('textbox', { name: 'Player 1 name' }).fill('Binula');
  await page.getByRole('button', { name: 'Tap mode' }).click();

  const apex = page.getByRole('button', { name: 'Top of throw' });
  const height = page.getByRole('spinbutton');
  const catchIt = page.getByRole('button', { name: 'Catch', exact: true });
  for (const h of ['2.1', '2.8', '2.5']) {
    await expect(apex).toBeEnabled({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Throw', exact: true }).click();
    await height.fill(h);
    await apex.click();
    await catchIt.click();
  }
  await expect(page.getByRole('heading', { name: 'Binula wins!' })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.scoreboard')).toContainText('2.80 m');
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText('Works offline')).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'FieldDay' })).toBeVisible();
  await expect(page.getByText('No signal · Still works')).toBeVisible();
  await page.getByRole('link', { name: 'Quick Games' }).click();
  await expect(page.locator('.game-card')).toHaveCount(12);
  await expect(page.locator('.game-card img').first()).toHaveJSProperty('complete', true);
});

test('demo camera referees Jump Battle end to end (no taps)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/setup/jump_battle');
  await page.getByRole('button', { name: 'Fewer players' }).click();
  await page.getByRole('textbox', { name: 'Player 1 name' }).fill('Ama');
  await page.getByRole('button', { name: 'Demo camera' }).click();
  await expect(page.getByRole('heading', { name: 'Field Check' })).toBeVisible();
  await expect(page.getByText('Whole body in view')).toBeVisible();
  await page.getByRole('button', { name: 'Space is clear' }).click();
  await page.getByRole('button', { name: /start/i }).first().click();
  // The demo player jumps every 8 seconds; 3 jumps finish the game.
  await expect(page.getByRole('heading', { name: 'Ama wins!' })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.scoreboard')).toContainText(' m');
});

test('Phase 3: in airplane mode, a spoken/typed game becomes a playable, refereed game', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.getByRole('link', { name: /Say a game/ }).click();
  await page.getByRole('textbox', { name: /Say a game/ }).fill('highest throw battle, 3 rounds, 2 players');
  await page.getByRole('button', { name: 'Make my game' }).click();
  await expect(page.getByRole('heading', { name: 'Sky Toss Showdown' })).toBeVisible();
  await expect(page.getByText('Made offline from your words')).toBeVisible();
  await page.getByRole('button', { name: 'Play it' }).click();
  await page.getByRole('textbox', { name: 'Player 1 name' }).fill('Binula');
  await page.getByRole('textbox', { name: 'Player 2 name' }).fill('Ama');
  await page.getByRole('button', { name: 'Tap mode' }).click();
  const apex = page.getByRole('button', { name: 'Top of throw' });
  const heights = ['2.1', '2.3', '2.6', '1.9', '2.2', '2.4'];
  for (const h of heights) {
    await expect(apex).toBeEnabled({ timeout: 10_000 });
    await page.getByRole('spinbutton').fill(h);
    await apex.click();
    await page.getByRole('button', { name: 'Catch', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Binula wins!' })).toBeVisible({ timeout: 10_000 });
});

test('model runtimes are served locally (no CDN needed)', async ({ request }) => {
  for (const path of ['/mediapipe/vision/vision_wasm_internal.wasm', '/mediapipe/genai/genai_wasm_internal.wasm', '/ort/ort-wasm-simd-threaded.jsep.wasm']) {
    const r = await request.head(path);
    expect(r.status(), path).toBe(200);
  }
});
