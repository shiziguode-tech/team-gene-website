import {site, nav, mailNav, pages, focus} from './config.mjs';

// Each request gets its own immutable CMS snapshot; no shared render state.
export function createRedesign(items) {
/* ---------- helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const media = (asset) => site.mediaBase + encodeURIComponent(typeof asset === 'string' ? asset : asset?.key || '');
const zoomMedia = (asset) => media(asset) + (/\.(?:jpg|png|webp|avif)$/i.test(typeof asset === 'string' ? asset : asset?.key || '') ? '?w=1600' : '');
// Resized WebP renditions (/api/media/<key>?w=…) let the browser fetch a
// thumbnail instead of the full upload; the original stays in src as fallback.
// GIFs keep their animation, so they are not resized.
const VARIANT_WIDTHS = [320, 640, 960, 1600];
const responsive = (asset, sizes) => {
  const key = typeof asset === 'string' ? asset : asset?.key || '';
  return sizes && /\.(?:jpg|png|webp|avif)$/i.test(key) ? ` srcset="${VARIANT_WIDTHS.map((w) => `${media(key)}?w=${w} ${w}w`).join(', ')}" sizes="${sizes}"` : '';
};
const entryHref = (entry) => `/${entry.section}/${encodeURIComponent(entry.slug || entry.id)}`;
const portrait = (entry) => entry.media?.find(asset => asset.type === 'image');
const lines = (s) => String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
// Research fields may contain hard-wrapped English pasted from PDFs. Explicit
// paragraphs, list items, Chinese lines and ordinary hyphens remain intact.
// Only a soft hyphen explicitly marks a removable word-breaking hyphen.
const reflow = (body) => String(body ?? '').split(/\n\s*\n/).flatMap(block => lines(block).reduce((out, l) => {
  const prev = out[out.length - 1];
  // "1." and "a)" mark items only before a space, so "4.0%" can continue a line.
  const startsItem = /^(?:\((?:\d+|[a-z]|[ivxlcdm]+)\)|(?:\d+|[a-z]|[ivxlcdm]+)(?:[.)](?:\s|$)|[、．])|[-*•]\s)/i.test(l);
  // Lowercase text continues a word, number or bracket ("(PLMs)\nhave"); a
  // number continues only a clause that stopped mid-sentence ("by\n4.0%").
  const continues = prev !== undefined && ((/[A-Za-z0-9,;\-()\]%\u00ad]$/.test(prev) && /^[a-z(]/.test(l)) || (/[a-z,]$/.test(prev) && /^\d/.test(l)));
  if (continues && !startsItem && !/\p{Script=Han}/u.test(prev + l)) {
    out[out.length - 1] = prev.endsWith('\u00ad') ? prev.slice(0, -1) + l : /[A-Za-z]-$/.test(prev) ? prev + l : `${prev} ${l}`;
  } else out.push(l);
  return out;
}, []));
// Chinese display text (headings, result labels) breaks between words, not
// inside them: [data-ph] sets word-break: keep-all and <wbr> marks the allowed
// breaks, before words of two or more characters and after punctuation. A
// single character stays with the word before it, so 始于, 准确率 and names
// never split; an over-long run still wraps at the edge (overflow-wrap).
const zhWords = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh-Hans', { granularity: 'word' }) : null;
const HAN = /\p{Script=Han}/u;
const wordBreaks = (text) => {
  if (!zhWords || !HAN.test(text)) return text;
  const parts = [...zhWords.segment(text)].map((s) => s.segment);
  return parts.map((s, i) => {
    const next = parts[i + 1];
    const open = next && HAN.test(next[0]) && (/[，、；：。！？]$/.test(s) || (next.length > 1 && HAN.test(s.at(-1))));
    return open ? `${s}<wbr>` : s;
  }).join('');
};
const phrased = (html) => html.replace(/<(h[1-3])(\s[^>]*)?>([\s\S]*?)<\/\1>/g, (whole, tag, attrs = '', inner) =>
  /hero__title/.test(attrs) || !HAN.test(inner) ? whole : `<${tag}${attrs} data-ph>${inner.split(/(<[^>]*>)/).map((part) => (part.startsWith('<') ? part : wordBreaks(part))).join('')}</${tag}>`);
const bySection = (s) => items.filter((i) => i.section === s);
const byDateDesc = (a, b) => b.date.localeCompare(a.date);
const dateParts = (d) => { const [y, m, day] = d.split('-'); return { y, m, day, ym: `${y}.${m}` }; };
const initials = (name) => (name.length > 2 ? name.slice(-2) : name);
const tone = (name) => [...name].reduce((a, c) => a + c.codePointAt(0), 0) % 4;
const splitVenue = (tag) => { const m = /^(.*?)\s*[（(](.*?)[）)]\s*$/.exec(tag || ''); return m ? [m[1], m[2]] : [tag, '']; };
const NOTE = /(此为示例[^。]*。)$/;

const ICONS = {
  arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  zoom: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M14.12 14.12a3 3 0 1 1-4.24-4.24M2 2l20 20"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  drive: '<path d="M22 12H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
};
const icon = (name, cls = '') => `<svg class="icon${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const logo = `<svg class="brand__mark" viewBox="0 0 40 40" aria-hidden="true">
  <circle class="ring" cx="20" cy="20" r="18.5" fill="none" stroke-width="1"/>
  <g transform="rotate(-28 20 20)"><ellipse class="orbit" cx="20" cy="20" rx="19.5" ry="6.5" fill="none" stroke-width="1"/></g>
  <text x="20" y="27.6" text-anchor="middle" font-size="22">G</text>
</svg>`;

/* ---------- derived content ---------- */
const members = bySection('members');
const teachers = members.filter((m) => m.tag === '教师');
const students = members.filter((m) => m.tag !== '教师');
const teacher = teachers[0];
const alumniRaw = bySection('alumni');
const years = [...new Set(alumniRaw.map((a) => a.graduationYear))].sort((a, b) => a === '其他' ? 1 : b === '其他' ? -1 : Number(b) - Number(a));
const alumni = years.flatMap((y) => alumniRaw.filter((a) => a.graduationYear === y)); // year desc, CMS order within
const research = bySection('research').sort(byDateDesc);
const rules = bySection('rules');
const news = bySection('news').sort(byDateDesc);
const life = bySection('life').sort(byDateDesc);
const awards = bySection('awards');
// Record sections without any entries are left out of the navigation (their
// pages still work and say so), so visitors do not open an empty page.
const OPTIONAL_SECTIONS = { awards, life, news };
const shownNav = nav.filter((n) => !(n.key in OPTIONAL_SECTIONS) || OPTIONAL_SECTIONS[n.key].length > 0);
const navItem = (key) => shownNav.find((n) => n.key === key);

const parseTeacher = (t) => {
  const out = { areas: [], motto: '', paras: [] };
  for (const l of lines(t.body)) {
    if (l.startsWith('研究方向：')) out.areas = l.slice(5).replace(/。$/, '').split(/[、,，与和]/).map((s) => s.trim()).filter(Boolean);
    else if (l.startsWith('指导理念：')) out.motto = l.slice(5);
    else out.paras.push(l);
  }
  return out;
};
const T = parseTeacher(teacher || {body:''});

const voiceExcerpt = (msg) => lines(msg).find((l) => !/[：:]$/.test(l)) || '';

/* ---------- shell ---------- */
const header = (key, darkHero) => `
<header class="site-header${darkHero ? ' on-dark' : ''}">
  <div class="wrap site-header__inner">
    <a class="brand" href="/" aria-label="Team Gene 首页">${logo}<span class="brand__text"><span class="brand__name">TEAM GENE</span><span class="brand__sub">CS &amp; AI RESEARCH GROUP</span></span></a>
    <nav class="nav" aria-label="主导航">
      <span class="nav__pill" aria-hidden="true"></span>
      <ul class="nav__list">
        ${shownNav.map((n) => `<li><a class="nav__link" href="${n.href}"${n.key === key ? ' aria-current="page"' : ''}>${n.label}</a></li>`).join('')}
        <li><a class="nav__link nav__link--mail" href="${mailNav.href}"${key === 'mail' ? ' aria-current="page"' : ''}>${icon('mail')}<span>${mailNav.label}</span></a></li>
      </ul>
    </nav>
    <div class="header-actions">
      <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="切换深浅色主题">${icon('sun', 'i-sun')}${icon('moon', 'i-moon')}</button>
      <button class="icon-btn menu-toggle" type="button" aria-controls="menu" aria-expanded="false" aria-label="打开菜单"><span></span><span></span></button>
    </div>
  </div>
</header>
<div class="menu" id="menu">
  <nav aria-label="站点菜单">
    <ol class="menu__list">
      ${[...shownNav, mailNav].map((n, i) => `<li><a class="menu__link" style="--i:${i}" href="${n.href}"${n.key === key ? ' aria-current="page"' : ''}><span class="menu__num">${pad(i + 1)}</span><span class="menu__label">${n.label}</span><span class="menu__en">${n.en}</span></a></li>`).join('')}
    </ol>
  </nav>
  <div class="menu__foot">
    <a class="btn btn--ghost-light btn--sm" href="${site.appOrigin}/forum">${icon('message')}团队论坛</a>
    <a class="btn btn--ghost-light btn--sm" href="${site.webmail}">${icon('mail')}网页版邮箱</a>
  </div>
</div>`;

const footer = () => {
  const cols = [
    ['TEAM', ['home', 'members', 'alumni'].map(navItem).filter(Boolean)],
    ['RESEARCH', ['research', 'awards'].map(navItem).filter(Boolean)],
    ['LIFE', ['life', 'news', 'rules'].map(navItem).filter(Boolean)],
    ['COMMUNITY', [mailNav, { href: `${site.appOrigin}/forum`, label: '团队论坛', ext: true }, { href: site.webmail, label: '网页版邮箱', ext: true }]],
  ];
  return `
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div>
        <p class="footer-tagline">思想相遇，<br><em>智能生长。</em></p>
        <p class="footer-note">Team Gene 是专注于计算机科学与人工智能的科研团队，在开放的交流与扎实的探索中，把想法变成新的可能。</p>
      </div>
      <div class="footer-cols">
        ${cols.map(([h, links]) => `<div class="footer-col"><h2>${h}</h2><ul>${links.map((l) => `<li><a href="${l.href}">${l.label}${l.ext ? icon('external') : ''}</a></li>`).join('')}</ul></div>`).join('')}
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 Team Gene · 计算机科学与人工智能</span>
      <nav aria-label="页脚">
        <a href="${site.appOrigin}/admin">内容管理</a>
        <button type="button" class="to-top" data-top>回到顶部 ${icon('arrowUp')}</button>
      </nav>
    </div>
  </div>
  <div class="footer-wordmark" aria-hidden="true">Team Gene</div>
</footer>`;
};

// One image viewer per page: paper figures and photo galleries ([data-zoom])
// open in it as a single gallery (arrows, swipe, counter; interactions.js).
const lightbox = `<dialog class="lightbox" id="lightbox" aria-label="图片预览">
  <figure class="lightbox__stage"><img alt=""><figcaption class="lightbox__caption"><span class="lightbox__title"></span><span class="lightbox__meta"><span class="lightbox__count" aria-live="polite"></span><a class="lightbox__original" target="_blank" rel="noopener" hidden>查看原图 ${icon('external')}</a></span></figcaption></figure>
  <button type="button" class="lightbox__nav lightbox__nav--prev" data-lb-prev aria-label="上一张">${icon('arrowLeft')}</button>
  <button type="button" class="lightbox__nav lightbox__nav--next" data-lb-next aria-label="下一张">${icon('arrowRight')}</button>
  <button type="button" class="lightbox__close" aria-label="关闭" autofocus>${icon('x')}</button>
</dialog>`;
const layout = ({key, body, darkHero = false}) => ({key, html: `<a class="skip-link" href="#main">跳到正文</a>${header(key,darkHero)}<main id="main">${phrased(body)}</main>${footer()}${body.includes('data-zoom') ? lightbox : ''}`});

const safeLink = (url) => {
  if (typeof url !== 'string' || !url.trim()) return ''; 
  try { const parsed = new URL(url, 'https://team-gene.com'); return ['http:', 'https:'].includes(parsed.protocol) ? esc(parsed.href) : ''; } catch { return ''; }
};
const relatedLink = (entry) => safeLink(entry.url) ? `<p><a class="link-arrow" href="${safeLink(entry.url)}" target="_blank" rel="noopener noreferrer">相关链接 ${icon('external')}</a></p>` : '';
const gallery = (entry, omitAvatar = false) => {
  const avatar = entry.media?.find(asset => asset.type === 'image')?.key;
  const files = (entry.media || []).filter(asset => !omitAvatar || asset.key !== avatar);
  return files.length ? `<div class="cms-gallery">${files.map(asset => `<figure>${asset.type === 'video' ? `<video src="${media(asset)}" controls preload="none"></video>` : `<a href="${media(asset)}" target="_blank" rel="noopener" data-zoom="${media(asset)}${/\.(?:jpg|png|webp|avif)$/i.test(asset.key) ? '?w=1600' : ''}" data-alt="${esc(asset.name)}" data-original="${media(asset)}"><img src="${media(asset)}"${responsive(asset, '(min-width: 900px) 400px, (min-width: 600px) 45vw, 92vw')} alt="${esc(asset.name)}" loading="lazy" decoding="async"></a>`}<figcaption>${esc(asset.name)}</figcaption></figure>`).join('')}</div>` : '';
};

const pageHero = (key, count, unit) => {
  const p = pages[key];
  return `
<header class="page-hero">
  <div class="page-hero__ghost" aria-hidden="true">${esc(p.en)}</div>
  <div class="wrap page-hero__grid">
    <div>
      <p class="eyebrow" data-reveal>Team Gene <span class="sep">/</span> ${esc(p.en)}</p>
      <h1 data-reveal style="--d:1">${esc(p.title)}</h1>
      <p class="page-hero__lede" data-reveal style="--d:2">${esc(p.lede)}</p>
    </div>
    <div class="page-hero__meta" data-reveal style="--d:3">
      ${count ? `<div class="page-hero__count"><span data-count="${count}" data-pad="2">${pad(count)}</span><small>${esc(unit)}</small></div>` : ''}
      <span class="page-hero__status"><span class="live-dot"></span>持续更新</span>
    </div>
  </div>
</header>`;
};

// sizes: the rendered width of the photo, used to pick a resized rendition.
const frame = (key, name, { cls = '', vt = '', lazy = true, alt = name, extra = '', sizes = '' } = {}) =>
  `<div class="frame${cls ? ` ${cls}` : ''}" data-initials="${esc(initials(name))}"${vt ? ` style="view-transition-name:${vt}"` : ''}>${key ? `<img src="${media(key)}"${responsive(key, sizes)} alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">` : ''}${extra}</div>`;

/* ---------- focus glyphs ---------- */
const GLYPHS = {
  ml: (() => {
    const L1 = [16, 32, 48], L2 = [22, 42], L3 = [32];
    let edges = '';
    L1.forEach((a) => L2.forEach((b) => { edges += `M12 ${a} L32 ${b} `; }));
    L2.forEach((b) => L3.forEach((c) => { edges += `M32 ${b} L52 ${c} `; }));
    let n = 0;
    const node = (x, y, accent) => `<circle class="node${accent ? ' fill-accent' : ''}" style="--n:${n++}" cx="${x}" cy="${y}" r="${accent ? 4.5 : 3.6}"/>`;
    return `<svg class="focus-card__glyph glyph glyph--ml" viewBox="0 0 64 64" aria-hidden="true">
      <path d="${edges}" stroke="currentColor" stroke-width="1.1" opacity=".4" fill="none"/>
      <g fill="var(--surface)" stroke="currentColor" stroke-width="1.6">${L1.map((y) => node(12, y)).join('')}${L2.map((y) => node(32, y)).join('')}</g>
      ${node(52, 32, true)}
    </svg>`;
  })(),
  llm: `<svg class="focus-card__glyph glyph glyph--llm" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 10h36a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H28l-12 9v-9h-2a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
      <rect class="tok" style="--n:0" x="15" y="19" width="30" height="4" rx="2" fill="currentColor" opacity=".8"/>
      <rect class="tok" style="--n:1" x="15" y="27" width="34" height="4" rx="2" fill="currentColor" opacity=".55"/>
      <rect class="tok" style="--n:2" x="15" y="35" width="16" height="4" rx="2" fill="currentColor" opacity=".8"/>
      <rect class="caret fill-accent" x="34" y="33.5" width="2.6" height="7" rx="1"/>
    </svg>`,
  cv: `<svg class="focus-card__glyph glyph glyph--cv" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M6 14V8h6M52 8h6v6M58 50v6h-6M12 56H6v-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>
      <path d="M8 32c6-10 14-15 24-15s18 5 24 15c-6 10-14 15-24 15S14 42 8 32z" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <g class="iris">
        <circle cx="32" cy="32" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <rect x="27" y="27" width="4" height="4" class="fill-accent"/><rect x="33" y="27" width="4" height="4" fill="currentColor" opacity=".5"/>
        <rect x="27" y="33" width="4" height="4" fill="currentColor" opacity=".5"/><rect x="33" y="33" width="4" height="4" class="fill-accent" opacity=".7"/>
      </g>
    </svg>`,
  sys: `<svg class="focus-card__glyph glyph glyph--sys" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M24 16V8M32 16V8M40 16V8M24 56v-8M32 56v-8M40 56v-8M16 24H8M16 32H8M16 40H8M56 24h-8M56 32h-8M56 40h-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="16" y="16" width="32" height="32" rx="5" fill="var(--surface)" stroke="currentColor" stroke-width="1.6"/>
      <rect x="25" y="25" width="14" height="14" rx="2.5" class="fill-accent" opacity=".85"/>
      <path class="trace" pathLength="100" d="M4 24h12v8h32v8h12" fill="none" stroke="var(--clay)" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,
};

/* ---------- shared blocks ---------- */
const venueChips = (tag) => {
  const [venue, rank] = splitVenue(tag);
  return `<div class="chip-row" style="margin:0"><span class="chip chip--clay">${esc(venue)}</span>${rank ? `<span class="chip chip--line">${esc(rank)}</span>` : ''}</div>`;
};

const kpis = (p, cls = 'kpis') => (p.highlights?.length
  ? `<div class="${cls}">${p.highlights.map((h) => `<div class="kpi"><strong>${esc(h.value)}</strong><span data-ph>${wordBreaks(esc(h.label))}</span></div>`).join('')}</div>` : '');

// level: heading level of the title, one below the surrounding section heading.
const featurePaper = (p, i = 0, level = 3) => {
  const d = dateParts(p.date);
  const abstract = String(p.researchBackground ?? p.body ?? '').replace(/\s*\n\s*/g, ' ');
  return `
<a class="card feature-paper" href="/research/${encodeURIComponent(p.id)}" data-reveal style="--d:${i}">
  <div class="feature-paper__media">${frame(p.titleImages?.[0], p.title, { alt: `论文首页：${p.title}`, sizes: '(min-width: 900px) 520px, 92vw' })}</div>
  <div class="feature-paper__body">
    ${venueChips(p.tag)}
    <h${level}>${esc(p.title)}</h${level}>
    <p lang="${HAN.test(abstract) ? 'zh-CN' : 'en'}" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(abstract)}</p>
    ${kpis(p)}
    <div class="feature-paper__foot"><span class="meta">${d.ym} · 学术成果</span><span class="arrow-dot">${icon('arrowUpRight')}</span></div>
  </div>
</a>`;
};

const dateBlock = (date) => { const d = dateParts(date); return `<div class="date-block"><strong>${d.day}</strong><span>${d.ym}</span></div>`; };

const renderParas = (paragraphs, noteCls = 't-card__note') => paragraphs.flatMap((l) => {
  const m = NOTE.exec(l);
  if (!m) return [`<p>${esc(l)}</p>`];
  const head = l.slice(0, m.index).trim();
  return [head ? `<p>${esc(head)}</p>` : '', `<p class="${noteCls}">${esc(m[1])}</p>`];
}).join('');
const bodyParas = (body, noteCls = 't-card__note') => renderParas(lines(body), noteCls);

// Keep CMS paragraphs in their original order. A rule may introduce a list,
// interrupt it with an explanation, or continue numbering from an earlier rule.
const ruleBody = (body) => {
  const blocks = [];
  let list = [];
  const flush = () => {
    if (list.length) blocks.push(`<ol start="${list[0].number}">${list.map(({number, text}) => `<li value="${number}" data-rule-number="${number}"><span>${esc(text)}</span></li>`).join('')}</ol>`);
    list = [];
  };
  for (const line of lines(body)) {
    const item = /^(\d+)[.、．]\s*(.*)$/.exec(line);
    if (item) list.push({number: item[1], text: item[2]});
    else { flush(); blocks.push(`<p class="callout">${icon('info')}<span>${esc(line)}</span></p>`); }
  }
  flush();
  return blocks.join('');
};

const timeline = (list) => `<div class="timeline">${list.map((it, i) => `
  <div class="t-item" data-reveal style="--d:${i}">
    ${dateBlock(it.date)}
    <article class="card t-card" id="${encodeURIComponent(it.id)}">
      <div class="chip-row" style="margin:0"><span class="chip chip--clay">${esc(it.tag)}</span></div>
      <h2>${esc(it.title)}</h2>
      ${it.subtitle ? `<p class="t-card__sub">${esc(it.subtitle)}</p>` : ''}
      ${it.body ? `<div class="t-card__body">${bodyParas(it.body)}</div>` : ''}${gallery(it)}${relatedLink(it)}<p><a class="link-arrow" href="/${it.section}/${encodeURIComponent(it.id)}">查看详情 ${icon('arrowRight')}</a></p>
    </article>
  </div>`).join('')}</div>`;

const laurel = (() => {
  // Wreath: leaves sampled along two mirrored cubic curves, drawn with pathLength=1
  const bez = (t, p0, p1, p2, p3) => {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
  };
  const curve = [[60, 104], [34, 98], [18, 76], [24, 40]];
  let out = '', n = 0;
  for (const side of [1, -1]) {
    const c = curve.map(([x, y]) => [60 + (x - 60) * side, y]);
    out += `<path pathLength="1" style="--n:${n++}" d="M${c[0]} C${c[1]} ${c[2]} ${c[3]}"/>`;
    for (let i = 1; i <= 6; i++) {
      const t = i / 7;
      const [bx, by] = bez(t, ...c);
      const [nx, ny] = bez(Math.min(1, t + 0.01), ...c);
      const a = Math.atan2(ny - by, nx - bx) + side * -0.7;
      const len = 13 - i * 0.6, w = 4.2;
      const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
      const mx = (bx + tx) / 2, my = (by + ty) / 2, px = -Math.sin(a) * w, py = Math.cos(a) * w;
      const f = (v) => v.toFixed(1);
      out += `<path pathLength="1" style="--n:${n++}" d="M${f(bx)} ${f(by)}Q${f(mx + px)} ${f(my + py)} ${f(tx)} ${f(ty)}Q${f(mx - px)} ${f(my - py)} ${f(bx)} ${f(by)}Z"/>`;
    }
  }
  out += `<circle pathLength="1" style="--n:${n++}" cx="60" cy="56" r="15"/><path pathLength="1" style="--n:${n++}" d="M60 47l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z"/>`;
  return `<svg class="empty__art" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${out}</svg>`;
})();

/* ---------- pages ---------- */
const homePage = () => {
  const feed = [...news, ...life].sort(byDateDesc).slice(0, 4);
  const rowA = alumni.filter((_, i) => i % 2 === 0);
  const rowB = alumni.filter((_, i) => i % 2 === 1);
  const voice = (a, hidden) => `<a class="voice" href="${entryHref(a)}"${hidden ? ' aria-hidden="true" tabindex="-1"' : ''}>
      <p class="voice__quote">${esc(voiceExcerpt(a.alumniMessage))}</p>
      <div class="voice__who">${frame(portrait(a), a.title, { alt: '', sizes: '38px' })}<div><div class="voice__name">${esc(a.title)}</div><div class="voice__meta">${a.graduationYear === '其他' ? '未填写届别' : a.graduationYear+'届'} · ${esc(a.subtitle)}</div></div></div>
    </a>`;
  const row = (list, rev, dur) => `<div class="marquee-row"><div class="marquee${rev ? ' marquee--rev' : ''}" style="--dur:${dur}s">${list.map((a) => voice(a, false)).join('')}${list.map((a) => voice(a, true)).join('')}</div></div>`;
  const stats = [
    { n: teachers.length, u: '位', l: '指导教师', href: '/members#faculty' },
    { n: students.length, u: '位', l: '学生成员', href: '/members#students' },
    { n: alumni.length, u: '位', l: '校友', href: '/alumni' },
    { n: focus.length, u: '个', l: '核心研究方向', href: '#focus' },
  ];

  return layout({
    key: 'home',
    title: 'Team Gene · 计算机科学与人工智能科研团队',
    description: 'Team Gene 是专注于计算机科学与人工智能的科研团队，在开放的交流与扎实的探索中，把想法变成新的可能。',
    darkHero: true,
    body: `
<section class="hero hero--overlap" data-dark-hero>
  <canvas class="hero__canvas" aria-hidden="true"></canvas>
  <div class="wrap hero__inner">
    <div class="hero__content">
      <p class="eyebrow" data-hero style="--d:0">Team Gene <span class="sep">·</span> Research Group</p>
      <h1 class="hero__title">
        <span class="line"><span style="--d:0">让好奇心生根，</span></span>
        <span class="line"><span style="--d:1">让智能<em>生长<svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M3 8.5C28 3 62 2.5 97 6"/></svg></em>。</span></span>
      </h1>
      <p class="hero__lede" data-hero style="--d:3">Team Gene 是专注于计算机科学与人工智能的科研团队，在开放的交流与扎实的探索中，把想法变成新的可能。</p>
      <div class="hero__ctas" data-hero style="--d:4">
        <a class="btn btn--clay" href="/research">探索我们的研究 ${icon('arrowUpRight')}</a>
        <a class="btn btn--ghost-light" href="/members">认识团队 ${icon('arrowRight', 'icon--right')}</a>
      </div>
    </div>
  </div>
  <div class="wrap hero__bar" data-hero style="--d:6">
    <div class="hero__words" aria-hidden="true"><span>COMPUTE.</span><span>CONNECT.</span><span>CREATE.</span></div>
    <span class="scroll-cue">SCROLL<span class="scroll-cue__line"></span></span>
  </div>
</section>

<div class="wrap">
  <nav class="stats" aria-label="团队概况">
    ${stats.map((s) => `<a class="stat" href="${s.href}"><span class="stat__num"><span data-count="${s.n}" data-pad="2">${pad(s.n)}</span><span class="stat__unit">${s.u}</span></span><span class="stat__label">${s.l}${icon('arrowUpRight')}</span></a>`).join('')}
  </nav>
</div>

<section class="section" id="focus">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div><p class="eyebrow">Our Focus</p><h2>深耕计算，探索智能</h2></div>
      <p class="section-head__aside">从基础问题，到真实世界</p>
    </div>
    <div class="focus-grid">
      ${focus.map((f, i) => `
      <a class="card spot focus-card" href="/research" data-reveal style="--d:${i}">
        <div class="focus-card__top"><span class="focus-card__num">${pad(i + 1)} /</span><span class="arrow-dot">${icon('arrowUpRight')}</span></div>
        ${GLYPHS[f.glyph]}
        <h3>${esc(f.cn)}</h3>
        <p class="focus-card__en">${esc(f.en)}</p>
        <p>${esc(f.desc)}</p>
      </a>`).join('')}
    </div>
  </div>
</section>

${research.length ? `
<section class="section">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div><p class="eyebrow">Latest Research</p><h2>最新成果</h2></div>
      <a class="link-arrow" href="/research">全部成果 ${icon('arrowRight')}</a>
    </div>
    ${featurePaper(research[0])}
  </div>
</section>` : ''}

${teacher ? `<section class="section">
  <div class="wrap advisor">
    <div class="portrait" data-reveal="scale">
      ${frame(portrait(teacher), teacher.title, { alt: `${teacher.title}老师`, sizes: '(min-width: 860px) 420px, 340px' })}
      <div class="portrait__badge"><span class="live-dot"></span>${esc(teacher.subtitle)}</div>
    </div>
    <div data-reveal style="--d:1">
      <p class="eyebrow">Faculty</p>
      <h2 class="advisor__name">${esc(teacher.title)}</h2>
      <p class="advisor__role">${esc(teacher.subtitle)}</p>
      <div class="chip-row">${T.areas.map((a) => `<span class="chip chip--dot">${esc(a)}</span>`).join('')}</div>
      ${T.paras.map((p) => `<p class="advisor__text">${esc(p)}</p>`).join('')}
      ${T.motto ? `<blockquote class="pullquote">${esc(T.motto)}<small>— 指导理念</small></blockquote>` : ''}
      <a class="link-arrow" href="/members">认识全体成员 ${icon('arrowRight')}</a>
    </div>
  </div>
</section>
` : ''}

<section class="section section--tint voices">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div><p class="eyebrow">Alumni Voices</p><h2>${alumni.length} 位校友，从这里出发</h2></div>
      <div class="section-head__aside"><p style="margin-bottom:10px">写给学弟学妹的话，也是写给下一段旅程的信。</p><a class="link-arrow" href="/alumni">全部校友 ${icon('arrowRight')}</a></div>
    </div>
  </div>
  <div data-reveal="fade">
    ${row(rowA, false, 150)}
    ${row(rowB, true, 170)}
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <div><p class="eyebrow">Happening at Gene</p><h2>团队近况</h2></div>
      <a class="link-arrow" href="/news">所有动态 ${icon('arrowRight')}</a>
    </div>
    <div class="feed" data-reveal>
      ${feed.map((it) => `
      <a class="feed__item" href="/${it.section}#${encodeURIComponent(it.id)}">
        ${dateBlock(it.date)}
        <div><span class="chip chip--clay">${esc(it.tag)}</span><h3 class="feed__title">${esc(it.title)}</h3><p class="feed__sub">${esc(it.subtitle)}</p></div>
        <span class="arrow-dot">${icon('arrowUpRight')}</span>
      </a>`).join('')}
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="cta" data-reveal="scale">
      <svg class="cta__orbits" viewBox="0 0 420 420" aria-hidden="true">
        <ellipse cx="210" cy="210" rx="200" ry="72"/>
        <ellipse cx="210" cy="210" rx="72" ry="200"/>
        <ellipse cx="210" cy="210" rx="170" ry="120"/>
        <text x="210" y="252" text-anchor="middle" font-size="120">G</text>
      </svg>
      <div>
        <h2>好的研究，始于一起思考。</h2>
        <p>${teachers.length} 位老师，${students.length} 位学生，一个共同探索的团队。</p>
      </div>
      <div class="cta__ctas">
        <a class="btn btn--clay" href="/members">认识团队成员 ${icon('arrowRight', 'icon--right')}</a>
        <a class="btn btn--ghost-light" href="/mail">${icon('mail')}申领团队邮箱</a>
      </div>
    </div>
  </div>
</section>`,
  });
};

const membersPage = () => layout({
  key: 'members',
  title: '团队成员 | Team Gene',
  description: pages.members.lede,
  body: `
${pageHero('members', members.length, '位同行者')}
<section class="section" id="faculty">
  <div class="wrap">
    <h2 class="block-title" data-reveal>指导教师 <small>FACULTY</small></h2>
    ${teachers.map((t) => {
      const P = parseTeacher(t);
      return `
    <article class="card faculty" data-reveal>
      ${frame(portrait(t), t.title, { lazy: false, alt: `${t.title}老师`, sizes: '(min-width: 760px) 360px, 92vw' })}
      <div class="faculty__body">
        <p class="eyebrow eyebrow--plain eyebrow--cn">${esc(t.subtitle)}</p>
        <h3>${esc(t.title)}</h3>
        <div class="chip-row">${P.areas.map((a) => `<span class="chip chip--dot">${esc(a)}</span>`).join('')}</div>
        ${P.paras.map((p) => `<p>${esc(p)}</p>`).join('')}
        ${P.motto ? `<blockquote class="pullquote">${esc(P.motto)}<small>— 指导理念</small></blockquote>` : ''}<a class="link-arrow" href="${entryHref(t)}">查看个人资料 ${icon('arrowUpRight')}</a>
      </div>
    </article>`;
    }).join('')}
  </div>
</section>
<section class="section" id="students">
  <div class="wrap">
    <h2 class="block-title" data-reveal>学生成员 <small>STUDENTS / ${pad(students.length)}</small></h2>
    <div class="people-grid">
      ${students.map((s, i) => {
        const showBody = s.body && s.body !== s.subtitle && s.body !== s.tag;
        const showTag = s.tag && s.tag !== s.subtitle;
        return `
      <article class="card spot person" data-reveal style="--d:${i}">
        <div class="person__top">${portrait(s) ? frame(portrait(s),s.title,{cls:"person__avatar",sizes:'72px'}) : `<div class="monogram t${tone(s.title)}" aria-hidden="true">${esc(initials(s.title))}</div>`}<span class="person__idx">${pad(i + 1)}</span></div>
        <h3>${esc(s.title)}</h3>
        <p class="person__sub">${esc(s.subtitle)}</p>
        ${showBody ? `<p>${esc(s.body)}</p>` : '<p style="color:var(--ink-3)">研究方向待更新。</p>'}
        ${showTag ? `<div class="person__foot"><span class="chip chip--dot">${esc(s.tag)}</span></div>` : ''}<a class="link-arrow" href="${entryHref(s)}">查看个人资料 ${icon('arrowUpRight')}</a>
      </article>`;
      }).join('')}
    </div>
  </div>
</section>`,
});

const alumniPage = () => {
  const count = (y) => alumni.filter((a) => a.graduationYear === y).length;
  let idx = 0;
  return layout({
    key: 'alumni',
    title: '校友介绍 | Team Gene',
    description: pages.alumni.lede,
    body: `
${pageHero('alumni', alumni.length, '位校友')}
<div class="toolbar">
  <div class="wrap toolbar__row">
    <div class="search">
      <label class="sr-only" for="alumni-q">搜索校友</label>
      ${icon('search')}
      <input id="alumni-q" type="search" placeholder="搜索姓名、专业或去向" autocomplete="off" enterkeyhint="search">
      <button type="button" class="search__clear" aria-label="清除搜索" hidden>${icon('x')}</button>
    </div>
    <div class="chips" role="group" aria-label="按毕业年份筛选">
      <button type="button" class="filter" data-year="all" aria-pressed="true">全部 <small>${alumni.length}</small></button>
      ${years.map((y) => `<button type="button" class="filter" data-year="${y}" aria-pressed="false">${y === '其他' ? '其他' : y+'届'} <small>${count(y)}</small></button>`).join('')}
    </div>
    <span class="result-count" aria-live="polite">${alumni.length} / ${alumni.length} 位</span>
  </div>
</div>
<section class="section" style="padding-top:0">
  <div class="wrap">
    <div data-alumni>
      ${years.map((y) => `
      <section class="year-group" aria-labelledby="y${y}">
        <div class="year-group__head" data-reveal><strong id="y${y}">${y}</strong><span data-year-count data-prefix="${y === '其他' ? '' : '届 · '}">${y === '其他' ? '' : '届 · '}${count(y)} 位</span></div>
        <div class="alum-grid">
          ${alumni.filter((a) => a.graduationYear === y).map((a) => `
          <a class="alum" href="${entryHref(a)}" data-year="${y}" data-search="${esc(`${a.title} ${a.subtitle} ${a.tag} ${a.body} ${y === '其他' ? '其他' : y+'届'}`.toLowerCase())}" data-reveal style="--d:${idx++ % 4}">
            ${frame(portrait(a), a.title, { vt: `p-${encodeURIComponent(a.id)}`, extra: `<span class="alum__year">${y === '其他' ? '其他' : y+'届'}</span>`, sizes: '(min-width: 1100px) 300px, (min-width: 760px) 31vw, 46vw' })}
            <div class="alum__body">
              <div class="alum__name">${esc(a.title)}${icon('arrowUpRight')}</div>
              <p class="alum__degree">${esc(a.subtitle)}</p>
              <p class="alum__now">${esc(lines(a.body).join(' '))}</p>
            </div>
          </a>`).join('')}
        </div>
      </section>`).join('')}
    </div>
    <div class="empty" hidden>
      ${icon('search')}
      <h2>没有找到匹配的校友</h2>
      <p>换个关键词试试，或查看全部年份。</p>
      <button type="button" class="btn btn--ghost btn--sm" data-reset>清除筛选</button>
    </div>
  </div>
</section>`,
  });
};

const alumnusPage = (a, i) => {
  const isAlumni = a.section === 'alumni';
  const roster = isAlumni ? alumni : members;
  const label = isAlumni ? '校友介绍' : '团队成员';
  const prev = roster[(i - 1 + roster.length) % roster.length];
  const next = roster[(i + 1) % roster.length];
  const msg = lines(a.alumniMessage);
  const long = msg.join('').length > 160;
  // A teacher's tag is the category “教师”; their directions are in the body
  // (“研究方向：…”), as on the members page.
  const direction = a.tag === '教师' ? parseTeacher(a).areas.join('、') : a.tag;
  const pagerLink = (x, dir) => `<a class="card" href="${entryHref(x)}">${icon(dir === 'prev' ? 'arrowLeft' : 'arrowRight')}${frame(portrait(x), x.title, { alt: '', sizes: '48px' })}<span><small>${dir === 'prev' ? 'PREVIOUS' : 'NEXT'}</small><strong>${esc(x.title)}</strong></span></a>`;
  return layout({
    key: a.section,
    title: `${a.title} | ${label} | Team Gene`,
    description: `${a.title}，${a.graduationYear === '其他' ? '未填写届别' : a.graduationYear+'届'}，${a.subtitle}。${lines(a.body).join(' ')}`,
    body: `
<section class="section" style="padding-top:0">
  <div class="wrap">
    <div class="profile">
      <aside class="profile__aside">
        ${frame(portrait(a), a.title, { cls: 'profile__photo', vt: `p-${encodeURIComponent(a.id)}`, lazy: false, sizes: '(min-width: 860px) 460px, (min-width: 601px) 420px, 132px' })}
        <dl class="facts">
          ${isAlumni ? `<div><dt>毕业年份</dt><dd>${a.graduationYear === '其他' ? '未填写' : a.graduationYear+'届'}</dd></div>` : ''}
          ${a.subtitle ? `<div><dt>${isAlumni ? '专业 / 学位' : '身份'}</dt><dd>${esc(a.subtitle)}</dd></div>` : ''}
          ${direction ? `<div><dt>研究方向</dt><dd>${esc(direction)}</dd></div>` : ''}
        </dl>
      </aside>
      <article>
        <nav class="crumbs" aria-label="面包屑"><a href="/${a.section}">${label}</a>${icon('chevron')}${isAlumni ? `<a href="/alumni?year=${a.graduationYear}">${a.graduationYear === '其他' ? '其他' : a.graduationYear+'届'}</a>${icon('chevron')}` : ''}<span aria-current="page">${esc(a.title)}</span></nav>
        <p class="eyebrow" data-reveal>${isAlumni ? 'Alumni Profile' : 'Team Member'}</p>
        <h1 data-reveal style="--d:1">${esc(a.title)}</h1>
        <p class="profile__sub" data-reveal style="--d:2">${esc(a.subtitle)}</p>
        <div class="prose-block" data-reveal style="--d:3">
          <h2>个人简介 · ABOUT</h2>
          ${lines(a.body).map((l) => `<p>${esc(l)}</p>`).join('')}
        </div>
        ${msg.length ? `
        <div class="prose-block" data-reveal style="--d:4">
          <h2>校友寄语 · MESSAGE</h2>
          <div class="letter${long ? ' letter--long' : ''}">
            ${msg.map((l) => (/[：:]$/.test(l) && l.length <= 12 ? `<p class="letter__to">${esc(l)}</p>` : `<p>${esc(l)}</p>`)).join('')}
            <p class="letter__sign">— ${esc(a.title)}，${a.graduationYear === '其他' ? '未填写届别' : a.graduationYear+'届'}</p>
          </div>
        </div>` : ''}
        ${gallery(a,true)}${relatedLink(a)}
      </article>
    </div>
    <nav class="pager" aria-label="${isAlumni ? '浏览其他校友' : '浏览其他团队成员'}">
      ${roster.length > 1 ? pagerLink(prev,'prev')+pagerLink(next,'next') : ''}
    </nav>
  </div>
</section>`,
  });
};

const researchPage = () => layout({
  key: 'research',
  title: '学术成果 | Team Gene',
  description: pages.research.lede,
  body: `
${pageHero('research', research.length, '项成果')}
<section class="section">
  <div class="wrap">
    <div class="paper-list">${research.map((p, i) => featurePaper(p, i, 2)).join('')}</div>
  </div>
</section>`,
});

const paperPage = (p) => {
  const d = dateParts(p.date);
  const [venue, level] = splitVenue(p.tag);
  const figures = (p.titleImages?.length || 0) + (p.modelImages?.length || 0);
  const bg = reflow(p.researchBackground ?? p.body ?? '');
  const fig = (key, n, label) => `
    <figure class="card figure" data-reveal>
      <a class="figure__zoom" href="${media(key)}" target="_blank" rel="noopener" data-zoom="${zoomMedia(key)}" data-alt="${esc(label)}" data-original="${media(key)}" aria-label="放大查看：${esc(label)}">
        <img src="${media(key)}"${responsive(key, '(min-width: 900px) 760px, 92vw')} alt="${esc(label)}" loading="lazy" decoding="async">
        <span class="figure__hint">${icon('zoom')}点击放大</span>
      </a>
      <figcaption><strong>图 ${n} · ${esc(label)}</strong><span>${esc(venue)}</span></figcaption>
    </figure>`;
  return layout({
    key: 'research',
    title: `${p.title} | 学术成果 | Team Gene`,
    description: `${p.title} · ${p.tag}`,
    body: `
<div class="progress" aria-hidden="true"></div>
<header class="paper-head">
  <div class="wrap">
    <nav class="crumbs" aria-label="面包屑"><a href="/research">学术成果</a>${icon('chevron')}<span aria-current="page">论文</span></nav>
    <div data-reveal>${venueChips(p.tag)}</div>
    <h1 data-reveal style="--d:1">${esc(p.title)}</h1>
    <div class="paper-head__meta" data-reveal style="--d:2"><span class="meta">发表于 ${d.y}.${d.m}.${d.day}</span><span class="meta">TEAM GENE</span></div>
  </div>
</header>
<section class="section" style="padding-top:0">
  <div class="wrap paper-layout">
    <article data-progress>
      ${(p.titleImages || []).map((asset,i) => fig(asset, i+1, '论文首页')).join('')}
      ${bg.length ? `<div class="prose-block" data-reveal style="margin-top:0"><h2>研究背景 · ABSTRACT</h2><div class="en-prose" lang="${HAN.test(bg.join(' ')) ? 'zh-CN' : 'en'}">${bg.map((s) => `<p>${esc(s)}</p>`).join('')}</div></div>` : ''}
      ${(p.modelImages || []).map((asset,i) => `<div style="margin-top:clamp(40px,5vw,64px)">${fig(asset, (p.titleImages?.length || 0)+i+1, '模型结构图')}</div>`).join('')}
      ${p.researchResults?.trim() ? `<div class="prose-block" data-reveal><h2>研究成果 · CONTRIBUTIONS</h2><div class="cms-body">${renderParas(reflow(p.researchResults))}</div></div>` : ''}
      ${gallery(p)}
    </article>
    <aside class="paper-aside${p.highlights?.length ? '' : ' paper-aside--facts'}" data-reveal style="--d:2">
      ${p.highlights?.length ? `<h2>KEY RESULTS</h2>${p.highlights.map((h) => `<div class="kpi"><strong>${esc(h.value)}</strong><span data-ph>${wordBreaks(esc(h.label))}</span></div>`).join('')}` : `<h2>PUBLICATION</h2>
      <dl class="facts">
        ${venue ? `<div><dt>期刊 / 会议</dt><dd>${esc(venue)}</dd></div>` : ''}
        ${level ? `<div><dt>收录</dt><dd>${esc(level)}</dd></div>` : ''}
        <div><dt>发表时间</dt><dd>${d.y} 年 ${Number(d.m)} 月</dd></div>
        ${figures ? `<div><dt>图表</dt><dd>${figures} 幅</dd></div>` : ''}
      </dl>`}
      ${safeLink(p.url) ? `<a class="btn btn--forest btn--sm" href="${safeLink(p.url)}" target="_blank" rel="noopener noreferrer">查看原文 ${icon('external')}</a>` : ''}
      <a class="btn btn--ghost btn--sm" href="/research" style="margin-top:8px">${icon('arrowLeft')}返回学术成果</a>
    </aside>
  </div>
</section>`,
  });
};

const awardsPage = () => layout({
  key: 'awards',
  title: '团队获奖 | Team Gene',
  description: pages.awards.lede,
  body: `
${pageHero('awards', awards.length, '项记录')}
<section class="section">
  <div class="wrap">
    ${awards.length ? timeline(awards) : `
    <div class="card empty" data-reveal>
      ${laurel}
      <h2>暂无获奖记录</h2>
      <p>团队获奖动态将在这里更新。</p>
      <div class="hero__ctas" style="justify-content:center;margin-top:8px">
        <a class="btn btn--ghost btn--sm" href="/research">查看学术成果 ${icon('arrowRight', 'icon--right')}</a>
        <a class="btn btn--ghost btn--sm" href="/news">团队近况 ${icon('arrowRight', 'icon--right')}</a>
      </div>
    </div>`}
  </div>
</section>`,
});

const listPage = (key, list) => layout({
  key,
  title: `${pages[key].title} | Team Gene`,
  description: pages[key].lede,
  body: `
${pageHero(key, list.length, '项记录')}
<section class="section">
  <div class="wrap-narrow">${timeline(list)}</div>
</section>`,
});

const rulesPage = () => layout({
  key: 'rules',
  title: '管理规则 | Team Gene',
  description: pages.rules.lede,
  body: `
${pageHero('rules', rules.length, '项规则')}
<section class="section">
  <div class="wrap rules-layout">
    <nav class="toc" aria-label="规则目录">
      <h2>CONTENTS</h2>
      <ol>${rules.map((r, i) => `<li><a href="#${encodeURIComponent(r.id)}"><span>${pad(i + 1)}</span>${esc(r.title)}</a></li>`).join('')}</ol>
    </nav>
    <div>
      ${rules.map((r, i) => `
      <article class="card rule" id="${encodeURIComponent(r.id)}" data-reveal>
        <div class="rule__head">
          <span class="rule__num">${pad(i + 1)}</span>
          <div><h2>${esc(r.title)}</h2><p class="rule__sub">${esc(r.subtitle)}</p></div>
          <span class="chip chip--clay">${esc(r.tag)}</span>
        </div>
        ${ruleBody(r.body)}${gallery(r)}${relatedLink(r)}
      </article>`).join('')}
    </div>
  </div>
</section>`,
});

const mailPage = () => {
  const err = `<p class="field__error">${icon('alert')}<span></span></p>`;
  const eye = (name) => `<button type="button" class="control__btn" data-toggle-pw="${name}" aria-pressed="false" aria-label="显示密码">${icon('eye', 'i-eye')}${icon('eyeOff', 'i-eye-off')}</button>`;
  const ok = `<span class="control__ok" aria-hidden="true">${icon('check')}</span>`;
  return layout({
    key: 'mail',
    title: '邮箱与论坛 | Team Gene',
    description: pages.mail.lede,
    body: `
<section class="mail-hero">
  <div class="page-hero__ghost" aria-hidden="true">Mail</div>
  <div class="wrap" style="padding-bottom:48px">
    <p class="eyebrow" data-reveal>Team Gene <span class="sep">·</span> Mail &amp; Forum</p>
    <h1 data-reveal style="--d:1">邮箱与论坛</h1>
    <p class="mail-hero__lede" data-reveal style="--d:2">申领 <b>@team-gene.com</b> 邮箱并设置论坛昵称，邮箱开通后即可进入团队论坛。</p>
    <div class="chip-row" data-reveal style="--d:3"><span class="chip">${icon('zap')}邮箱即时开通</span><span class="chip">${icon('users')}邮箱与论坛同一账户</span></div>
  </div>
</section>
<section class="section" style="padding-top:0">
  <div class="wrap mail-grid">
    <aside class="card mail-side" data-reveal>
      <div class="mail-side__icon">${icon('message')}</div>
      <p class="eyebrow">Team Gene Community</p>
      <h2>已有邮箱？</h2>
      <p>用邮箱账号验证身份，再设置昵称注册论坛或直接登录。</p>
      <a class="btn btn--forest btn--block" href="${site.appOrigin}/forum">进入团队论坛 ${icon('arrowRight', 'icon--right')}</a>
      <a class="btn btn--ghost btn--block" href="${site.webmail}">打开网页版邮箱 ${icon('arrowUpRight')}</a>
      <ul class="info-list">
        <li>${icon('drive')}<span>邮箱默认容量 512 MB，可由管理员单独调整。</span></li>
        <li>${icon('clock')}<span>同一网络每天最多申领 2 个邮箱。</span></li>
        <li>${icon('lock')}<span>密码仅用于邮箱登录，请勿与其他网站共用。</span></li>
      </ul>
    </aside>
    <div class="card form-card" data-reveal style="--d:1">
      <p class="eyebrow">Create your account</p>
      <h2>申领邮箱并加入论坛</h2>
      <p>填写昵称和邮箱账号，开通后论坛身份自动创建。</p>
      <div id="mail-result" role="status" aria-live="polite" hidden></div><form id="mail-form" class="form" novalidate>
        <div class="field">
          <label for="f-nick">论坛昵称</label>
          <div class="control"><input id="f-nick" name="nickname" autocomplete="nickname" placeholder="例如：小 Gene" maxlength="40">${ok}</div>
          ${err}
        </div>
        <div class="field">
          <label for="f-local">邮箱账号</label>
          <div class="control"><input id="f-local" name="local" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="例如：gene.research" maxlength="32" aria-describedby="h-local">${ok}<span class="control__addon">@team-gene.com</span></div>
          <p class="field__hint" id="h-local">使用 1–32 位小写字母、数字、点、下划线或连字符（不能以标点开头或结尾）。</p>
          ${err}
        </div>
        <div class="address-preview" id="addr-preview" aria-live="polite">${icon('mail')}<span><b>your.name</b>@team-gene.com</span></div>
        <div class="form-row">
          <div class="field">
            <label for="f-pw">设置密码</label>
            <div class="control"><input id="f-pw" name="password" maxlength="128" type="password" autocomplete="new-password" placeholder="至少 12 位" aria-describedby="strength-text">${eye('password')}</div>
            <div class="strength" data-level="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
            <div class="strength-label"><span>密码强度</span><span id="strength-text">未填写</span></div>
            ${err}
          </div>
          <div class="field">
            <label for="f-pw2">确认密码</label>
            <div class="control"><input id="f-pw2" name="confirm" maxlength="128" type="password" autocomplete="new-password" placeholder="再次输入邮箱密码">${ok}${eye('confirm')}</div>
            ${err}
          </div>
        </div>
        <button class="btn btn--clay btn--block" type="submit">申领并立即开通 ${icon('arrowRight', 'icon--right')}</button>
        <p class="form-foot">${icon('shield')}<span>密码仅用于邮箱登录，请勿与其他网站共用。</span></p>
      </form>
    </div>
  </div>
</section>`,
  });
};

const notFoundPage = () => layout({
  key: '404',
  title: '页面未找到 | Team Gene',
  description: '页面未找到',
  body: `
<section class="section">
  <div class="wrap empty">
    <p class="eyebrow eyebrow--plain">Error 404</p>
    <h1 style="font-size:var(--fs-2xl)">这条路径还没有被探索</h1>
    <p>你要找的页面不存在或已移动。</p>
    <a class="btn btn--forest" href="/">回到首页 ${icon('arrowRight', 'icon--right')}</a>
  </div>
</section>`,
});


const genericDetail = entry => layout({key:entry.section, body:`<section class="section"><div class="wrap-narrow"><nav class="crumbs"><a href="/${entry.section}">${esc(pages[entry.section].title)}</a>${icon('chevron')}<span>${esc(entry.title)}</span></nav><article class="card t-card"><p class="eyebrow">${esc(entry.tag)}</p><h1>${esc(entry.title)}</h1><p>${esc(entry.subtitle)}</p><time>${esc(entry.date)}</time><div class="cms-body">${bodyParas(entry.body)}</div>${gallery(entry)}${relatedLink(entry)}</article></div></section>`});
return {
  page(key) {
    return ({home:homePage,members:membersPage,alumni:alumniPage,research:researchPage,awards:awardsPage,life:()=>listPage('life',life),news:()=>listPage('news',news),rules:rulesPage,mail:mailPage,'404':notFoundPage}[key] || notFoundPage)();
  },
  detail(entry) {
    if (entry.section === 'alumni' || entry.section === 'members') return alumnusPage(entry,(entry.section === 'alumni' ? alumni : members).findIndex(x=>x.id===entry.id));
    if (entry.section === 'research') return paperPage(entry);
    return genericDetail(entry);
  }
};
}
