/* Home hero: a small convolutional network in 3D. Four feature maps shrink
   toward three output units; a receptive field slides across them, and each
   time it settles a forward pass runs up its pyramid to one lit output. */
const TAU = Math.PI * 2;

// Each map is one unit smaller than the one before it: 2×2 kernels, stride 1.
export const MAPS = [6, 5, 4, 3];
export const OUTPUTS = 3;
export const STEP_SECONDS = 2.4;
const MOVE = .4;    // share of a step spent sliding to the next position
const INTRO = 1.4;  // seconds of fade-in before the field starts to move
const HOP = .1;     // seconds for the forward pass to cross one layer

// Deterministic, so every visit draws the same feature maps.
export function seeded(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function featureMaps(random = seeded(23)) {
  return MAPS.map(g => Array.from({ length: g * g }, () => .15 + .85 * random() ** 1.6));
}

// A serpentine walk over the last map, so the field only ever moves to a neighbour.
const LAST = MAPS[MAPS.length - 1];
export const PATH = Array.from({ length: LAST }, (_, i) =>
  Array.from({ length: LAST }, (_, j) => [i, i % 2 ? LAST - 1 - j : j])).flat();

// The patch of map l that feeds unit (a, b) of the last map.
export const receptiveField = (l, a, b) => ({ i: a, j: b, size: MAPS.length - l });
export const predictedClass = ([a, b]) => (a * 2 + b) % OUTPUTS;

const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

// Where the field is t seconds after it starts moving. It ping-pongs along
// PATH; `since` counts seconds since it settled (negative while sliding).
export function fieldAt(t) {
  const cycle = (PATH.length - 1) * 2;
  const u = Math.max(0, t) / STEP_SECONDS % cycle;
  const step = Math.floor(u);
  const at = (s) => PATH[s < PATH.length ? s : cycle - s];
  const from = at(step), to = at((step + 1) % cycle);
  const f = t <= 0 ? 0 : smooth((u - step) / MOVE);
  const phase = t <= 0 ? 0 : (u - step) * STEP_SECONDS;
  return {
    a: from[0] + (to[0] - from[0]) * f,
    b: from[1] + (to[1] - from[1]) * f,
    from, to, phase,
    since: t <= 0 ? -1 : phase - MOVE * STEP_SECONDS,
  };
}

export function initializeHeroNetwork(canvas, host, {
  reduced, listen, observe, requestAnimationFrame, cancelAnimationFrame, cleanups,
}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const L = MAPS.length;
  const act = featureMaps();
  const cream = (a) => `rgba(243,239,228,${a})`;
  const peach = (a) => `rgba(240,170,132,${a})`;
  const sage = (a) => `rgba(156,195,176,${a})`;
  let w = 0, h = 0;
  let pointerX = .5, pointerY = .5, tiltX = 0, tiltY = 0;
  let running = false, raf = 0, disposed = false;
  let frame = { S: 0, H: 0, F: 1300, cx: 0, cy: 0, narrow: false };
  const t0 = performance.now();

  // Pure camera + layout: where a point of the network lands on the canvas.
  const geometry = ({ S, H, F, cx, cy }, yaw, pitch, roll) => {
    const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const zMax = S / 2 * Math.abs(sinYaw) + H;
    const project = (x, y, z) => {
      const x1 = x * cosYaw + z * sinYaw, z1 = -x * sinYaw + z * cosYaw;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const k = F / (F + z2);
      return { x: cx + (x1 * cr - y2 * sr) * k, y: cy + (x1 * sr + y2 * cr) * k, k, d: Math.min(1, Math.max(0, (zMax - z2) / (2 * zMax))) };
    };
    const layerX = (l) => (l / L - .5) * S; // the outputs sit at l = L
    const half = (l) => H * (1 - l * .17);
    const cell = (l) => 2 * half(l) / MAPS[l];
    const corner = (l, i, j) => project(layerX(l), -half(l) + i * cell(l), -half(l) + j * cell(l));
    const output = (o) => project(layerX(L), (o - (OUTPUTS - 1) / 2) * H * .42, 0);
    return { project, corner, output };
  };
  const ROLL_WIDE = -.26, ROLL_NARROW = -.85, YAW = .58, PITCH = -.2;

  // Wide layouts keep the network in the free space right of the hero text;
  // when the canvas spans the whole hero it is a faint background instead.
  const layout = () => {
    const narrow = w < 520;
    const S = narrow ? Math.min(h * .62, w * 1.3) : Math.min(w * .82, h * .98, 740); // network length
    const H = narrow ? w * .2 : Math.min(w * .18, h * .19, 155);                    // half the input map
    if (narrow) return { S, H, F: 1300, cx: w * .5, cy: h * .6, narrow };
    const cr = canvas.getBoundingClientRect(), hr = host.getBoundingClientRect();
    let left = 0, right = w;
    const content = host.querySelector?.('.hero__content');
    if (content && cr.width < hr.width * .8 && document.createRange) {
      const range = document.createRange();
      range.selectNodeContents(content);
      const textRight = Math.max(0, ...[...range.getClientRects()].map(r => r.right));
      left = Math.max(0, textRight - cr.left) + 24;
      right = w - Math.max(28, (content.getBoundingClientRect().left - hr.left) * .6);
    }
    const { corner, output } = geometry({ S, H, F: 1300, cx: 0, cy: 0 }, YAW, PITCH, ROLL_WIDE);
    const pts = [];
    MAPS.forEach((g, l) => pts.push(corner(l, 0, 0), corner(l, 0, g), corner(l, g, g), corner(l, g, 0)));
    for (let o = 0; o < OUTPUTS; o++) pts.push(output(o));
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
    const top = h * .18, bottom = h * .82;
    const fit = Math.min(1, (right - left) / (maxX - minX), (bottom - top) / (maxY - minY));
    return {
      S: S * fit, H: H * fit, F: 1300 * fit, narrow,
      cx: (left + right) / 2 - (minX + maxX) / 2 * fit,
      cy: (top + bottom) / 2 - (minY + maxY) / 2 * fit,
    };
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (w && h) frame = layout();
    if (!running) draw(performance.now());
  };

  const draw = (now) => {
    // Reduced motion shows one still frame: the field has settled and the pass has reached its output.
    const t = reduced ? INTRO + STEP_SECONDS * 4.9 : (now - t0) / 1000;
    tiltX += (pointerX - .5 - tiltX) * .04;
    tiltY += (pointerY - .5 - tiltY) * .04;
    ctx.clearRect(0, 0, w, h);
    if (!w || !h) return;

    const { narrow } = frame;
    const yaw = YAW + (reduced ? 0 : Math.sin(t * TAU / 28) * .07) + tiltX * .14;
    const { corner, output } = geometry({ ...frame, cx: frame.cx + tiltX * 20, cy: frame.cy + tiltY * 14 }, yaw, PITCH - tiltY * .1, narrow ? ROLL_NARROW : ROLL_WIDE);
    const quad = (p) => { ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.lineTo(p[2].x, p[2].y); ctx.lineTo(p[3].x, p[3].y); ctx.closePath(); };
    const shown = (l) => (reduced ? 1 : smooth((t - l * .18) / .9));
    const live = reduced ? 1 : smooth((t - INTRO + .4) / 1.2);

    const field = fieldAt(t - INTRO);
    const { a: fa, b: fb, since, phase } = field;
    // The forward pass reaches layer l HOP·l seconds after the field settles.
    const pulse = (l) => (since < 0 ? 0 : Math.exp(-(((since - l * HOP) / .14) ** 2)));
    const winner = predictedClass(since < 0 ? field.from : field.to);
    const outGlow = live * (since < 0 ? Math.max(0, 1 - phase / .4) : smooth((since - L * HOP) / .25));

    // Feature maps: cells tinted by their activation, a faint grid and an edge.
    for (let l = 0; l < L; l++) {
      const s = shown(l), g = MAPS[l];
      if (!s) continue;
      for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) {
        quad([corner(l, i, j), corner(l, i, j + 1), corner(l, i + 1, j + 1), corner(l, i + 1, j)]);
        ctx.fillStyle = cream(act[l][i * g + j] * .055 * s);
        ctx.fill();
      }
      ctx.beginPath();
      for (let k = 1; k < g; k++) {
        const p = corner(l, k, 0), q = corner(l, k, g), r = corner(l, 0, k), v = corner(l, g, k);
        ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.moveTo(r.x, r.y); ctx.lineTo(v.x, v.y);
      }
      ctx.strokeStyle = cream(.05 * s); ctx.lineWidth = 1; ctx.stroke();
      quad([corner(l, 0, 0), corner(l, 0, g), corner(l, g, g), corner(l, g, 0)]);
      ctx.strokeStyle = cream(.17 * s); ctx.stroke();
    }

    // Dense head: every unit of the last map feeds every output.
    const outputs = Array.from({ length: OUTPUTS }, (_, o) => output(o));
    const lastUnits = [];
    for (let i = 0; i < LAST; i++) for (let j = 0; j < LAST; j++) lastUnits.push(corner(L - 1, i + .5, j + .5));
    ctx.beginPath();
    for (const u of lastUnits) for (const o of outputs) { ctx.moveTo(u.x, u.y); ctx.lineTo(o.x, o.y); }
    ctx.strokeStyle = sage(.05 * shown(L)); ctx.lineWidth = .7; ctx.stroke();

    // Receptive field: a patch on every map, joined into a pyramid.
    const patch = (l) => { const { size } = receptiveField(l, fa, fb); return [corner(l, fa, fb), corner(l, fa, fb + size), corner(l, fa + size, fb + size), corner(l, fa + size, fb)]; };
    for (let l = 0; l < L; l++) {
      const q = patch(l), glow = pulse(l);
      quad(q);
      ctx.fillStyle = peach((.06 + .08 * glow) * live); ctx.fill();
      ctx.strokeStyle = peach((.5 + .4 * glow) * live); ctx.lineWidth = 1 + glow * .6; ctx.stroke();
      if (l + 1 < L) {
        const r = patch(l + 1);
        ctx.beginPath();
        for (let k = 0; k < 4; k++) { ctx.moveTo(q[k].x, q[k].y); ctx.lineTo(r[k].x, r[k].y); }
        ctx.strokeStyle = peach((.16 + .22 * pulse(l + .5)) * live); ctx.lineWidth = 1; ctx.stroke();
      }
    }
    const focus = corner(L - 1, fa + .5, fb + .5);
    ctx.strokeStyle = peach((.12 + .3 * outGlow) * live); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(focus.x, focus.y); ctx.lineTo(outputs[winner].x, outputs[winner].y); ctx.stroke();

    // Units, back to front; those inside the field are lit.
    const dots = [];
    for (let l = 0; l < L; l++) {
      const g = MAPS[l], { size } = receptiveField(l, fa, fb);
      for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) {
        const inside = Math.max(0, Math.min(i + 1, fa + size) - Math.max(i, fa)) * Math.max(0, Math.min(j + 1, fb + size) - Math.max(j, fb));
        dots.push({ p: corner(l, i + .5, j + .5), s: shown(l), v: act[l][i * g + j], lit: inside * live * (.75 + .25 * pulse(l)) });
      }
    }
    outputs.forEach((p, o) => dots.push({ p, s: shown(L), v: 1, lit: o === winner ? outGlow : 0, out: true }));
    dots.sort((p, q) => p.p.d - q.p.d);
    for (const { p, s, v, lit, out } of dots) {
      if (!s) continue;
      const r = (out ? 2.6 + p.d * 1.6 : .8 + v * 1.3 + p.d * 1.5) * p.k;
      if (lit > .05) {
        const reach = r * (out ? 8 : 5);
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, reach);
        halo.addColorStop(0, peach(.24 * lit));
        halo.addColorStop(1, peach(0));
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(p.x, p.y, reach, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = lit > .05 ? peach((.45 + .5 * lit) * s) : cream((.12 + .45 * p.d + .3 * v) * s);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      if (out) {
        ctx.strokeStyle = cream(.3 * s); ctx.lineWidth = .8;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3.4, 0, TAU); ctx.stroke();
      }
    }
  };

  const loop = (now) => { draw(now); if (running) raf = requestAnimationFrame(loop); };
  const start = () => { if (running || reduced) return; running = true; raf = requestAnimationFrame(loop); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  let onScreen = false;
  const syncAnimation = () => (!document.hidden && onScreen ? start() : stop());
  observe('ResizeObserver', resize).observe(canvas);
  observe('IntersectionObserver', ([en]) => { onScreen = en.isIntersecting; syncAnimation(); }).observe(host);
  listen(document, 'visibilitychange', syncAnimation);
  cleanups.push(() => { disposed = true; stop(); });
  // Text metrics change once the web fonts arrive.
  document.fonts?.ready.then(() => { if (!disposed) resize(); });
  listen(host, 'pointermove', (e) => {
    const r = host.getBoundingClientRect();
    pointerX = (e.clientX - r.left) / r.width;
    pointerY = (e.clientY - r.top) / r.height;
  });
  listen(host, 'pointerleave', () => { pointerX = .5; pointerY = .5; });
  resize();
}
