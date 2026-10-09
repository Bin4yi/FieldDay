import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const clips = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
p.on('console', (m) => m.type() === 'error' && console.log('console', m.text().slice(0, 200)));
await p.goto('http://localhost:8766/track.html');
await p.waitForFunction(() => window.ready);
for (const c of clips) {
  const t0 = Date.now();
  const res = await p.evaluate(([c]) => window.run(c, 240), [c]);
  writeFileSync(`out_${c}.json`, JSON.stringify(res));
  console.log(c, res.length, 'frames', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'poses in frame 1:', res[0].poses.length, 'ball frames:', res.filter((f) => f.objects.some((o) => o.label === 'sports ball')).length);
}
await b.close();
