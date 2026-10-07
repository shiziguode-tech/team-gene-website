import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syncHeaderVisibility} from '../public/redesign/interactions.js';

test('focusing a scrolled-away header restores its sticky offset and keeps pending scrolls from hiding it', () => {
  const classes = new Set(), properties = new Map();
  const header = {classList: {add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value)}};
  const root = {style: {setProperty: (key, value) => properties.set(key, value)}};
  const update = (y, lastY, focused = false, menuOpen = false) => syncHeaderVisibility(header, root, {y, lastY, focused, menuOpen});
  const check = hidden => {
    assert.equal(classes.has('is-hidden'), hidden);
    assert.equal(properties.get('--header-offset'), hidden ? '0px' : 'var(--header-h)');
  };

  update(520, 400); check(true);
  // A Tab focus occurs without another scroll event; dependent sticky elements
  // must reserve the newly visible header's height in this same update.
  update(520, 520, true); check(false);
  // A previously queued scroll callback must not hide the focused navigation.
  update(560, 520, true); check(false);
  update(600, 560); check(true);
  update(650, 600, false, true); check(false);
  update(200, 650); check(false);
});
