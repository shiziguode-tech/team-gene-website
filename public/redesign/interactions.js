/* Team Gene — interactions. No dependencies. */
import {createTransitionRunner} from './transitions.js';
import {initializeLightbox} from './lightbox.js';

export function syncHeaderVisibility(header, root, {y, lastY, menuOpen, focused}) {
  if (menuOpen || focused) header.classList.remove('is-hidden');
  else if (y > 320 && y > lastY + 6) header.classList.add('is-hidden');
  else if (y < lastY - 6 || y < 320) header.classList.remove('is-hidden');
  root.style.setProperty('--header-offset', header.classList.contains('is-hidden') ? '0px' : 'var(--header-h)');
}

export default function initializeRedesign() {
  const scope = document.querySelector('.redesign-root');
  if (!scope) return () => {};
  const root = document.documentElement;
  const cleanups = [];
  const frames = new Set(), timers = new Set(), intervals = new Set();
  let disposed = false;
  const listen = (target, event, callback, options) => {
    target.addEventListener(event, callback, options);
    cleanups.push(() => target.removeEventListener(event, callback, options));
  };
  const requestAnimationFrame = callback => {
    const id = window.requestAnimationFrame(time => { frames.delete(id); if (!disposed) callback(time); });
    frames.add(id); return id;
  };
  const cancelAnimationFrame = id => { frames.delete(id); window.cancelAnimationFrame(id); };
  const setTimeout = (callback, delay) => {
    const id = window.setTimeout(() => { timers.delete(id); if (!disposed) callback(); }, delay);
    timers.add(id); return id;
  };
  const clearTimeout = id => { timers.delete(id); window.clearTimeout(id); };
  const setInterval = (callback, delay) => { const id = window.setInterval(callback, delay); intervals.add(id); return id; };
  const observe = (type, callback, options) => {
    const observer = new window[type](callback, options);
    cleanups.push(() => observer.disconnect()); return observer;
  };
  const cleanup = () => {
    disposed = true;
    cleanups.reverse().forEach(fn => fn());
    frames.forEach(id => window.cancelAnimationFrame(id));
    timers.forEach(id => window.clearTimeout(id));
    intervals.forEach(id => window.clearInterval(id));
    root.classList.remove('js', 'is-ready', 'menu-open');
    root.style.removeProperty('--header-offset');
    delete root.dataset.theme;
  };
  try {
  root.classList.add('js');
  try { const theme=localStorage.getItem('tg-theme'); if(['dark','light'].includes(theme)) root.dataset.theme=theme; } catch {}
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  };

  /* ---------- Theme ---------- */
  // Browser UI colour (theme-color) follows a manually chosen theme. Pages with a
  // single fixed colour (the home hero) have no media variants and are left alone.
  const syncThemeColor = () => {
    const theme = root.dataset.theme; if (!theme) return;
    $$('meta[name="theme-color"][media]').forEach((meta) => { meta.content = theme === 'dark' ? '#0c1512' : '#f7f5ef'; });
  };
  syncThemeColor();
  $$('[data-theme-toggle]').forEach((btn) => {
    listen(btn, 'click', () => {
      const apply = () => {
        const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        const next = current === 'dark' ? 'light' : 'dark';
        root.dataset.theme = next; store.set('tg-theme', next); syncThemeColor();
      };
      // Keep the page interactive; existing CSS handles the color transition.
      apply();
    });
  });

  /* ---------- Images: fade in when decoded, fall back to initials on error ---------- */
  $$('.frame img').forEach((img) => {
    const done = () => img.classList.add('is-loaded');
    const fail = () => img.classList.add('is-broken');
    if (img.complete) (img.naturalWidth ? done() : fail());
    else { listen(img, 'load', done, { once: true }); listen(img, 'error', fail, { once: true }); }
  });

  /* ---------- Header: scrolled / hide-on-scroll / tone over dark hero ---------- */
  const header = $('.site-header');
  const hero = $('[data-dark-hero]');
  let lastY = scrollY;
  let ticking = false;

  const onScroll = () => {
    const y = scrollY;
    const menuOpen = root.classList.contains('menu-open');
    header.classList.toggle('is-scrolled', y > 8);
    header.classList.toggle('on-dark', menuOpen || (!!hero && y < hero.offsetHeight - header.offsetHeight));
    syncHeaderVisibility(header, root, {y, lastY, menuOpen, focused: header.contains(document.activeElement)});
    lastY = y;
    ticking = false;
  };
  listen(window, 'scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  // Keyboard users tabbing into the header must always see it.
  listen(header, 'focusin', onScroll);

  /* ---------- Alumni marquee: a focused quote scrolls fully into its row ---------- */
  // Keyboard focus pauses the row and makes it scrollable (site.css); Chrome
  // leaves a card that is only partly visible at the edge where it is. Wait a
  // frame so the browser's own focus scroll does not cancel this one.
  $$('.marquee-row').forEach((row) => {
    listen(row, 'focusin', (e) => {
      const card = e.target;
      if (card.matches(':focus-visible')) requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' }));
    });
    // The animation restarts from its first frame when focus leaves; match it.
    listen(row, 'focusout', (e) => { if (!row.contains(e.relatedTarget)) row.scrollLeft = 0; });
  });

  /* ---------- Nav pill follows hover, rests on the current page ---------- */
  const navEl = $('.nav');
  if (navEl) {
    const navList = $('.nav__list', navEl);
    const pill = $('.nav__pill', navEl);
    const active = $('[aria-current="page"]', navList);
    const moveTo = (el) => {
      if (!el) { pill.style.opacity = '0'; return; }
      pill.style.left = `${el.offsetLeft}px`;
      pill.style.width = `${el.offsetWidth}px`;
      pill.style.opacity = '1';
    };
    // Place instantly on load, then enable the slide.
    pill.style.transition = 'none';
    moveTo(active);
    requestAnimationFrame(() => requestAnimationFrame(() => { pill.style.transition = ''; }));
    $$('.nav__link', navList).forEach((a) => {
      listen(a, 'mouseenter', () => moveTo(a));
      listen(a, 'focus', () => moveTo(a));
    });
    listen(navList, 'mouseleave', () => moveTo(active));
    document.fonts?.ready.then(() => { if (!disposed) moveTo(active); });
    listen(window, 'resize', () => moveTo(active));
  }

  /* ---------- Mobile menu ---------- */
  const menuBtn = $('.menu-toggle');
  const menu = $('#menu');
  if (menuBtn && menu) {
    const setOpen = (open) => {
      root.classList.toggle('menu-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      menu.inert = !open;
      background.forEach(el => { el.inert = open; });
      header.classList.remove('is-hidden');
      onScroll();
      if (open) $('.menu__link', menu)?.focus({ preventScroll: true });
    };
    const background = [$('#main'), $('.site-footer')].filter(Boolean);
    cleanups.push(() => { background.forEach(el => { el.inert = false; }); menu.inert = false; });
    menu.inert = true;
    listen(menuBtn, 'click', () => setOpen(!root.classList.contains('menu-open')));
    listen(window, 'keydown', (e) => {
      if (e.key === 'Tab' && root.classList.contains('menu-open')) {
        const focusable = [menuBtn, ...$$('a[href], button:not([disabled])', menu)].filter(el => el.getClientRects().length);
        const index = focusable.indexOf(document.activeElement);
        const next = e.shiftKey ? index - 1 : index + 1;
        if (index < 0 || next < 0 || next >= focusable.length) { e.preventDefault(); focusable[e.shiftKey ? focusable.length - 1 : 0]?.focus(); }
      }
      if (e.key === 'Escape' && root.classList.contains('menu-open')) { setOpen(false); menuBtn.focus(); } });
    listen(matchMedia('(min-width: 1181px)'), 'change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ---------- Scroll reveal ---------- */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduced) {
    const io = observe('IntersectionObserver', (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- Count up ---------- */
  const counters = $$('[data-count]');
  const runCount = (el) => {
    const to = Number(el.dataset.count);
    const pad = el.dataset.pad ? Number(el.dataset.pad) : 0;
    const fmt = (n) => String(n).padStart(pad, '0');
    if (reduced) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const dur = 1400;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(2, -10 * p);
      el.textContent = fmt(Math.round(to * (p === 1 ? 1 : e)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (counters.length) {
    const io = observe('IntersectionObserver', (entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { runCount(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach((el) => io.observe(el));
  }

  /* ---------- Pointer spotlight ---------- */
  if (matchMedia('(hover: hover)').matches) {
    $$('.spot').forEach((el) => {
      listen(el, 'pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
  }

  /* ---------- Hero ---------- */
  const heroEl = $('.hero');
  if (heroEl) {
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-ready')));
    const words = $$('.hero__words span', heroEl);
    if (words.length) {
      let i = 0;
      words[0].classList.add('is-on');
      if (!reduced) setInterval(() => {
        words[i].classList.remove('is-on');
        i = (i + 1) % words.length;
        words[i].classList.add('is-on');
      }, 2200);
    }
    const canvas = $('.hero__canvas', heroEl);
    if (canvas) helix(canvas, heroEl);
  } else {
    root.classList.add('is-ready');
  }

  /* DNA double helix, rendered as a point cloud with base-pair rungs and a few
     drifting "neurons" that link to nearby nodes. Pauses offscreen. */
  function helix(canvas, host) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, dpr = 1;
    const N = 56;                 // base pairs
    const TURNS = 2.6;
    const cream = (a) => `rgba(243,239,228,${a})`;
    const clay = (a) => `rgba(233,158,120,${a})`;
    const sage = (a) => `rgba(156,195,176,${a})`;
    const motes = Array.from({ length: 34 }, () => ({
      x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .00018, vy: -(.00008 + Math.random() * .00022), r: .6 + Math.random() * 1.4,
    }));
    let pointerX = 0.5, pointerY = 0.5, tiltX = 0, tiltY = 0;
    let running = false, raf = 0, t0 = performance.now();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) draw(performance.now());
    };

    const draw = (now) => {
      const t = (now - t0) / 1000;
      const grow = reduced ? 1 : 1 - Math.pow(1 - Math.min(1, t / 2.2), 3);
      tiltX += (pointerX - .5 - tiltX) * .04;
      tiltY += (pointerY - .5 - tiltY) * .04;

      ctx.clearRect(0, 0, w, h);
      const narrow = w < 520;
      const cx = w * (narrow ? .5 : .52) + tiltX * 30;
      const cy = h * .5 + tiltY * 20;
      const R = Math.min(w * .26, 150) * grow;
      const L = Math.min(h * 1.05, 1000);
      const ang = -0.42 + tiltX * .18;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const spin = t * .32;

      const A = [], B = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const s = (u - .5) * L;
        const ph = u * TURNS * Math.PI * 2 + spin;
        for (const [arr, off] of [[A, 0], [B, Math.PI]]) {
          const lx = R * Math.cos(ph + off);
          const z = Math.sin(ph + off);
          arr.push({ x: cx + lx * ca - s * sa, y: cy + lx * sa + s * ca, z, a: off === 0 });
        }
      }

      // Rungs (base pairs)
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i += 2) {
        const a = A[i], b = B[i];
        const depth = (a.z + b.z + 2) / 4;
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, cream(.05 + depth * .22));
        g.addColorStop(1, clay(.05 + depth * .26));
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      // Backbones
      for (const [arr, col] of [[A, cream], [B, clay]]) {
        for (let i = 1; i < arr.length; i++) {
          const p = arr[i - 1], q = arr[i];
          ctx.strokeStyle = col(.08 + ((p.z + q.z + 2) / 4) * .4);
          ctx.lineWidth = .6 + ((p.z + 1) / 2) * 1.1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }

      // Motes + synapses
      const nodes = A.concat(B);
      for (const m of motes) {
        if (!reduced && running) {
          m.x += m.vx; m.y += m.vy;
          if (m.y < -.05) { m.y = 1.05; m.x = Math.random(); }
          if (m.x < -.05) m.x = 1.05; else if (m.x > 1.05) m.x = -.05;
        }
        const mx = m.x * w, my = m.y * h;
        for (let k = 0; k < nodes.length; k += 3) {
          const n = nodes[k];
          const dx = n.x - mx, dy = n.y - my;
          const d2 = dx * dx + dy * dy;
          if (d2 < 7000) {
            ctx.strokeStyle = sage((1 - d2 / 7000) * .28 * grow);
            ctx.lineWidth = .7;
            ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(n.x, n.y); ctx.stroke();
          }
        }
        ctx.fillStyle = sage(.5);
        ctx.beginPath(); ctx.arc(mx, my, m.r, 0, Math.PI * 2); ctx.fill();
      }

      // Nodes, back to front
      nodes.sort((p, q) => p.z - q.z);
      for (const n of nodes) {
        const depth = (n.z + 1) / 2;
        const r = (1.2 + depth * 2.6) * (0.6 + grow * .4);
        ctx.fillStyle = n.a ? cream(.18 + depth * .8) : clay(.2 + depth * .8);
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
        if (depth > .86) {
          ctx.fillStyle = n.a ? cream(.08) : clay(.1);
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
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
    cleanups.push(stop);
    listen(host, 'pointermove', (e) => {
      const r = host.getBoundingClientRect();
      pointerX = (e.clientX - r.left) / r.width;
      pointerY = (e.clientY - r.top) / r.height;
    });
    listen(host, 'pointerleave', () => { pointerX = .5; pointerY = .5; });
    resize();
    if (reduced) draw(t0 + 10000);
  }

  /* ---------- Alumni directory ---------- */
  const dir = $('[data-alumni]');
  if (dir) {
    // Only snapshot the results, so search/year controls remain clickable.
    // Older browsers without element-scoped transitions update immediately.
    const transitions = createTransitionRunner(dir, {enabled: !reduced});
    cleanups.push(() => transitions.dispose());
    const cards = $$('.alum', dir);
    const groups = $$('.year-group', dir);
    const chips = $$('.filter');
    const search = $('#alumni-q');
    const clear = $('.search__clear');
    const count = $('.result-count');
    const empty = $('.empty');
    const params = new URLSearchParams(location.search);
    const knownYears = new Set(chips.map(ch => ch.dataset.year));
    let year = knownYears.has(params.get('year')) ? params.get('year') : 'all';
    let q = params.get('q') || search.value || '';
    search.value = q;

    const apply = () => {
      const needle = q.trim().toLowerCase();
      let shown = 0;
      cards.forEach((c) => {
        const ok = (year === 'all' || c.dataset.year === year) && (!needle || c.dataset.search.includes(needle));
        c.hidden = !ok;
        if (ok) shown++;
      });
      groups.forEach((g) => {
        const visible = $$('.alum:not([hidden])', g).length; g.hidden = !visible;
        const label = $('[data-year-count]', g);
        if (label) label.textContent = `${label.dataset.prefix}${visible} 位`;
      });
      chips.forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.year === year)));
      count.textContent = `${String(shown).padStart(2, '0')} / ${cards.length} 位`;
      empty.hidden = shown !== 0;
      clear.hidden = !q;
      const p = new URLSearchParams();
      if (year !== 'all') p.set('year', year);
      if (needle) p.set('q', q.trim());
      history.replaceState(null, '', location.pathname + (p.toString() ? `?${p}` : '') + location.hash);
    };

    // Portraits already have stable transition names; use those when filtering.
    const animated = (fn) => transitions.run(fn);

    const strip = $('.chips');
    const toolbar = $('.toolbar');
    // If the user is deep in the list, bring the (shorter) results up under the toolbar.
    const toResults = () => {
      const top = dir.getBoundingClientRect().top + scrollY - toolbar.offsetHeight - header.offsetHeight;
      if (scrollY > top) scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    };
    chips.forEach((ch) => listen(ch, 'click', () => {
      if (year === ch.dataset.year) return;
      year = ch.dataset.year;
      animated(apply);
      toResults();
      // Scroll only the chip strip; scrollIntoView would also move the page.
      strip.scrollTo({ left: ch.offsetLeft - strip.offsetLeft - (strip.clientWidth - ch.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
    }));
    let deb;
    listen(search, 'input', () => { q = search.value; clearTimeout(deb); deb = setTimeout(apply, 90); });
    listen(clear, 'click', () => { q = ''; search.value = ''; apply(); search.focus(); });
    $$('[data-reset]').forEach((b) => listen(b, 'click', () => { q = ''; search.value = ''; year = 'all'; animated(apply); }));
    listen(window, 'keydown', (e) => {
      if (e.key === '/' && document.activeElement !== search && !/input|textarea/i.test(document.activeElement?.tagName)) { e.preventDefault(); search.focus(); }
    });
    listen(window, 'popstate', () => {
      const current = new URLSearchParams(location.search);
      year = knownYears.has(current.get('year')) ? current.get('year') : 'all';
      q = current.get('q') || ''; search.value = q; apply();
    });
    apply();
  }

  /* ---------- Lightbox: one gallery with bounded neighbor preloads ---------- */
  initializeLightbox($('#lightbox'), $$('[data-zoom]'), {listen, schedule: setTimeout});

  /* ---------- Reading progress ---------- */
  const prog = $('.progress');
  const article = $('[data-progress]');
  if (prog && article) {
    const upd = () => {
      const r = article.getBoundingClientRect();
      const total = r.height - innerHeight * .6;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
      prog.style.setProperty('--p', p.toFixed(4));
    };
    let queued = false; // at most one update per frame
    listen(window, 'scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; upd(); }); } }, { passive: true });
    upd();
  }

  /* ---------- TOC scrollspy ---------- */
  const toc = $('.toc');
  if (toc) {
    const links = $$('a', toc);
    const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
    const io = observe('IntersectionObserver', (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          links.forEach((a) => a.classList.remove('is-active'));
          byId.get(en.target.id)?.classList.add('is-active');
        }
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    links[0]?.classList.add('is-active');
  }

  /* ---------- Toast ---------- */
  const toast = (msg) => {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg><span></span>';
      document.body.append(el);
    }
    $('span', el).textContent = msg;
    requestAnimationFrame(() => el.classList.add('is-on'));
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-on'), 4200);
  };

  /* ---------- Mail signup: existing production API ---------- */
  const form = $('#mail-form');
  if (form) {
    const LOCAL = /^(?!.*\.\.)(?:[a-z0-9]|[a-z0-9][a-z0-9._-]{0,30}[a-z0-9])$/;
    const f = (name) => form.elements[name];
    const fieldOf = (input) => input.closest('.field');
    const preview = $('#addr-preview');
    const meter = $('.strength', form);
    const meterLabel = $('#strength-text');
    const touched = new Set();

    const rules = {
      nickname: (v) => (v.trim() ? '' : '请填写论坛昵称'),
      local: (v) => (!v ? '请填写邮箱账号' : LOCAL.test(v) ? '' : '仅限 1–32 位小写字母、数字、点、下划线或连字符，且不能以标点开头或结尾'),
      password: (v) => (v.length >= 12 && v.length <= 128 && /[^\s]/.test(v) && !/[\r\n\u0000]/.test(v) ? '' : '密码需为 12–128 位，不能全为空格或包含换行'),
      confirm: (v) => (!v ? '请再次输入密码' : v === f('password').value ? '' : '两次输入的密码不一致'),
    };
    const check = (name, show) => {
      const input = f(name);
      const msg = rules[name](input.value);
      const field = fieldOf(input);
      const visible = show || touched.has(name);
      field.classList.toggle('is-invalid', visible && !!msg);
      field.classList.toggle('is-valid', !msg && !!input.value);
      input.setAttribute('aria-invalid', String(visible && !!msg));
      $('.field__error span', field).textContent = msg;
      return !msg;
    };
    // 0 empty · 1 too short / weak · 2–4 by character variety once ≥ 12 long
    const strength = (v) => {
      if (!v) return 0;
      if (v.length < 12) return 1;
      return 1 + [/[a-z]/.test(v) && /[A-Z]/.test(v), /\d/.test(v), /[^A-Za-z0-9]/.test(v)].filter(Boolean).length;
    };

    listen(f('local'), 'input', (e) => {
      const lower = e.target.value.toLowerCase();
      if (lower !== e.target.value) e.target.value = lower;
      $('b', preview).textContent = lower || 'your.name';
      check('local');
    });
    listen(f('password'), 'input', (e) => {
      const lvl = strength(e.target.value);
      meter.dataset.level = String(lvl);
      meterLabel.textContent = ['未填写', e.target.value.length < 12 ? '太短' : '一般', '良好', '较强', '很强'][lvl];
      check('password');
      if (f('confirm').value) check('confirm');
    });
    ['nickname', 'confirm'].forEach((n) => listen(f(n), 'input', () => check(n)));
    Object.keys(rules).forEach((n) => listen(f(n), 'blur', () => { if (f(n).value) touched.add(n); check(n); }));

    $$('[data-toggle-pw]', form).forEach((b) => listen(b, 'click', () => {
      const input = f(b.dataset.togglePw);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(show));
      b.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    }));

    listen(form, 'submit', async (e) => {
      e.preventDefault();
      const names = Object.keys(rules);
      names.forEach((n) => touched.add(n));
      const ok = names.map((n) => check(n, true)).every(Boolean);
      if (!ok) {
        form.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }
      const button = form.querySelector('[type="submit"]');
      if (button.disabled) return;
      const result = document.getElementById('mail-result');
      result.hidden = true;
      button.disabled = true;
      const label = button.innerHTML;
      button.textContent = '正在开通…';
      try {
        const response = await fetch('/api/mail/signup', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:f('local').value,displayName:f('nickname').value,password:f('password').value,confirmation:f('confirm').value,website:''})});
        const data = await response.json().catch(() => { throw new Error('邮箱服务暂时无法响应，请稍后重试。'); });
        if (!response.ok || !data.success) throw new Error(data.error || '申领失败，请稍后重试。');
        result.removeAttribute('data-error');
        result.setAttribute('role','status');
        result.replaceChildren();
        const title = document.createElement('strong'); title.textContent = '邮箱与论坛账号已开通';
        const address = document.createElement('p'); address.textContent = data.emailAddress || f('local').value+'@team-gene.com';
        result.append(title,address);
        for (const [href,text] of [['/forum','进入团队论坛'],['https://mail.team-gene.com/','打开网页版邮箱']]) {
          const link = document.createElement('a'); link.href=href;link.textContent=text;link.className='btn btn--forest btn--block';result.append(link);
        }
        form.reset(); form.hidden = true;
      } catch(error) {
        result.dataset.error='true';result.setAttribute('role','alert');result.textContent=error instanceof Error?error.message:'申领失败，请稍后重试。';
      } finally {
        result.hidden=false;button.disabled=false;button.innerHTML=label;result.scrollIntoView({block:'nearest',behavior:reduced?'auto':'smooth'});
      }
    });
  }

  /* ---------- Back to top ---------- */
  $$('[data-top]').forEach((b) => listen(b, 'click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })));
  } catch (error) { cleanup(); throw error; }
  return cleanup;
}
