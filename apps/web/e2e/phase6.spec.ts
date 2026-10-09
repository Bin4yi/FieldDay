import { expect, test, type Page } from '@playwright/test';

async function tapThrows(page: Page, heights: string[]) {
  const apex = page.getByRole('button', { name: 'Top of throw' });
  for (const h of heights) {
    await expect(apex).toBeEnabled({ timeout: 20_000 });
    await page.getByRole('spinbutton').fill(h);
    await apex.click();
    await page.getByRole('button', { name: 'Catch', exact: true }).click();
  }
}

async function setName(page: Page, name: string) {
  await page.goto('/#/setup/sky_toss');
  await page.getByRole('textbox', { name: 'Player 1 name' }).fill(name);
  // Names are saved when a game starts; start + leave a tap game to store it.
  await page.getByRole('button', { name: 'Tap mode' }).click();
  await page.getByRole('link', { name: 'Quit game' }).click();
}

test('Phase 6: two phones play a live battle', async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await setName(a, 'Colombo');
  await setName(b, 'Kandy');

  await a.goto('/#/room');
  await expect(a.getByText('Online', { exact: true })).toBeVisible({ timeout: 15_000 });
  await a.getByRole('button', { name: 'Create room' }).click();
  const code = (await a.locator('.card--yellow .display').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await a.getByRole('button', { name: 'Tap mode' }).click();

  await b.goto(`/#/room/${code}`);
  await expect(b.getByText('Colombo 👑')).toBeVisible({ timeout: 15_000 });
  await b.getByRole('button', { name: 'Tap mode' }).click();
  await expect(a.getByText('Kandy')).toBeVisible();

  await a.getByRole('button', { name: 'Start for everyone' }).click();
  await Promise.all([tapThrows(a, ['2.1', '2.5', '2.3']), tapThrows(b, ['2.0', '2.7', '2.2'])]);
  await expect(a.getByText('🏆 Kandy')).toBeVisible({ timeout: 20_000 });
  await expect(b.getByText('🏆 Kandy')).toBeVisible({ timeout: 20_000 });
});

test('Phase 6: a crew shared quest updates on both phones', async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await setName(a, 'Ama');
  await setName(b, 'Binula');

  await a.goto('/#/crew');
  await a.getByRole('textbox', { name: 'Crew name' }).fill('Park Rangers');
  await a.getByRole('button', { name: 'Create crew' }).click();
  const code = (await a.locator('.card--yellow .display').textContent())!.trim();
  await a.getByRole('button', { name: 'Add goal' }).click();
  await expect(a.getByText('Throw 100 metres this week')).toBeVisible();

  await b.goto('/#/crew');
  await b.getByRole('textbox', { name: 'Crew code' }).fill(code);
  await b.getByRole('button', { name: 'Join' }).click();
  await expect(b.getByText('0 / 100 height m')).toBeVisible({ timeout: 15_000 });

  // Ama plays Sky Toss; her best throw goes to the crew goal.
  await a.goto('/#/setup/sky_toss');
  await a.getByRole('button', { name: 'Fewer players' }).click();
  await a.getByRole('button', { name: 'Tap mode' }).click();
  await tapThrows(a, ['2.1', '2.5', '2.3']);
  await expect(a.getByRole('heading', { name: 'Ama wins!' })).toBeVisible({ timeout: 15_000 });

  // Binula's crew page updates live (no reload).
  await expect(b.getByText('2.5 / 100 height m')).toBeVisible({ timeout: 15_000 });
  await a.goto('/#/crew');
  await expect(a.getByText('2.5 / 100 height m')).toBeVisible({ timeout: 15_000 });
  await expect(a.getByText(/🥇 Ama — 2.5/)).toBeVisible();
});
