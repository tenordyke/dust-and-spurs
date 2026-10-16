const assert = require('assert');
const { parseHashRoute, buildAppUrl, historyAction } = require('../lib/hash-route');

const PAGES = ['home', 'collections', 'about', 'prints', 'posters', 'book', 'journal', 'gifts', 'contact', 'thank-you'];

function test(name, fn) {
  fn();
  console.log('ok ', name);
}

test('a query string in the hash does not change the page', () => {
  const route = parseHashRoute('#/gifts?utm_source=oct30&utm_medium=email', PAGES);
  assert.strictEqual(route.page, 'gifts');
  assert.deepStrictEqual(route.parts, []);
});

test('a real search string still leaves the hash route alone', () => {
  const route = parseHashRoute('#/gifts', PAGES);
  assert.strictEqual(route.page, 'gifts');
  const url = buildAppUrl('?utm_source=oct30&utm_medium=email', '#/gifts', route.page, route.parts);
  assert.strictEqual(url, '?utm_source=oct30&utm_medium=email#/gifts');
});

test('poster deep links keep the design and the hanging option', () => {
  const route = parseHashRoute('#/posters/against-the-light/hanging?utm_campaign=gift', PAGES);
  assert.strictEqual(route.page, 'posters');
  assert.deepStrictEqual(route.parts, ['against-the-light', 'hanging']);
  const url = buildAppUrl('', '#/posters/against-the-light/hanging?utm_campaign=gift', route.page, route.parts);
  assert.strictEqual(url, '#/posters/against-the-light/hanging?utm_campaign=gift');
});

test('an unknown hash falls home and does not keep stray parts', () => {
  const route = parseHashRoute('#/not-a-page?utm_source=x', PAGES);
  assert.strictEqual(route.page, 'home');
  assert.deepStrictEqual(route.parts, []);
});

test('moving between pages keeps both the search string and the hash query', () => {
  const url = buildAppUrl('?utm_source=oct30', '#/gifts?utm_medium=email', 'book', []);
  assert.strictEqual(url, '?utm_source=oct30#/book?utm_medium=email');
});

test('a new page pushes, the same page does not, and Back does not push', () => {
  assert.strictEqual(historyAction('#/home', '#/gifts', 'push'), 'push');
  assert.strictEqual(historyAction('#/gifts', '#/gifts', 'push'), 'none');
  assert.strictEqual(historyAction('#/home', '#/home', 'none'), 'none');
  assert.strictEqual(historyAction('', '#/home', 'replace'), 'replace');
  assert.strictEqual(historyAction('#/not-a-page', '#/home', 'none'), 'replace');
});

test('home, gifts, a poster, Back twice, then Forward once', () => {
  const search = '?utm_source=oct30&utm_medium=email';
  let stack = [''];
  let index = 0;
  function hashOf(url) {
    const i = String(url).indexOf('#');
    return i >= 0 ? url.slice(i) : '';
  }
  function visit(page, parts, mode) {
    const next = buildAppUrl(search, hashOf(stack[index]), page, parts);
    const action = historyAction(stack[index], next, mode);
    if (action === 'push') {
      stack = stack.slice(0, index + 1);
      stack.push(next);
      index += 1;
    } else if (action === 'replace') {
      stack[index] = next;
    }
    return stack[index];
  }
  function travel(delta) {
    index += delta;
    const hash = hashOf(stack[index]);
    const route = parseHashRoute(hash, PAGES);
    const next = buildAppUrl(search, hash, route.page, route.parts);
    assert.strictEqual(historyAction(stack[index], next, 'none'), 'none');
    return stack[index];
  }
  assert.strictEqual(visit('home', [], 'replace'), search + '#/home');
  assert.strictEqual(visit('gifts', [], 'push'), search + '#/gifts');
  assert.strictEqual(visit('posters', ['against-the-light'], 'push'), search + '#/posters/against-the-light');
  assert.strictEqual(travel(-1), search + '#/gifts');
  assert.strictEqual(travel(-1), search + '#/home');
  assert.strictEqual(travel(1), search + '#/gifts');
  assert.deepStrictEqual(stack, [
    search + '#/home',
    search + '#/gifts',
    search + '#/posters/against-the-light',
  ]);
});

console.log('hash route tests passed');
