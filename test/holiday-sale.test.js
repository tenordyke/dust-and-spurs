const assert = require('assert');
const checkout = require('../netlify/functions/checkout');
const wh = require('../netlify/functions/square-webhook');
const sale = require('../lib/holiday-sale');

const BEFORE = '2026-11-27T05:59:59.000Z';
const FIRST_MINUTE = '2026-11-27T06:00:00.000Z';
const LAST_MINUTE = '2026-12-01T05:59:00.000Z';
const LAST_SECOND = '2026-12-01T05:59:59.000Z';
const AFTER = '2026-12-01T06:00:00.000Z';

const ENV_KEYS = [
  'SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID', 'SQUARE_ENV', 'SQUARE_VERSION',
  'SITE_URL', 'HOLIDAY_SALE_ENABLED', 'GST_ENABLED', 'GST_PCT', 'TAX_PST_PCT',
];

function at(iso) {
  return new Date(iso);
}

function useEnv(extra) {
  const prev = {};
  ENV_KEYS.forEach((key) => { prev[key] = process.env[key]; delete process.env[key]; });
  Object.assign(process.env, {
    SQUARE_ACCESS_TOKEN: 'test-token',
    SQUARE_LOCATION_ID: 'LOC1',
    SQUARE_ENV: 'sandbox',
    SITE_URL: 'https://dustandspurs.ca',
  }, extra || {});
  return function restore() {
    ENV_KEYS.forEach((key) => {
      if (prev[key] == null) delete process.env[key];
      else process.env[key] = prev[key];
    });
  };
}

const ship = {
  name: 'Alix Dyck',
  email: 'buyer@example.com',
  phone: '(306) 555-0199',
  addr: '1 Main St',
  city: 'Saskatoon',
  country: 'Canada',
  region: 'Saskatchewan',
  postal: 'S7K 0A1',
};

function poster() {
  return { id: 'against-the-light', format: 'poster', display: 'standard', qty: 1 };
}

async function postAt(iso, items, extraEnv, squareCents) {
  const restore = useEnv(extraEnv);
  checkout.setCheckoutNow(function () { return at(iso); });
  const original = global.fetch;
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = JSON.parse(opts.body);
    const amount = typeof squareCents === 'function' ? squareCents(captured) : squareCents;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        payment_link: { url: 'https://square.link/u/test', order_id: 'ORDER1' },
        related_resources: {
          orders: [{
            total_money: { amount: amount, currency: 'CAD' },
            total_tax_money: { amount: sale.includedTaxCents(amount, extraEnv && String(extraEnv.GST_ENABLED).toLowerCase() === 'true' ? [6, 5] : [6]), currency: 'CAD' },
            taxes: captured.order.taxes,
          }],
        },
      }),
    };
  };
  try {
    const res = await checkout.handler({
      httpMethod: 'POST',
      headers: { host: 'dustandspurs.ca' },
      body: JSON.stringify({ items: items, ship: ship }),
    });
    return { res: res, body: JSON.parse(res.body), captured: captured };
  } finally {
    checkout.setCheckoutNow(null);
    global.fetch = original;
    restore();
  }
}

function quoteAt(iso, listCents, env) {
  return sale.holidaySaleQuote(listCents, at(iso), env || {});
}

assert.strictEqual(sale.holidaySaleActive(at(BEFORE), {}), false);
assert.strictEqual(sale.holidaySaleActive(at(FIRST_MINUTE), {}), true);
assert.strictEqual(sale.reginaStamp(at(FIRST_MINUTE)), '2026-11-27');
assert.strictEqual(sale.holidaySaleActive(at(LAST_MINUTE), {}), true);
assert.strictEqual(sale.reginaStamp(at(LAST_MINUTE)), '2026-11-30');
assert.strictEqual(sale.holidaySaleActive(at(LAST_SECOND), {}), true);
assert.strictEqual(sale.holidaySaleActive(at(AFTER), {}), false);
assert.strictEqual(sale.reginaStamp(at(AFTER)), '2026-12-01');
assert.strictEqual(sale.holidaySaleActive(at(FIRST_MINUTE), { HOLIDAY_SALE_ENABLED: 'false' }), false);
assert.strictEqual(sale.holidaySaleActive(at(FIRST_MINUTE), { HOLIDAY_SALE_ENABLED: 'true' }), true);

