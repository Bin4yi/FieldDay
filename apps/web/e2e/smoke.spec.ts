import { expect, test } from '@playwright/test';

test('home → quick game → play Sky Toss with taps → result saved', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FieldDay' })).toBeVisible();
  await page.getByRole('link', { name: 'Quick Games' }).click();
  await expect(page.locator('.game-card')).toHaveCount(12);

  await page.getByRole('link', { name: /Sky Toss Showdown/ }).click();
  await page.getByRole('button', { name: 'Fewer players' }).click();
  await page.getByRole('textbox', { name: 'Player 1 name' }).fill('Binula');
  await page.getByRole('button', { name: 'Start' }).click();

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
