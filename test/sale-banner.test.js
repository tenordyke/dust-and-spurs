const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { holidaySaleBanner, holidaySaleBannerEnabled } = require('../lib/sale-banner');

const preview = '10% off the shop, November 27 to 30. Order fine art by December 1 for Christmas.';
const sale = '10% off everything in the shop through Monday, November 30. Applied at checkout. Gift cards excluded.';
const fineArt = 'Today is the last day to order fine art prints, framed prints and canvas for Christmas in Canada.';
const bookAndPosters = 'Order Stories of the West by December 12 and posters by December 14 for Christmas in Canada.';
const posters = 'Order posters by December 14 for Christmas in Canada.';
const egift = 'eGift cards arrive by email, the easy last-minute gift.';
const estimate = 'Delivery times are estimates and may vary depending on location, production requirements, and holiday shipping conditions. Christmas delivery cannot be guaranteed.';
const collections = '#/collections';
const gifts = '#/gifts';
const posterPage = '#/posters';
const giftCards = 'https://app.squareup.com/gift/ML5W8MYW4D9NW/order';

function atRegina(stamp, endOfDay) {
  const time = endOfDay ? 'T05:59:00.000Z' : 'T06:00:00.000Z';
  const [year, month, day] = stamp.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
  if (endOfDay) utc.setUTCDate(utc.getUTCDate() + 1);
  if (endOfDay) return new Date(utc.toISOString().slice(0, 10) + 'T05:59:00.000Z');
  return new Date(stamp + time);
}

function shown(stamp, extra) {
  const endOfDay = extra && extra.endOfDay;
  const options = Object.assign({ enabled: true }, extra || {});
  delete options.endOfDay;
  return holidaySaleBanner(atRegina(stamp, endOfDay), options);
}

function assertQuiet(phase) {
  const text = [phase.copy, phase.note, phase.href].join(' ');
  assert.strictEqual(text.includes('\u2014'), false);
  assert.strictEqual(text.includes('Journal'), false);
  assert.strictEqual(text.includes('Amazon'), false);
  assert.strictEqual(text.includes('Western Soul'), false);
}

assert.strictEqual(holidaySaleBannerEnabled, false);
assert.strictEqual(holidaySaleBanner(atRegina('2026-11-27')), null);
assert.strictEqual(shown('2026-11-27', { enabled: false }), null);
assert.strictEqual(shown('2026-11-27', { held: true }), null);
assert.strictEqual(shown('2026-11-27', { route: 'thank-you' }), null);
assert.strictEqual(holidaySaleBanner(new Date('not-a-date'), { enabled: true }), null);

assert.strictEqual(shown('2026-11-19', { endOfDay: true }), null);
const previewStart = shown('2026-11-20');
assert.strictEqual(previewStart.copy, preview);
assert.strictEqual(previewStart.href, collections);
assert.strictEqual(previewStart.external, false);
assert.strictEqual(previewStart.note, estimate);
assertQuiet(previewStart);
const previewEnd = shown('2026-11-26', { endOfDay: true });
assert.strictEqual(previewEnd.copy, preview);
assert.strictEqual(previewEnd.href, collections);

const saleStart = shown('2026-11-27');
assert.strictEqual(saleStart.copy, sale);
assert.strictEqual(saleStart.href, collections);
assert.strictEqual(saleStart.external, false);
assert.strictEqual(saleStart.note, '');
assertQuiet(saleStart);
const saleEnd = shown('2026-11-30', { endOfDay: true });
assert.strictEqual(saleEnd.copy, sale);

const fineArtDay = shown('2026-12-01');
assert.strictEqual(fineArtDay.copy, fineArt);
assert.strictEqual(fineArtDay.href, collections);
assert.strictEqual(fineArtDay.note, estimate);
assertQuiet(fineArtDay);
assert.strictEqual(shown('2026-12-01', { endOfDay: true }).copy, fineArt);

const windowStart = shown('2026-12-02');
assert.strictEqual(windowStart.copy, bookAndPosters);
assert.strictEqual(windowStart.href, gifts);
assert.strictEqual(windowStart.note, estimate);
assertQuiet(windowStart);
assert.strictEqual(shown('2026-12-12', { endOfDay: true }).copy, bookAndPosters);

const posterStart = shown('2026-12-13');
assert.strictEqual(posterStart.copy, posters);
assert.strictEqual(posterStart.href, posterPage);
assert.strictEqual(posterStart.note, estimate);
assertQuiet(posterStart);
assert.strictEqual(shown('2026-12-14', { endOfDay: true }).copy, posters);

const egiftStart = shown('2026-12-15');
assert.strictEqual(egiftStart.copy, egift);
assert.strictEqual(egiftStart.href, giftCards);
assert.strictEqual(egiftStart.external, true);
assert.strictEqual(egiftStart.note, '');
assertQuiet(egiftStart);
assert.strictEqual(shown('2026-12-25', { endOfDay: true }).copy, egift);
assert.strictEqual(shown('2026-12-26'), null);

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'sale-banner.js'), 'utf8');
assert.strictEqual(source.includes('\u2014'), false);
assert.ok(source.includes('holidaySaleBannerEnabled = false'));
assert.ok(source.includes('America/Regina'));

console.log('sale banner tests passed');