assert.strictEqual(quoteAt(BEFORE, 4900), null);
assert.strictEqual(quoteAt(AFTER, 4900), null);
assert.strictEqual(quoteAt(FIRST_MINUTE, 4900, { HOLIDAY_SALE_ENABLED: 'false' }), null);

const posterSale = quoteAt(FIRST_MINUTE, 4900);
assert.strictEqual(posterSale.name, 'Black Friday 10% off');
assert.strictEqual(posterSale.percent, 10);
assert.strictEqual(posterSale.listCents, 4900);
assert.strictEqual(posterSale.discountCents, 490);
assert.strictEqual(posterSale.chargeCents, 4410);
assert.strictEqual(quoteAt(LAST_MINUTE, 4900).chargeCents, 4410);
assert.strictEqual(quoteAt(LAST_SECOND, 4900).discountCents, 490);

const pst = sale.includedTaxCents(4410, [6]);
assert.strictEqual(pst, 250);
assert.strictEqual(4410 - pst, 4160);
assert.strictEqual(posterSale.chargeCents, posterSale.listCents - posterSale.discountCents);

const both = sale.includedTaxCents(4410, [6, 5]);
assert.strictEqual(both, 437);
assert.strictEqual(4410 - both + both, 4410);

assert.strictEqual(sale.bankersRoundDiv(1, 2), 0);
assert.strictEqual(sale.bankersRoundDiv(5, 2), 2);
assert.strictEqual(sale.bankersRoundDiv(3, 2), 2);
assert.strictEqual(sale.percentOffCents(1005, 10), 101);
assert.strictEqual(sale.percentOffCents(4900, 10), 490);

const mixed = quoteAt(FIRST_MINUTE, 4900 + 7900 + 12500);
assert.strictEqual(mixed.listCents, 25300);
assert.strictEqual(mixed.discountCents, 2530);
assert.strictEqual(mixed.chargeCents, 22770);

