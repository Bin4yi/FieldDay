import { deflateSync } from 'node:zlib';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { encodeQuest, validateQuest } from '@fieldday/quests';

async function installOffline(page: Page, context: BrowserContext) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText('Works offline')).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
}

/** A solid-colour PNG (for the photo check). */
function png(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function tapThrows(page: Page, heights: string[]) {
  const apex = page.getByRole('button', { name: 'Top of throw' });
  for (const h of heights) {
    await expect(apex).toBeEnabled({ timeout: 10_000 });
    await page.getByRole('spinbutton').fill(h);
    await apex.click();
    await page.getByRole('button', { name: 'Catch', exact: true }).click();
  }
}

test('Phase 5: a 5-step quest runs fully offline', async ({ page, context }) => {
  test.setTimeout(180_000);
  const v = validateQuest({
    title: 'Park Gauntlet',
    steps: [
      { type: 'game', spec_ref: 'jump_battle', goal: 'height_m >= 0.3' },
      { type: 'move', instruction: 'Walk to the biggest tree you can see', check: 'confirm' },
      { type: 'find', instruction: 'Find something red', check: 'photo', photo_task: 'something red' },
      { type: 'game', spec_ref: 'sky_toss', goal: 'height_m >= 2' },
      { type: 'boss', spec_ref: 'boss_raid_basic' },
    ],
    reward: { badge: 'Gauntlet Runner', xp: 300 },
  });
  if (!v.ok) throw new Error(v.errors.join());
  await installOffline(page, context);
  await page.goto(`/#/q/${encodeQuest(v.quest)}`);
  await page.getByRole('button', { name: 'Save & start' }).click();

  // 1. Jump Battle, 2 players, 3 rounds each.
  await page.getByRole('button', { name: 'Play (tap mode)' }).click();
  const jump = page.getByRole('button', { name: 'Jump', exact: true });
  for (let i = 0; i < 6; i++) {
    await expect(jump).toBeEnabled({ timeout: 10_000 });
    await page.getByRole('spinbutton').fill('0.4');
    await jump.click();
  }
  await expect(page.getByText(/Step done!/)).toBeVisible({ timeout: 15_000 });

  // 2. Walk.
  await page.getByRole('button', { name: 'Done!' }).click();

  // 3. Photo of something red: checked on the phone.
  await page.locator('input[type=file]').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: png(64, 64, [220, 30, 30]) });
  await expect(page.getByText(/Photo check passed!/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Delete' }).click();

  // 4. Sky Toss.
  await page.getByRole('button', { name: 'Play (tap mode)' }).click();
  await tapThrows(page, ['2.1', '1.8', '2.3', '1.9', '2.2', '2.0']);
  await expect(page.getByText(/Step done!/)).toBeVisible({ timeout: 15_000 });

  // 5. Boss.
  await page.getByRole('button', { name: 'Play (tap mode)' }).click();
  const bossJump = page.getByRole('button', { name: 'Jump', exact: true });
  await expect(bossJump).toBeEnabled({ timeout: 10_000 });
  for (let i = 0; i < 30; i++) {
    await page.locator('.pick').nth(i % 2).click();
    await bossJump.click();
  }
  await expect(page.getByRole('heading', { name: 'Quest complete!' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Offline Hero')).toBeVisible();
});

test('Phase 5: a QR ghost from phone A is playable on phone B with no internet', async ({ browser }) => {
  test.setTimeout(150_000);
  // Phone A plays Sky Toss and makes a ghost.
  const a = await browser.newContext();
  const pa = await a.newPage();
  await installOffline(pa, a);
  await pa.goto('/#/setup/sky_toss');
  await pa.getByRole('button', { name: 'Fewer players' }).click();
  await pa.getByRole('textbox', { name: 'Player 1 name' }).fill('Binula');
  await pa.getByRole('button', { name: 'Tap mode' }).click();
  await tapThrows(pa, ['2.1', '2.4', '2.2']);
  await expect(pa.getByRole('heading', { name: 'Binula wins!' })).toBeVisible({ timeout: 15_000 });
  await pa.getByRole('button', { name: 'Binula’s ghost' }).click();
  const url = await pa.getByRole('textbox', { name: 'Share link' }).inputValue();
  expect(url).toMatch(/#\/ghost\/FDG1\./);
  await expect(pa.getByRole('img', { name: /QR code/ })).toBeVisible();

  // Phone B: a different browser, also offline, opens the code.
  const b = await browser.newContext();
  const pb = await b.newPage();
  await installOffline(pb, b);
  await pb.goto(url.replace(/^https?:\/\/[^/]+/, ''));
  await expect(pb.getByRole('heading', { name: 'Binula’s ghost' })).toBeVisible();
  await pb.getByRole('textbox', { name: 'Your name' }).fill('Ama');
  await pb.getByRole('button', { name: 'Race the ghost (tap mode)' }).click();
  await expect(pb.getByText('Binula’s ghost')).toBeVisible();
  await tapThrows(pb, ['2.0', '2.6', '2.3']);
  await expect(pb.getByText('You beat Binula’s ghost!')).toBeVisible({ timeout: 15_000 });
  await a.close();
  await b.close();
});
