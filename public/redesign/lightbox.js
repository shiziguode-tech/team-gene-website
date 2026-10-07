// One modal gallery, using the caller's cleanup-aware listeners and timers.
export function initializeLightbox(lb, shots, {
  listen, schedule, ImageConstructor = Image,
  connection = navigator.connection, baseUrl = location.href,
}) {
  if (!lb || !shots.length) return;
  const img = lb.querySelector('img');
  const title = lb.querySelector('.lightbox__title');
  const count = lb.querySelector('.lightbox__count');
  const original = lb.querySelector('.lightbox__original');
  const many = shots.length > 1, preloaded = new Set();
  let index = 0, gesture = null, swiped = false;
  lb.classList.toggle('is-single', !many);
  const preload = (i) => {
    if (connection?.saveData) return;
    // Never speculatively fetch a full GIF or an arbitrary original upload.
    // Only the site's bounded raster rendition endpoint is eligible.
    const url = new URL(shots[(i + shots.length) % shots.length].dataset.zoom, baseUrl);
    if (url.origin !== new URL(baseUrl).origin || !/^\/api\/media\/[^/]+\.(?:jpg|png|webp|avif)$/i.test(url.pathname)) return;
    url.search = '?w=1600';
    if (preloaded.has(url.href)) return;
    preloaded.add(url.href);
    const next = new ImageConstructor(); next.decoding = 'async'; next.src = url.href;
  };
  const show = (i) => {
    index = (i + shots.length) % shots.length;
    const shot = shots[index];
    if (img.getAttribute('src') !== shot.dataset.zoom) { img.classList.add('is-loading'); img.src = shot.dataset.zoom; }
    img.alt = shot.dataset.alt || '';
    title.textContent = shot.dataset.alt || '';
    count.textContent = many ? `${index + 1} / ${shots.length}` : '';
    original.hidden = !shot.dataset.original;
    if (shot.dataset.original) original.href = shot.dataset.original;
    else original.removeAttribute('href');
    if (many) { preload(index + 1); preload(index - 1); }
  };
  listen(img, 'load', () => img.classList.remove('is-loading'));
  listen(img, 'error', () => img.classList.remove('is-loading'));
  shots.forEach((shot, i) => listen(shot, 'click', (e) => {
    if (e.defaultPrevented || (shot.matches('a[href]') && (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey))) return;
    e.preventDefault(); show(i); lb.showModal();
  }));
  listen(lb, 'click', (e) => {
    if (swiped) { swiped = false; return; }
    if (e.target.closest('[data-lb-prev]')) show(index - 1);
    else if (e.target.closest('[data-lb-next]')) show(index + 1);
    else if (e.target === lb || e.target.closest('.lightbox__close')) lb.close();
  });
  listen(lb, 'keydown', (e) => {
    if (!many || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
  });
  // Restrict paging to deliberate horizontal touch/pen swipes. Mouse text
  // selection, vertical scrolling and multi-touch zoom retain native behavior.
  listen(lb, 'pointerdown', (e) => {
    gesture = many && e.isPrimary && ['touch', 'pen'].includes(e.pointerType) && !e.target.closest('a, button')
      ? {id: e.pointerId, x: e.clientX, y: e.clientY} : null;
  });
  listen(lb, 'pointerup', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    gesture = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      swiped = true; show(index + (dx < 0 ? 1 : -1));
      schedule(() => { swiped = false; }, 0);
    }
  });
  listen(lb, 'pointercancel', () => { gesture = null; });
  listen(lb, 'close', () => { gesture = null; swiped = false; });
}
