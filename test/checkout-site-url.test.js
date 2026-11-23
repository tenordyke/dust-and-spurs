const assert = require('assert');
const checkout = require('../netlify/functions/checkout');

const ENV_KEYS = [
  'SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID', 'SQUARE_ENV', 'SQUARE_VERSION',
  'SITE_URL', 'HOLIDAY_SALE_ENABLED', 'GST_ENABLED', 'GST_PCT', 'TAX_PST_PCT',
];

const CANONICAL = 'https://dustandspurs.ca';
const THANK_YOU = CANONICAL + '/#/thank-you';

function useEnv(extra) {
  const prev = {};
  ENV_KEYS.forEach((key) => { prev[key] = process.env[key]; delete process.env[key]; });
  Object.assign(process.env, {
    SQUARE_ACCESS_TOKEN: 'test-token',
    SQUARE_LOCATION_ID: 'LOC1',
    SQUARE_ENV: 'sandbox',
  }, extra || {});
  return function restore() {
    ENV_KEYS.forEach((key) => {
      if (prev[key] == null) delete process.env[key];
      else process.env[key] = prev[key];
    });
  };
}

function test(name, fn) {
  fn();
  console.log('ok ', name);
}

test('empty, canonical, www, and a trailing slash all use dustandspurs.ca', () => {
  assert.strictEqual(checkout.CANONICAL_SITE_URL, CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl(''), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('   '), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl(undefined), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl(CANONICAL), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('https://www.dustandspurs.ca'), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('https://dustandspurs.ca/'), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('  https://www.dustandspurs.ca/  '), CANONICAL);
});

test('a netlify.app address is ignored', () => {
  assert.strictEqual(checkout.checkoutSiteUrl('https://heroic-flan-fc0427.netlify.app'), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('https://heroic-flan-fc0427.netlify.app/'), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('https://deploy-preview-20--heroic-flan-fc0427.netlify.app'), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('https://netlify.app'), CANONICAL);
});

test('http and garbage fall back to the canonical site', () => {
  assert.strictEqual(checkout.checkoutSiteUrl('http://dustandspurs.ca'), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('http://example.com'), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('not a url'), CANONICAL);
  assert.strictEqual(checkout.checkoutSiteUrl('garbage'), CANONICAL);
});

test('any other https host is kept, without a path', () => {
  assert.strictEqual(checkout.checkoutSiteUrl('https://example.com'), 'https://example.com');
  assert.strictEqual(checkout.checkoutSiteUrl('https://example.com/shop/'), 'https://example.com');
});

const ship = {
  name: 'Pat Buyer',
  email: 'pat@example.com',
  phone: '306-555-0142',
  addr: '1801 Rose St',
  city: 'Regina',
  country: 'Canada',
  region: 'Saskatchewan',
  postal: 'S4P 0A1',
};

async function postCheckout(extraEnv, host) {
  const restore = useEnv(extraEnv);
  checkout.setCheckoutNow(function () { return new Date('2026-11-23T18:00:00.000Z'); });
  const original = global.fetch;
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        payment_link: { url: 'https://square.link/u/test', order_id: 'ORDER1' },
        related_resources: {
          orders: [{ total_money: { amount: 4900, currency: 'CAD' } }],
        },
      }),
    };
  };
  try {
    const res = await checkout.handler({
      httpMethod: 'POST',
      headers: { host: host },
      body: JSON.stringify({
        items: [{ id: 'against-the-light', format: 'poster', display: 'standard', qty: 1 }],
        ship: ship,
      }),
    });
    return { res: res, body: JSON.parse(res.body), captured: captured };
  } finally {
    checkout.setCheckoutNow(null);
    global.fetch = original;
    restore();
  }
}

async function main() {
  const fromNetlifyEnv = await postCheckout(
    { SITE_URL: 'https://heroic-flan-fc0427.netlify.app' },
    'heroic-flan-fc0427.netlify.app'
  );
  assert.strictEqual(fromNetlifyEnv.res.statusCode, 200);
  assert.strictEqual(fromNetlifyEnv.captured.checkout_options.redirect_url, THANK_YOU);

  const fromMissingEnv = await postCheckout({}, 'heroic-flan-fc0427.netlify.app');
  assert.strictEqual(fromMissingEnv.res.statusCode, 200);
  assert.strictEqual(fromMissingEnv.captured.checkout_options.redirect_url, THANK_YOU);

  console.log('checkout site url tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
