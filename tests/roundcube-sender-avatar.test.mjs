import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../deploy/roundcube/team_gene_avatar/avatar.js', import.meta.url), 'utf8');

class Element {
  constructor() {
    this.dataset = {}; this.attributes = {}; this.children = []; this.listeners = new Map();
    this.classes = new Set();
    this.classList = {add: value => this.classes.add(value), remove: value => this.classes.delete(value), contains: value => this.classes.has(value)};
    const values = new Map();
    this.style = {
      getPropertyValue: name => values.get(name)?.value || '',
      getPropertyPriority: name => values.get(name)?.priority || '',
      setProperty: (name, value, priority = '') => values.set(name, {value, priority}),
      removeProperty: name => values.delete(name),
    };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  prepend(child) { child.parent = this; this.children.unshift(child); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  after(node) { this.siblings ??= []; this.siblings.push(node); }
  addEventListener(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) || []), callback]); }
  emit(name) { for (const callback of this.listeners.get(name) || []) callback(); }
  querySelector(selector) {
    if (selector === '.tg-avatar') return this.children.find(child => child.className?.split(' ').includes('tg-avatar')) || null;
    if (selector.startsWith('span.fromto')) return this.sender || null;
    return null;
  }
}

function fixture({headerSrc} = {}) {
  const listeners = new Map(), list = new Element(), rows = new Set();
  list.contains = row => rows.has(row);
  const headerSender = new Element(); headerSender.textContent = 'Dr. Wang'; headerSender.setAttribute('title', 'wang@example.com');
  const photo = headerSrc === undefined ? null : new Element();
  if (photo) photo.setAttribute('src', headerSrc);
  const document = {
    currentScript: {src: 'https://mail.example.com/plugins/team_gene_avatar/avatar.js'},
    createElement: () => new Element(),
    getElementById: id => id === 'messagelist' ? list : null,
    querySelector: selector => selector.includes('img.contactphoto') ? photo : headerSender,
    querySelectorAll: () => [],
  };
  const rcmail = {env: {}, addEventListener: (name, callback) => listeners.set(name, callback)};
  const window = {rcmail, location: {href: 'https://mail.example.com/'}, addEventListener() {}};
  window.parent = window;
  vm.runInNewContext(source, {window, rcmail, document, URL});
  function row({padding = '', priority = 'important', sender = '王老师', email = 'wang@example.com', outside = false} = {}) {
    const cell = new Element(), rowElement = new Element();
    if (padding) cell.style.setProperty('padding-left', padding, priority);
    if (sender) { cell.sender = new Element(); cell.sender.textContent = sender; cell.sender.setAttribute('title', email); }
    rowElement.querySelector = selector => selector === 'td.subject' ? cell : null;
    if (!outside) rows.add(rowElement);
    const event = {row: {obj: rowElement}};
    return {cell, event, insert: () => listeners.get('insertrow')(event)};
  }
  return {row, photo, list, init: () => listeners.get('init')()};
}

test('sender avatars reserve space in threaded rows without losing the original indent', () => {
  const f = fixture();
  for (const padding of ['1.5rem', '3rem', '9rem']) {
    const r = f.row({padding}); r.insert();
    assert.equal(r.cell.style.getPropertyValue('padding-left'), `calc(${padding} + 3.4rem)`);
    assert.equal(r.cell.style.getPropertyPriority('padding-left'), 'important');
    assert.equal(r.cell.children[0].style.getPropertyValue('left'), `calc(${padding} + .7rem)`);
    assert.equal(r.cell.classList.contains('tg-has-avatar'), true);
    r.insert();
    assert.equal(r.cell.children.length, 1, 'repeated insert events do not duplicate or compound spacing');
  }
});

test('changing list layouts restores reused cells and does not indent ordinary table rows', () => {
  const f = fixture(), r = f.row({padding: '1.5rem'}); r.insert();
  r.cell.sender = null;
  r.insert();
  assert.equal(r.cell.style.getPropertyValue('padding-left'), '1.5rem');
  assert.equal(r.cell.style.getPropertyPriority('padding-left'), 'important');
  assert.equal(r.cell.classList.contains('tg-has-avatar'), false);
  assert.equal(r.cell.children.length, 0);
  const plain = f.row({sender: null}); plain.insert();
  assert.equal(plain.cell.style.getPropertyValue('padding-left'), '');
  assert.equal(plain.cell.classList.contains('tg-has-avatar'), false);
  const contact = f.row({outside: true}); contact.insert();
  assert.equal(contact.cell.children.length, 0, 'addressbook insert events are ignored');
});

test('rerendered cell contents retain one indent and stable colours come from the address', () => {
  const f = fixture(), a = f.row({padding: '1.5rem'}), b = f.row({sender: 'Dr. Wang'});
  a.insert(); b.insert();
  assert.equal(a.cell.children[0].className, b.cell.children[0].className);
  assert.equal(a.cell.children[0].textContent, '王');
  assert.equal(b.cell.children[0].textContent, 'W');
  a.cell.children = []; a.insert();
  assert.equal(a.cell.style.getPropertyValue('padding-left'), 'calc(1.5rem + 3.4rem)');
});

test('real contact photos remain visible when their asynchronous request succeeds', () => {
  const f = fixture({headerSrc: '/?_task=addressbook&_action=photo&_email=wang%40example.com'});
  f.init(); f.photo.emit('load');
  assert.notEqual(f.photo.hidden, true);
  assert.equal(f.photo.siblings, undefined);
});

test('only a loaded fallback is replaced, including cache-busted placeholder URLs', () => {
  const f = fixture({headerSrc: '/?_task=addressbook&_action=photo&_email=wang%40example.com'});
  f.init();
  f.photo.setAttribute('src', 'skins/elastic/images/contactpic.svg?v=123'); f.photo.emit('load');
  assert.equal(f.photo.hidden, true);
  assert.equal(f.photo.siblings.length, 1);
  assert.equal(f.photo.siblings[0].textContent, 'W');
  f.photo.emit('load');
  assert.equal(f.photo.siblings.length, 1);
});
