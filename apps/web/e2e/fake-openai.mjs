// A tiny fake of the OpenAI endpoints the FieldDay server calls, for e2e tests
// (no real key or network needed).
import { createServer } from 'node:http';

const spec = {
  title: 'Boosted Jump Off',
  one_line_rules: 'Jump as high as you can. Three jumps each. Highest jump wins.',
  players: 1,
  turn_order: 'turns',
  rounds: 3,
  timer_s: 10,
  trackers: ['person', 'feet'],
  scoring: [{ event: 'jump', measure: 'height_m', points: 'measure', once_per_turn: true }],
  turn_end: [{ event: 'jump' }],
  aggregate: 'best',
  win_condition: 'highest',
  referee_style: 'wrestling_hype',
};

createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/responses') {
      const b = JSON.parse(body || '{}');
      const name = b.text?.format?.name;
      const out = name === 'photo_check' ? { passed: true, confidence: 0.9, labels: ['tree'] } : spec;
      res.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(out) }] }] }));
    } else if (req.url === '/v1/realtime/client_secrets') {
      res.end(JSON.stringify({ value: 'ek_fake', expires_at: Math.floor(Date.now() / 1000) + 600 }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
}).listen(Number(process.env.PORT ?? 8799), () => console.log('fake openai ready'));
