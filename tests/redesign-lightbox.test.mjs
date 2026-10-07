import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeLightbox} from '../public/redesign/lightbox.js';

class Element {
  constructor(tag = 'div', dataset = {}) {
    this.tag = tag; this.dataset = dataset; this.listeners = new Map(); this.classes = new Set();
    this.classList = {
      add: value => this.classes.add(value), remove: value => this.classes.delete(value),
      toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value),
    };
  }
  matches(selector) { return selector === 'a[href]' && this.tag === 'a'; }
  closest(selector) { return selector.split(',').map(s => s.trim()).includes(this.tag) ? this : null; }
  getAttribute(name) { return this[name] ?? null; }
  removeAttribute(name) { delete this[name]; }
  emit(type, properties = {}) {
    const event = {target: this, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties};
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }
}

function gallery(files = ['/api/media/a.jpg?w=1600', '/api/media/b.png?w=1600'], saveData = false) {
  const lb = new Element(), img = new Element('img'), title = new Element(), count = new Element(), original = new Element('a');
  const fields = {'img': img, '.lightbox__title': title, '.lightbox__count': count, '.lightbox__original': original};
  lb.querySelector = selector => fields[selector];
  lb.showModal = () => { lb.open = true; };
  lb.close = () => { lb.open = false; lb.emit('close'); };
  const shots = files.map((url, i) => new Element('a', {zoom: url, alt: `Photo ${i}`, original: url.split('?')[0]}));
  const downloads = [], timers = [], connection = {saveData};
  initializeLightbox(lb, shots, {
    listen(target, event, fn) { target.listeners.set(event, [...(target.listeners.get(event) || []), fn]); },
    schedule(fn) { timers.push(fn); }, baseUrl: 'https://team-gene.com/news/example', connection,
    ImageConstructor: class { set src(value) { downloads.push(value); } },
  });
  return {lb, img, count, original, shots, downloads, connection, timers};
}

test('gallery preserves modified link clicks but opens ordinary and keyboard clicks', () => {
  const g = gallery();
  for (const modifier of [{ctrlKey: true}, {metaKey: true}, {altKey: true}, {shiftKey: true}, {button: 1}, {button: 2}]) {
    assert.equal(g.shots[0].emit('click', modifier).defaultPrevented, false);
    assert.equal(g.lb.open, undefined);
  }
  assert.equal(g.shots[0].emit('click').defaultPrevented, true);
  assert.equal(g.lb.open, true);
  g.lb.close();
  assert.equal(g.shots[1].emit('click', {detail: 0}).defaultPrevented, true);
  assert.equal(g.count.textContent, '2 / 2');
});

test('neighbor preloads use same-origin 1600px renditions, never GIFs or external files', () => {
  const g = gallery(['/api/media/large.gif', '/api/media/original.png', 'https://other.example/photo.jpg']);
  g.shots[0].emit('click');
  assert.deepEqual(g.downloads, ['https://team-gene.com/api/media/original.png?w=1600']);
  assert.equal(g.img.src, '/api/media/large.gif', 'selected GIF retains its animation');
  g.shots[1].emit('click');
  assert.equal(g.downloads.length, 1, 'neither original GIF nor remote image is speculatively fetched');
  g.shots[0].emit('click');
  assert.equal(g.downloads.length, 1, 'previously requested rendition is not requested again');
});

test('save-data blocks preloads without blocking the selected photo or keyboard navigation', () => {
  const g = gallery(undefined, true);
  g.shots[0].emit('click');
  assert.equal(g.downloads.length, 0);
  assert.equal(g.lb.emit('keydown', {key: 'ArrowRight'}).defaultPrevented, true);
  assert.equal(g.count.textContent, '2 / 2');
  assert.equal(g.img.src, '/api/media/b.png?w=1600');
});

test('swipes require the same primary touch or pen pointer and predominantly horizontal movement', () => {
  const g = gallery(); g.shots[0].emit('click');
  const down = (overrides = {}) => g.lb.emit('pointerdown', {target: g.img, pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 200, clientY: 200, ...overrides});
  const up = (overrides = {}) => g.lb.emit('pointerup', {target: g.img, pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 210, ...overrides});
  down({pointerType: 'mouse'}); up(); assert.equal(g.count.textContent, '1 / 2');
  down(); up({clientY: 350}); assert.equal(g.count.textContent, '1 / 2');
  down(); up({pointerId: 2}); assert.equal(g.count.textContent, '1 / 2');
  g.lb.emit('pointercancel'); up(); assert.equal(g.count.textContent, '1 / 2');
  down(); down({isPrimary: false, pointerId: 2}); up(); assert.equal(g.count.textContent, '1 / 2', 'multi-touch does not page');
  down({target: new Element('button')}); up(); assert.equal(g.count.textContent, '1 / 2');
  down(); up(); assert.equal(g.count.textContent, '2 / 2');
  g.lb.emit('click'); assert.equal(g.lb.open, true, 'swipe-generated click must not close the dialog');
  down({pointerType: 'pen'}); up({clientX: 280}); assert.equal(g.count.textContent, '1 / 2');
});

test('research image buttons still open and original links do not persist for a figure without one', () => {
  const g = gallery(); g.shots[0].emit('click');
  assert.equal(g.original.hidden, false);
  g.shots[1].tag = 'button'; delete g.shots[1].dataset.original;
  g.shots[1].emit('click');
  assert.equal(g.original.hidden, true);
  assert.equal(g.original.href, undefined);
  assert.equal(g.count.textContent, '2 / 2');
});
