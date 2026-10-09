import { expect, test } from '@playwright/test';

test('Phase 7: Boost Mode designs online, and falls back to Gemma when the network is cut mid-game', async ({ page, context }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: /Boost Mode/ }).check();
  await expect(page.getByText('available ✓')).toBeVisible({ timeout: 15_000 });

  // Online: OpenAI (through our server) designs the game.
  await page.goto('/#/say');
  await page.getByRole('textbox', { name: /Say a game/ }).fill('jump battle, solo');
  await page.getByRole('button', { name: 'Make my game' }).click();
  await expect(page.getByRole('heading', { name: 'Boosted Jump Off' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Designed by the brain · Boost Mode/)).toBeVisible();

  // Play it; cut the network in the middle of the game.
  await page.getByRole('button', { name: 'Play it' }).click();
  await page.getByRole('button', { name: 'Tap mode' }).click();
  const jump = page.getByRole('button', { name: 'Jump', exact: true });
  await expect(jump).toBeEnabled({ timeout: 10_000 });
  await page.getByRole('spinbutton').fill('0.4');
  await jump.click();
  await context.setOffline(true);
  for (const h of ['0.5', '0.45']) {
    await expect(jump).toBeEnabled({ timeout: 10_000 });
    await page.getByRole('spinbutton').fill(h);
    await jump.click();
  }
  await expect(page.getByRole('heading', { name: /wins!/ })).toBeVisible({ timeout: 15_000 });

  // Still offline: the next request automatically uses Gemma / Open Mode.
  await page.goto('/#/say');
  await page.getByRole('textbox', { name: /Say a game/ }).fill('squat race for 30 seconds');
  await page.getByRole('button', { name: 'Make my game' }).click();
  await expect(page.getByRole('heading', { name: 'Squat Storm' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Open Mode/)).toBeVisible();

  // Brain Stats shows both brains, with real numbers.
  await page.goto('/#/stats');
  await expect(page.getByRole('cell', { name: 'OpenAI (Boost)' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Gemma (Open)' }).first()).toBeVisible();
});
