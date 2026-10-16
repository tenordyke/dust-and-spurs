const assert = require('assert');
const { parseHashRoute, buildAppUrl } = require('../lib/hash-route');

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

console.log('hash route tests passed');
