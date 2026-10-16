const assert = require('assert');
const {
  GA_PLACEHOLDER,
  analyticsReady,
  pagePath,
  squareReturn,
  ecommerceEvent,
  pendingCheckout,
  savePendingCheckout,
  confirmedPurchase,
  installAnalytics,
  trackEvent,
  sendPurchase,
} = require('../lib/analytics');

function test(name, fn) {
  fn();
  console.log('ok ', name);
}

function memory() {
  const data = {};
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
  };
}

function fakeDoc() {
  const scripts = [];
  const win = {};
  return {
    scripts,
    win,
    doc: {
      defaultView: win,
      head: { appendChild(node) { scripts.push(node); } },
      createElement() { return { async: false, src: '' }; },
    },
  };
}

test('the placeholder measurement ID is not ready', () => {
  assert.strictEqual(GA_PLACEHOLDER, 'G-XXXXXXXXXX');
  assert.strictEqual(analyticsReady('G-XXXXXXXXXX'), false);
  assert.strictEqual(analyticsReady(''), false);
  assert.strictEqual(analyticsReady('G-abc12345'), false);
  assert.strictEqual(analyticsReady('UA-123456'), false);
  assert.strictEqual(analyticsReady('G-AB12CD34'), true);
});

test('the placeholder does not load gtag or record a hit', () => {
  const blank = fakeDoc();
  assert.strictEqual(installAnalytics('G-XXXXXXXXXX', blank.doc), false);
  assert.strictEqual(blank.scripts.length, 0);
  assert.strictEqual(blank.win.gtag, undefined);
  blank.win.gtag = function () { throw new Error('should not be called'); };
  assert.strictEqual(trackEvent('G-XXXXXXXXXX', blank.win, 'page_view', { page_path: '/home' }), false);
});

test('a real measurement ID loads gtag with ads off and IP anonymized', () => {
  const blank = fakeDoc();
  assert.strictEqual(installAnalytics('G-AB12CD34', blank.doc), true);
  assert.strictEqual(blank.scripts.length, 1);
  assert.strictEqual(blank.scripts[0].async, true);
  assert.strictEqual(blank.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-AB12CD34');
  const config = blank.win.dataLayer[1];
  assert.strictEqual(config[0], 'config');
  assert.strictEqual(config[1], 'G-AB12CD34');
  assert.strictEqual(config[2].anonymize_ip, true);
  assert.strictEqual(config[2].allow_google_signals, false);
  assert.strictEqual(config[2].allow_ad_personalization_signals, false);
  assert.strictEqual(config[2].send_page_view, false);
  assert.strictEqual(trackEvent('G-AB12CD34', blank.win, 'page_view', { page_path: '/gifts' }), true);
  const hit = blank.win.dataLayer[blank.win.dataLayer.length - 1];
  assert.deepStrictEqual(hit, ['event', 'page_view', { page_path: '/gifts' }]);
});

test('hash routes become page paths', () => {
  assert.strictEqual(pagePath('home', []), '/home');
  assert.strictEqual(pagePath('gifts', []), '/gifts');
  assert.strictEqual(pagePath('posters', ['against-the-light', 'hanging']), '/posters/against-the-light/hanging');
});

test('ecommerce events keep CAD prices and quantities', () => {
  const event = ecommerceEvent([
    { id: 'where-they-gather', title: 'Where They Gather', collection: 'Life Among the Herd', prod: 'Fine Art Print', size: '12 × 18"', price: 225, qty: 2 },
  ]);
  assert.strictEqual(event.currency, 'CAD');
  assert.strictEqual(event.value, 450);
  assert.strictEqual(event.items[0].item_id, 'where-they-gather');
  assert.strictEqual(event.items[0].item_name, 'Where They Gather');
  assert.strictEqual(event.items[0].quantity, 2);
  assert.strictEqual(event.items[0].price, 225);
});

test('a plain thank-you visit is not a purchase', () => {
  const store = memory();
  assert.strictEqual(squareReturn('', '#/thank-you'), null);
  assert.strictEqual(confirmedPurchase('thank-you', '', '#/thank-you', store), null);
  assert.strictEqual(confirmedPurchase('home', '?orderId=ORDER123&transactionId=TRANS123', '#/home', store), null);
});

test('Square query params without our checkout are not a purchase', () => {
  const store = memory();
  const returned = squareReturn('', '#/thank-you?orderId=ORDER123&transactionId=TRANS123');
  assert.deepStrictEqual(returned, { orderId: 'ORDER123', transactionId: 'TRANS123' });
  assert.strictEqual(confirmedPurchase('thank-you', '', '#/thank-you?orderId=ORDER123&transactionId=TRANS123', store), null);
  assert.strictEqual(confirmedPurchase('thank-you', '?orderId=ORDER123', '#/thank-you', store), null);
});

test('a matching Square return records one purchase and a second visit does not', () => {
  const store = memory();
  const pending = pendingCheckout(
    { orderId: 'ORDER123', reference: 'DS-1', total: 225 },
    [{ id: 'where-they-gather', title: 'Where They Gather', collection: 'Life Among the Herd', prod: 'Fine Art Print', size: '12 × 18"', price: 225, qty: 1 }]
  );
  assert.strictEqual(savePendingCheckout(store, pending), true);
  const blank = fakeDoc();
  installAnalytics('G-AB12CD34', blank.doc);
  const search = '?orderId=ORDER123&transactionId=TRANS123';
  const first = sendPurchase('G-AB12CD34', blank.win, 'thank-you', search, '#/thank-you', store);
  assert.ok(first);
  assert.strictEqual(first.transaction_id, 'TRANS123');
  assert.strictEqual(first.currency, 'CAD');
  assert.strictEqual(first.value, 225);
  assert.strictEqual(first.items[0].item_id, 'where-they-gather');
  const hit = blank.win.dataLayer[blank.win.dataLayer.length - 1];
  assert.strictEqual(hit[1], 'purchase');
  assert.strictEqual(sendPurchase('G-AB12CD34', blank.win, 'thank-you', search, '#/thank-you', store), null);
  const purchases = blank.win.dataLayer.filter(function (row) { return row[1] === 'purchase'; });
  assert.strictEqual(purchases.length, 1);
});

test('a different order id is not a confirmed return', () => {
  const store = memory();
  savePendingCheckout(store, pendingCheckout({ orderId: 'ORDER123', total: 79 }, []));
  assert.strictEqual(confirmedPurchase('thank-you', '?orderId=OTHER99&transactionId=TRANS123', '#/thank-you', store), null);
});

test('the placeholder does not consume a confirmed return', () => {
  const store = memory();
  savePendingCheckout(store, pendingCheckout({ orderId: 'ORDER123', total: 79 }, []));
  const blank = fakeDoc();
  const search = '?orderId=ORDER123&transactionId=TRANS123';
  assert.strictEqual(sendPurchase('G-XXXXXXXXXX', blank.win, 'thank-you', search, '#/thank-you', store), null);
  installAnalytics('G-AB12CD34', blank.doc);
  const later = sendPurchase('G-AB12CD34', blank.win, 'thank-you', search, '#/thank-you', store);
  assert.ok(later);
  assert.strictEqual(later.value, 79);
});

console.log('analytics tests passed');
