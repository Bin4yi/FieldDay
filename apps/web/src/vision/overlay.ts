import { SKELETON, type VisionFrame, type Zone } from '@fieldday/vision';

const PLAYER = ['#FFE600', '#FF4D3D', '#2BD96B', '#3DB8FF', '#FF7AD9', '#FF9A1F', '#B58CFF', '#FFFFFF'];

/** Draw skeletons, the ball trail, zones and the throw line over the video. */
export function drawOverlay(
  canvas: HTMLCanvasElement,
  frame: VisionFrame | null,
  opts: { assignment?: number[]; trail?: { x: number; y: number }[]; zones?: Zone[]; lineY?: number | null },
) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !frame) return;
  if (canvas.width !== frame.width || canvas.height !== frame.height) {
    canvas.width = frame.width;
    canvas.height = frame.height;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lw = Math.max(3, frame.width / 120);

  for (const z of opts.zones ?? []) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = 'rgba(255,230,0,0.25)';
    ctx.fillRect(z.box.x, z.box.y, z.box.w, z.box.h);
    ctx.strokeRect(z.box.x, z.box.y, z.box.w, z.box.h);
    ctx.font = `bold ${lw * 6}px sans-serif`;
    ctx.fillStyle = '#FFE600';
    ctx.strokeText(z.name.toUpperCase(), z.box.x + 6, z.box.y - 8);
    ctx.fillText(z.name.toUpperCase(), z.box.x + 6, z.box.y - 8);
  }

  if (opts.lineY != null) {
    ctx.setLineDash([lw * 4, lw * 3]);
    ctx.strokeStyle = '#FF4D3D';
    ctx.lineWidth = lw * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, opts.lineY);
    ctx.lineTo(frame.width, opts.lineY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  frame.poses.forEach((lm, i) => {
    const colour = PLAYER[(opts.assignment?.[i] ?? i) % PLAYER.length]!;
    ctx.lineCap = 'round';
    for (const [a, b] of SKELETON) {
      const p = lm[a];
      const q = lm[b];
      if (!p || !q) continue;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = lw * 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
      ctx.strokeStyle = colour;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  });

  const trail = opts.trail ?? [];
  trail.forEach((p, i) => {
    ctx.fillStyle = `rgba(255,230,0,${(i + 1) / trail.length})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, lw * 1.2, 0, Math.PI * 2);
    ctx.fill();
  });
  if (frame.ball) {
    const b = frame.ball.box;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = lw * 1.5;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#FFE600';
    ctx.lineWidth = lw * 0.7;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
}
