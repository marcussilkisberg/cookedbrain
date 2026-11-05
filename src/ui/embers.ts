/** A short burst of sparks on the results screen. Never runs during a round. */
export function embers(canvas: HTMLCanvasElement, count: number) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = (canvas.width = innerWidth * dpr);
  const h = (canvas.height = innerHeight * dpr);
  const sparks = Array.from({ length: count }, () => ({
    x: w * (0.08 + Math.random() * 0.5),
    y: h * (0.2 + Math.random() * 0.3),
    vx: (Math.random() - 0.5) * 2.4 * dpr,
    vy: -(1.4 + Math.random() * 4.2) * dpr,
    life: 0.5 + Math.random() * 0.7,
    r: (0.8 + Math.random() * 1.8) * dpr,
  }));
  const start = performance.now();
  let prev = start;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    ctx.clearRect(0, 0, w, h);
    let alive = false;
    for (const s of sparks) {
      s.life -= dt;
      if (s.life <= 0) continue;
      alive = true;
      s.x += s.vx;
      s.y += s.vy;
      s.vy *= 0.985;
      ctx.globalAlpha = Math.min(1, s.life * 2);
      ctx.fillStyle = s.life > 0.45 ? '#FFD9A0' : '#FF7A33';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.3);
      ctx.fill();
    }
    if (alive) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(tick);
}