async function main() {
  const before = await postAt(BEFORE, [poster()], {}, 4900);
  assert.strictEqual(before.res.statusCode, 200);
  assert.strictEqual(before.captured.order.discounts, undefined);
  assert.strictEqual(before.captured.order.metadata.sale, undefined);
  assert.strictEqual(before.captured.order.line_items[0].base_price_money.amount, 4900);
  assert.strictEqual(before.captured.order.taxes[0].type, 'INCLUSIVE');
  assert.strictEqual(before.body.total, 49);

  const open = await postAt(FIRST_MINUTE, [poster()], {}, 4410);
  assert.strictEqual(open.res.statusCode, 200);
  assert.strictEqual(open.captured.order.line_items.length, 1);
  assert.strictEqual(open.captured.order.line_items[0].base_price_money.amount, 4900);
  assert.strictEqual(open.captured.order.discounts.length, 1);
  const discount = open.captured.order.discounts[0];
  assert.strictEqual(discount.name, 'Black Friday 10% off');
  assert.strictEqual(discount.scope, 'ORDER');
  assert.strictEqual(discount.amount_money.amount, 490);
  assert.strictEqual(discount.amount_money.currency, 'CAD');
  assert.strictEqual(discount.percentage, undefined);
  assert.strictEqual(open.captured.order.taxes[0].type, 'INCLUSIVE');
  assert.strictEqual(open.captured.order.taxes[0].percentage, '6');
  assert.strictEqual(open.captured.order.metadata.sale, 'Black Friday 10% off');
  assert.strictEqual(open.captured.order.metadata.sale_discount_cents, '490');
  assert.strictEqual(open.body.total, 44.1);
  assert.strictEqual(Math.round(open.body.total * 100), 4410);

  const mismatch = await postAt(FIRST_MINUTE, [poster()], {}, 4900);
  assert.strictEqual(mismatch.res.statusCode, 502);
  assert.match(mismatch.body.error, /did not match/);

  const addedTax = await postAt(FIRST_MINUTE, [poster()], {}, 4410 + 250);
  assert.strictEqual(addedTax.res.statusCode, 502);

  const withGst = await postAt(FIRST_MINUTE, [poster()], { GST_ENABLED: 'true', GST_PCT: '5' }, 4410);
  assert.strictEqual(withGst.res.statusCode, 200);
  assert.strictEqual(withGst.captured.order.taxes.length, 2);
  assert.strictEqual(withGst.captured.order.taxes[0].type, 'INCLUSIVE');
  assert.strictEqual(withGst.captured.order.taxes[1].type, 'INCLUSIVE');
  assert.strictEqual(withGst.captured.order.discounts[0].amount_money.amount, 490);
  assert.strictEqual(Math.round(withGst.body.total * 100), 4410);

  const gstAdded = await postAt(FIRST_MINUTE, [poster()], { GST_ENABLED: 'true' }, 4410 + 437);
  assert.strictEqual(gstAdded.res.statusCode, 502);

  const last = await postAt(LAST_MINUTE, [poster()], {}, 4410);
  assert.strictEqual(last.res.statusCode, 200);
  assert.strictEqual(last.captured.order.discounts[0].amount_money.amount, 490);

  const after = await postAt(AFTER, [poster()], {}, 4900);
  assert.strictEqual(after.res.statusCode, 200);
  assert.strictEqual(after.captured.order.discounts, undefined);
  assert.strictEqual(after.body.total, 49);

  const killed = await postAt(FIRST_MINUTE, [poster()], { HOLIDAY_SALE_ENABLED: 'false' }, 4900);
  assert.strictEqual(killed.res.statusCode, 200);
  assert.strictEqual(killed.captured.order.discounts, undefined);
  assert.strictEqual(killed.body.total, 49);

  const bundle = await postAt(FIRST_MINUTE, [
    poster(),
    { id: 'stories-of-the-west', format: 'book', qty: 1 },
  ], {}, 11520);
  assert.strictEqual(bundle.res.statusCode, 200);
  assert.strictEqual(bundle.captured.order.line_items[0].base_price_money.amount, 4900);
  assert.strictEqual(bundle.captured.order.line_items[1].base_price_money.amount, 7900);
  assert.strictEqual(bundle.captured.order.discounts.length, 1);
  assert.strictEqual(bundle.captured.order.discounts[0].amount_money.amount, 1280);
  assert.strictEqual(Math.round(bundle.body.total * 100), 11520);

  const fromSquare = wh.buildAlert({
    order: {
      id: 'ORDER49',
      reference_id: 'DS-BF',
      metadata: { source: 'dustandspurs.ca website', sale: 'Black Friday 10% off', sale_discount_cents: '490' },
      line_items: [{
        name: 'Against the Light',
        variation_name: 'Fine Art Poster · 12 × 18" · Standard poster',
        quantity: '1',
        base_price_money: { amount: 4900, currency: 'CAD' },
        total_money: { amount: 4410, currency: 'CAD' },
        note: 'Collection: Ranch Life · Display: Standard poster',
      }],
      discounts: [{
        name: 'Black Friday 10% off',
        amount_money: { amount: 490, currency: 'CAD' },
        applied_money: { amount: 490, currency: 'CAD' },
      }],
      total_money: { amount: 4410, currency: 'CAD' },
      total_tax_money: { amount: 250, currency: 'CAD' },
      total_discount_money: { amount: 490, currency: 'CAD' },
      taxes: [{ name: 'Saskatchewan PST (included in price)', percentage: '6', type: 'INCLUSIVE' }],
    },
    payment: { id: 'PAY49' },
  });
  [
    'Unit price: CA$49.00',
    'Line total: CA$44.10',
    'Discount already included in the total',
    'Black Friday 10% off: -CA$4.90',
    'Subtotal before included tax: CA$41.60',
    'Tax included: CA$2.50',
    'Total: CA$44.10',
  ].forEach((line) => assert.ok(fromSquare.text.includes(line), 'missing ' + line));
  assert.strictEqual(fromSquare.text.includes('\u2014'), false);
  assert.strictEqual((fromSquare.text.match(/Black Friday 10% off: -CA\$4\.90/g) || []).length, 1);

  const fromMeta = wh.buildAlert({
    order: {
      id: 'ORDER49B',
      reference_id: 'DS-BF2',
      metadata: { source: 'dustandspurs.ca website', sale: 'Black Friday 10% off', sale_discount_cents: '490' },
      line_items: [],
      total_money: { amount: 4410, currency: 'CAD' },
      total_tax_money: { amount: 250, currency: 'CAD' },
    },
    payment: { id: 'PAY49B' },
  });
  assert.ok(fromMeta.text.includes('Black Friday 10% off: -CA$4.90'));
  assert.ok(fromMeta.text.includes('Discount already included in the total'));

  console.log('holiday sale tests passed');
  console.log('example: one 12x18 standard poster lists at CA$49.00, discount CA$4.90, due CA$44.10, PST included CA$2.50');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
