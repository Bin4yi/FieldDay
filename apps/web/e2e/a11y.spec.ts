import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/#/', '/#/games', '/#/setup/sky_toss', '/#/say', '/#/quests', '/#/quest-new', '/#/settings', '/#/me', '/#/history', '/#/room', '/#/crew', '/#/stats', '/#/scan'];

for (const path of PAGES) {
  test(`a11y: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(400);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const issues = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(issues, issues.join('\n')).toEqual([]);
  });
}

test('a11y: play screen (tap mode)', async ({ page }) => {
  await page.goto('/#/setup/squat_storm');
  await page.getByRole('button', { name: 'Tap mode' }).click();
  await expect(page.getByRole('button', { name: 'Squat', exact: true })).toBeEnabled({ timeout: 10_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const issues = r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(issues, issues.join('\n')).toEqual([]);
});
