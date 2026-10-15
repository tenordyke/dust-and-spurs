const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const wh = require('../netlify/functions/square-webhook');
const checkout = require('../netlify/functions/checkout');

const NOTIFY = 'https://dustandspurs.ca/.netlify/functions/square-webhook';
const KEY = 'test-signature-key';
const ENV_KEYS = [
  'SQUARE_WEBHOOK_SIGNATURE_KEY', 'SQUARE_WEBHOOK_NOTIFICATION_URL', 'SQUARE_ACCESS_TOKEN',
  'SQUARE_ENV', 'SQUARE_LOCATION_ID', 'SQUARE_VERSION', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER',
  'SMTP_PASS', 'SMTP_FROM', 'RESEND_API_KEY', 'RESEND_FROM', 'ORDER_ALERT_EMAIL', 'SITE_URL',
];

function sign(url, body, key) {
  return crypto.createHmac('sha256', key).update(url + body, 'utf8').digest('base64');
}

function sampleOrder() {
  return {
    id: 'ORDER1',
    location_id: 'LOC1',
    version: 3,
    reference_id: 'DS-TEST',
    state: 'OPEN',
    metadata: {
      source: 'dustandspurs.ca website',
      ship_to_name: 'Alix Dyck',
      ship_to: '1 Main St, Saskatoon, Saskatchewan, Canada S7K 0A1',
      customer_email: 'buyer@example.com',
      customer_phone: '306-555-0199',
    },
    line_items: [
      {
        name: 'Where They Gather',
        variation_name: 'Fine Art Print · 12 × 18"',
        note: 'Collection: Prairie',
        quantity: '1',
        base_price_money: { amount: 22500, currency: 'CAD' },
        total_money: { amount: 22500, currency: 'CAD' },
      },
      {
        name: 'Quiet Hour',
        variation_name: 'Framed Print · 16 × 24" · Walnut frame',
        note: 'Collection: Ranch Light · Frame: Walnut',
        quantity: '2',
        base_price_money: { amount: 67500, currency: 'CAD' },
        total_money: { amount: 135000, currency: 'CAD' },
      },
    ],
    fulfillments: [{
      type: 'SHIPMENT',
      shipment_details: {
        recipient: {
          display_name: 'Alix Dyck',
          email_address: 'buyer@example.com',
          phone_number: '+13065550199',
          address: {
            address_line_1: '1 Main St',
            locality: 'Saskatoon',
            administrative_district_level_1: 'SK',
            postal_code: 'S7K 0A1',
            country: 'CA',
          },
        },
      },
    }],
    total_money: { amount: 157500, currency: 'CAD' },
    total_tax_money: { amount: 8915, currency: 'CAD' },
    total_service_charge_money: { amount: 0, currency: 'CAD' },
    taxes: [{ name: 'Saskatchewan PST (included in price)', percentage: '6' }],
    tenders: [{ payment_id: 'PAY1', type: 'CARD' }],
  };
}

function paymentEvent(status) {
  return {
    type: 'payment.updated',
    data: { object: { payment: { id: 'PAY1', status: status || 'COMPLETED', order_id: 'ORDER1' } } },
  };
}

function orderEvent(state) {
  return {
    type: 'order.updated',
    data: { object: { order_updated: { order_id: 'ORDER1', state: state || 'COMPLETED' } } },
  };
}

function post(payload, options) {
  const opts = options || {};
  const raw = opts.raw != null ? opts.raw : JSON.stringify(payload);
  const signedBody = opts.signedBody != null ? opts.signedBody : raw;
  const signature = opts.signature != null ? opts.signature : sign(NOTIFY, signedBody, KEY);
  return {
    httpMethod: 'POST',
    headers: { 'x-square-hmacsha256-signature': signature },
    body: raw,
    isBase64Encoded: Boolean(opts.encoded),
  };
}

function useEnv(extra) {
  const prev = {};
  ENV_KEYS.forEach((key) => { prev[key] = process.env[key]; delete process.env[key]; });
  Object.assign(process.env, {
    SQUARE_WEBHOOK_SIGNATURE_KEY: KEY,
    SQUARE_WEBHOOK_NOTIFICATION_URL: NOTIFY,
    SQUARE_ACCESS_TOKEN: 'test-token',
    SQUARE_ENV: 'production',
    SQUARE_LOCATION_ID: 'LOC1',
    SMTP_HOST: 'mail.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'hello@dustandspurs.ca',
    SMTP_PASS: 'not-a-real-password',
  }, extra || {});
  return function restore() {
    ENV_KEYS.forEach((key) => {
      if (prev[key] == null) delete process.env[key];
      else process.env[key] = prev[key];
    });
  };
}

function installSquare(state) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    calls.push({ url: String(url), method });
    if (String(url).includes('/v2/orders/ORDER1') && method === 'GET') {
      return { ok: true, status: 200, text: async () => JSON.stringify({ order: state.order }) };
    }
    if (String(url).includes('/v2/orders/ORDER1') && method === 'PUT') {
      const body = JSON.parse(opts.body);
      if (state.mismatchOnce) {
        state.mismatchOnce = false;
        if (state.stealLock) {
          state.order = Object.assign({}, state.order, {
            version: state.order.version + 1,
            metadata: Object.assign({}, state.order.metadata, { ds_alert_lock: new Date().toISOString() }),
          });
        }
        return { ok: false, status: 409, text: async () => JSON.stringify({ errors: [{ code: 'VERSION_MISMATCH' }] }) };
      }
      const metadata = Object.assign({}, state.order.metadata);
      Object.entries(body.order.metadata).forEach(([key, value]) => {
        if (value == null) delete metadata[key];
        else metadata[key] = value;
      });
      state.order = Object.assign({}, state.order, { version: state.order.version + 1, metadata });
      state.puts.push(body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ order: state.order }) };
    }
    if (String(url).includes('/v2/payments/PAY1')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ payment: state.payment }) };
    }
    return { ok: false, status: 404, text: async () => JSON.stringify({ errors: [{ code: 'NOT_FOUND' }] }) };
  };
  return { calls, restore() { global.fetch = original; } };
}

function freshState() {
  return {
    order: sampleOrder(),
    payment: { id: 'PAY1', status: 'COMPLETED', order_id: 'ORDER1', buyer_email_address: 'buyer@example.com' },
    puts: [],
    mismatchOnce: false,
    stealLock: false,
  };
}

async function test(name, fn) {
  wh.setSendOverride(null);
  try {
    await fn();
    console.log('ok  ' + name);
  } catch (err) {
    console.error('FAIL ' + name);
    throw err;
  } finally {
    wh.setSendOverride(null);
  }
}

async function main() {
  await test('signature matches the Square sample and rejects a tampered body', () => {
    assert.strictEqual(wh.verifySquareSignature({
      signature: '2kRE5qRU2tR+tBGlDwMEw2avJ7QM4ikPYD/PJ3bd9Og=',
      notificationUrl: 'https://example.com/webhook',
      rawBody: '{"hello":"world"}',
      signatureKey: 'asdf1234',
    }), true);
    assert.strictEqual(wh.verifySquareSignature({
      signature: '2kRE5qRU2tR+tBGlDwMEw2avJ7QM4ikPYD/PJ3bd9Og=',
      notificationUrl: 'https://example.com/webhook',
      rawBody: '{"hello":"world"} ',
      signatureKey: 'asdf1234',
    }), false);
    assert.strictEqual(wh.verifySquareSignature({
      signature: 'short',
      notificationUrl: 'https://example.com/webhook',
      rawBody: '{"hello":"world"}',
      signatureKey: 'asdf1234',
    }), false);
  });

  await test('phone numbers become E.164', () => {
    assert.strictEqual(wh.normalizePhone('(306) 555-0199'), '+13065550199');
    assert.strictEqual(wh.normalizePhone('13065550199'), '+13065550199');
    assert.strictEqual(wh.normalizePhone('+1 306 555 0199'), '+13065550199');
    assert.strictEqual(wh.normalizePhone('555-0199'), null);
    assert.strictEqual(wh.normalizePhone(''), null);
  });

  await test('item lines keep type, size, and frame color', () => {
    const framed = wh.describeItem({
      name: 'Quiet Hour',
      variation_name: 'Framed Print · 16 × 24" · Black frame',
      quantity: '1',
      note: 'Collection: Ranch Light · Frame: Black',
    });
    assert.strictEqual(framed.type, 'Framed Print');
    assert.strictEqual(framed.size, '16 × 24');
    assert.strictEqual(framed.frame, 'Black');
    assert.strictEqual(framed.display, '');
    const canvas = wh.describeItem({ variation_name: 'Gallery Wrapped Canvas · 24 × 36"', quantity: '1' });
    assert.strictEqual(canvas.type, 'Gallery Wrapped Canvas');
    assert.strictEqual(canvas.size, '24 × 36');
    assert.strictEqual(canvas.frame, '');
    assert.strictEqual(canvas.display, '');
    const poster = wh.describeItem({
      name: 'Peace in Motion',
      variation_name: 'Fine Art Poster · 12 × 18" · Hanging poster',
      quantity: '2',
      base_price_money: { amount: 6500, currency: 'CAD' },
      note: 'Collection: Quiet Presence · Display: Hanging poster',
    });
    assert.strictEqual(poster.name, 'Peace in Motion');
    assert.strictEqual(poster.type, 'Fine Art Poster');
    assert.strictEqual(poster.size, '12 × 18');
    assert.strictEqual(poster.display, 'Hanging poster');
    assert.strictEqual(poster.frame, '');
    assert.strictEqual(poster.quantity, 2);
    assert.strictEqual(poster.unitCents, 6500);
    const book = wh.describeItem({
      name: 'Dust & Spurs: Stories of the West',
      variation_name: 'Hardcover Photo Book · 8 × 11"',
      quantity: '1',
      base_price_money: { amount: 7900, currency: 'CAD' },
      note: '58 pages, landscape',
    });
    assert.strictEqual(book.type, 'Hardcover Photo Book');
    assert.strictEqual(book.size, '8 × 11');
    assert.strictEqual(book.display, '');
    assert.strictEqual(book.unitCents, 7900);
  });

  await test('alert copy lists the order, the buyer, and Gelato with no em dash', () => {
    const alert = wh.buildAlert({
      order: sampleOrder(),
      payment: { id: 'PAY1', status: 'COMPLETED' },
    });
    assert.strictEqual(alert.subject, 'Paid website order DS-TEST');
    const text = alert.text;
    [
      'Place the matching order in Gelato.',
      'Square order id: ORDER1',
      'Reference: DS-TEST',
      'Payment id: PAY1',
      'Where They Gather',
      'Type: Fine Art Print',
      'Size: 12 × 18',
      'Quiet Hour',
      'Type: Framed Print',
      'Size: 16 × 24',
      'Frame: Walnut',
      'Quantity: 2',
      'Unit price: CA$675.00',
      'Line total: CA$1,350.00',
      'Collection: Prairie',
      'Subtotal before included tax: CA$1,485.85',
      'Tax included: CA$89.15',
      'Shipping: Included in the item prices',
      'Total: CA$1,575.00',
      'Name: Alix Dyck',
      'Email: buyer@example.com',
      'Phone: +13065550199',
      '1 Main St',
      'Saskatoon, SK S7K 0A1',
      'Canada',
    ].forEach((part) => assert.ok(text.includes(part), 'missing: ' + part));
    assert.strictEqual(text.includes('\u2014'), false);
    assert.strictEqual(text.includes('\u2013'), false);
    assert.strictEqual(alert.replyTo, 'buyer@example.com');
    const poisoned = sampleOrder();
    poisoned.fulfillments[0].shipment_details.recipient.email_address = 'buyer@example.com\r\nBcc: other@example.com';
    poisoned.metadata.customer_email = 'not-an-email';
    const blocked = wh.buildAlert({ order: poisoned, payment: { id: 'PAY1' } });
    assert.strictEqual(blocked.replyTo, '');
    assert.strictEqual(blocked.text.includes('Bcc:'), false);
  });

  await test('a separate shipping charge is shown as shipping', () => {
    const order = sampleOrder();
    order.total_service_charge_money = { amount: 1200, currency: 'CAD' };
    order.total_money = { amount: 158700, currency: 'CAD' };
    const alert = wh.buildAlert({ order, payment: { id: 'PAY1' } });
    assert.ok(alert.text.includes('Shipping: CA$12.00'));
    assert.strictEqual(alert.text.includes('Included in the item prices'), false);
  });

  await test('mail prefers the mailbox SMTP when both providers are set', () => {
    const restore = useEnv({ RESEND_API_KEY: 're_test', RESEND_FROM: 'hello@dustandspurs.ca' });
    try {
      assert.strictEqual(wh.mailMode(), 'smtp');
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      assert.strictEqual(wh.mailMode(), 'resend');
      delete process.env.RESEND_FROM;
      assert.strictEqual(wh.mailMode(), 'incomplete');
    } finally { restore(); }
  });

  await test('a bad signature is rejected and Square is not called', async () => {
    const restore = useEnv();
    const state = freshState();
    const net = installSquare(state);
    try {
      const res = await wh.handler(post(paymentEvent(), { signature: 'nope-not-the-signature-value' }));
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(net.calls.length, 0);
    } finally { net.restore(); restore(); }
  });

  await test('other event types are acknowledged and ignored', async () => {
    const restore = useEnv();
    const net = installSquare(freshState());
    try {
      const res = await wh.handler(post({ type: 'customer.created', data: { object: {} } }));
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(net.calls.length, 0);
      const approved = await wh.handler(post(paymentEvent('APPROVED')));
      assert.strictEqual(approved.statusCode, 200);
      assert.strictEqual(net.calls.length, 0);
    } finally { net.restore(); restore(); }
  });

  await test('a base64 function body is verified from the original bytes', async () => {
    const restore = useEnv();
    const net = installSquare(freshState());
    try {
      const raw = JSON.stringify({ type: 'customer.created', data: {} });
      const res = await wh.handler(post(null, {
        raw: Buffer.from(raw).toString('base64'),
        signedBody: raw,
        encoded: true,
      }));
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(net.calls.length, 0);
    } finally { net.restore(); restore(); }
  });

  await test('a completed website payment sends one alert and a repeat does not', async () => {
    const restore = useEnv();
    const state = freshState();
    const net = installSquare(state);
    const sent = [];
    wh.setSendOverride(async (message) => { sent.push(message); });
    try {
      const first = await wh.handler(post(paymentEvent()));
      assert.strictEqual(first.statusCode, 200);
      assert.strictEqual(sent.length, 1);
      assert.ok(state.order.metadata.ds_alert_sent);
      assert.strictEqual(state.order.metadata.ds_alert_lock, undefined);
      assert.ok(state.puts[0].order.metadata.ds_alert_lock);
      const second = await wh.handler(post(paymentEvent()));
      assert.strictEqual(second.statusCode, 200);
      assert.strictEqual(sent.length, 1);
      assert.strictEqual(state.puts.length, 2);
    } finally { net.restore(); restore(); }
  });

  await test('in person Square sales are not emailed', async () => {
    const restore = useEnv();
    const state = freshState();
    state.order.metadata = { source: 'Square POS' };
    state.order.reference_id = 'POS-9';
    const net = installSquare(state);
    const sent = [];
    wh.setSendOverride(async (message) => { sent.push(message); });
    try {
      const res = await wh.handler(post(paymentEvent()));
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(sent.length, 0);
      assert.strictEqual(state.puts.length, 0);
    } finally { net.restore(); restore(); }
  });

  await test('a fresh lock makes Square retry, and a stale lock can be taken', async () => {
    const restore = useEnv();
    const state = freshState();
    state.order.metadata.ds_alert_lock = new Date().toISOString();
    const net = installSquare(state);
    const sent = [];
    wh.setSendOverride(async (message) => { sent.push(message); });
    try {
      const busy = await wh.handler(post(paymentEvent()));
      assert.strictEqual(busy.statusCode, 500);
      assert.strictEqual(sent.length, 0);
      state.order.metadata.ds_alert_lock = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const retry = await wh.handler(post(paymentEvent()));
      assert.strictEqual(retry.statusCode, 200);
      assert.strictEqual(sent.length, 1);
    } finally { net.restore(); restore(); }
  });

  await test('a lost version race does not send a second email', async () => {
    const restore = useEnv();
    const state = freshState();
    state.mismatchOnce = true;
    state.stealLock = true;
    const net = installSquare(state);
    const sent = [];
    wh.setSendOverride(async (message) => { sent.push(message); });
    try {
      const res = await wh.handler(post(paymentEvent()));
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(sent.length, 0);
    } finally { net.restore(); restore(); }
  });

  await test('order.updated waits for a completed payment', async () => {
    const restore = useEnv();
    const state = freshState();
    state.order.tenders = [];
    const net = installSquare(state);
    const sent = [];
    wh.setSendOverride(async (message) => { sent.push(message); });
    try {
      const waiting = await wh.handler(post(orderEvent()));
      assert.strictEqual(waiting.statusCode, 200);
      assert.strictEqual(sent.length, 0);
      assert.strictEqual(state.puts.length, 0);
      state.order.tenders = [{ payment_id: 'PAY1' }];
      state.payment.status = 'APPROVED';
      const approved = await wh.handler(post(orderEvent()));
      assert.strictEqual(approved.statusCode, 200);
      assert.strictEqual(sent.length, 0);
      state.payment.status = 'COMPLETED';
      const paid = await wh.handler(post(orderEvent()));
      assert.strictEqual(paid.statusCode, 200);
      assert.strictEqual(sent.length, 1);
      assert.ok(sent[0].text.includes('Payment id: PAY1'));
    } finally { net.restore(); restore(); }
  });

  await test('a failed send releases the lock and does not mark the order sent', async () => {
    const restore = useEnv();
    const state = freshState();
    const net = installSquare(state);
    wh.setSendOverride(async () => { throw Object.assign(new Error('mailbox refused'), { code: 'EAUTH' }); });
    try {
      const res = await wh.handler(post(paymentEvent()));
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(state.order.metadata.ds_alert_sent, undefined);
      assert.strictEqual(state.order.metadata.ds_alert_lock, undefined);
    } finally { net.restore(); restore(); }
  });

  await test('missing mail or signature config asks Square to retry', async () => {
    const restore = useEnv();
    const net = installSquare(freshState());
    try {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      const nomail = await wh.handler(post(paymentEvent()));
      assert.strictEqual(nomail.statusCode, 503);
      assert.strictEqual(net.calls.length, 0);
      delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
      const nosig = await wh.handler(post(paymentEvent()));
      assert.strictEqual(nosig.statusCode, 503);
    } finally { net.restore(); restore(); }
  });

  await test('checkout requires a phone and prefills Square shipping', async () => {
    const restore = useEnv({ SITE_URL: 'https://dustandspurs.ca' });
    const original = global.fetch;
    let captured = null;
    global.fetch = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          payment_link: { url: 'https://square.link/u/test', order_id: 'ORDER1' },
          related_resources: { orders: [{ total_money: { amount: 12500, currency: 'CAD' } }] },
        }),
      };
    };
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
    const items = [{ title: 'Where They Gather', collection: 'Prairie', tier: 'entry', format: 'print', size: '8x12', qty: 1 }];
    try {
      const missing = await checkout.handler({
        httpMethod: 'POST',
        headers: { host: 'dustandspurs.ca' },
        body: JSON.stringify({ items, ship: Object.assign({}, ship, { phone: '' }) }),
      });
      assert.strictEqual(missing.statusCode, 400);
      assert.strictEqual(captured, null);
      const bad = await checkout.handler({
        httpMethod: 'POST',
        headers: { host: 'dustandspurs.ca' },
        body: JSON.stringify({ items, ship: Object.assign({}, ship, { phone: '555' }) }),
      });
      assert.strictEqual(bad.statusCode, 400);
      const ok = await checkout.handler({
        httpMethod: 'POST',
        headers: { host: 'dustandspurs.ca' },
        body: JSON.stringify({ items, ship }),
      });
      assert.strictEqual(ok.statusCode, 200);
      assert.strictEqual(captured.pre_populated_data.buyer_phone_number, '+13065550199');
      assert.strictEqual(captured.pre_populated_data.buyer_address.address_line_1, '1 Main St');
      assert.strictEqual(captured.pre_populated_data.buyer_address.country, 'CA');
      assert.strictEqual(captured.checkout_options.ask_for_shipping_address, true);
      assert.strictEqual(captured.order.metadata.customer_phone, '(306) 555-0199');
      assert.strictEqual(captured.order.metadata.source, 'dustandspurs.ca website');
      assert.strictEqual(captured.order.taxes[0].type, 'INCLUSIVE');
      assert.strictEqual(captured.order.line_items[0].base_price_money.amount, 12500);
      assert.ok(captured.order.reference_id.startsWith('DS-'));
    } finally {
      global.fetch = original;
      restore();
    }
  });

  await test('the shipping form collects a phone for pay and quote', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="cPhone"'));
    assert.ok(html.includes('phone:document.getElementById(\'cPhone\').value.trim()'));
    assert.ok(html.includes('Phone: ${ship.phone}'));
    assert.ok(html.includes('${ship.phone}'));
  });

  await test('poster and book lines name the design, display, and price', () => {
    const alert = wh.buildAlert({
      order: {
        id: 'ORDER2',
        reference_id: 'DS-POST',
        state: 'OPEN',
        metadata: { source: 'dustandspurs.ca website' },
        total_money: { amount: 12800, currency: 'CAD' },
        total_tax_money: { amount: 0 },
        line_items: [
          {
            name: 'Against the Light',
            variation_name: 'Fine Art Poster · 12 × 18" · Standard poster',
            quantity: '1',
            base_price_money: { amount: 4900, currency: 'CAD' },
            total_money: { amount: 4900, currency: 'CAD' },
            note: 'Collection: Ranch Life · Display: Standard poster',
          },
          {
            name: 'Dust & Spurs: Stories of the West',
            variation_name: 'Hardcover Photo Book · 8 × 11"',
            quantity: '1',
            base_price_money: { amount: 7900, currency: 'CAD' },
            total_money: { amount: 7900, currency: 'CAD' },
            note: '58 pages, landscape',
          },
        ],
      },
      payment: { id: 'PAY2', status: 'COMPLETED' },
    });
    const text = alert.text;
    [
      '1. Against the Light',
      'Type: Fine Art Poster',
      'Size: 12 × 18',
      'Display: Standard poster',
      'Quantity: 1',
      'Unit price: CA$49.00',
      'Line total: CA$49.00',
      'Collection: Ranch Life',
      '2. Dust & Spurs: Stories of the West',
      'Type: Hardcover Photo Book',
      'Size: 8 × 11',
      'Unit price: CA$79.00',
      '58 pages, landscape',
    ].forEach((line) => assert.ok(text.includes(line), 'missing ' + line));
    assert.ok(!text.includes('\u2014'));
    assert.ok(!text.includes('Frame:'));
  });

  await test('posters and the photo book keep inclusive tax and print prices', async () => {
    const restore = useEnv({ SITE_URL: 'https://dustandspurs.ca' });
    const original = global.fetch;
    let squareTotal = 26900;
    let captured = null;
    global.fetch = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          payment_link: { url: 'https://square.link/u/test', order_id: 'ORDER1' },
          related_resources: { orders: [{ total_money: { amount: squareTotal, currency: 'CAD' } }] },
        }),
      };
    };
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
    const post = (items) => checkout.handler({
      httpMethod: 'POST',
      headers: { host: 'dustandspurs.ca' },
      body: JSON.stringify({ items, ship }),
    });
    try {
      const mixed = await post([
        { id: 'peace-in-motion', title: 'Tampered name', collection: 'Nope', format: 'poster', display: 'hanging', qty: 1, price: 1 },
        { id: 'stories-of-the-west', title: 'Tampered book', format: 'book', qty: 1, price: 1 },
        { title: 'Where They Gather', collection: 'Prairie', tier: 'entry', format: 'print', size: '8x12', qty: 1 },
      ]);
      assert.strictEqual(mixed.statusCode, 200);
      const lines = captured.order.line_items;
      assert.strictEqual(lines.length, 3);
      assert.strictEqual(lines[0].name, 'Peace in Motion');
      assert.strictEqual(lines[0].variation_name, 'Fine Art Poster · 12 × 18" · Hanging poster');
      assert.strictEqual(lines[0].note, 'Collection: Quiet Presence · Display: Hanging poster');
      assert.strictEqual(lines[0].base_price_money.amount, 6500);
      assert.strictEqual(lines[1].name, 'Dust & Spurs: Stories of the West');
      assert.strictEqual(lines[1].variation_name, 'Hardcover Photo Book · 8 × 11"');
      assert.strictEqual(lines[1].note, '58 pages, landscape');
      assert.strictEqual(lines[1].base_price_money.amount, 7900);
      assert.strictEqual(lines[2].name, 'Where They Gather');
      assert.strictEqual(lines[2].variation_name, 'Fine Art Print · 8 × 12"');
      assert.strictEqual(lines[2].base_price_money.amount, 12500);
      assert.strictEqual(captured.order.taxes[0].type, 'INCLUSIVE');
      assert.strictEqual(captured.order.service_charges, undefined);
      squareTotal = 4900;
      const standard = await post([{ id: 'against-the-light', format: 'poster', display: 'standard', qty: 1 }]);
      assert.strictEqual(standard.statusCode, 200);
      assert.strictEqual(captured.order.line_items[0].name, 'Against the Light');
      assert.strictEqual(captured.order.line_items[0].variation_name, 'Fine Art Poster · 12 × 18" · Standard poster');
      assert.strictEqual(captured.order.line_items[0].base_price_money.amount, 4900);
      const badDisplay = await post([{ id: 'rooted', format: 'poster', display: 'framed', qty: 1 }]);
      assert.strictEqual(badDisplay.statusCode, 400);
      const unknown = await post([{ id: 'not-a-poster', format: 'poster', display: 'standard', qty: 1 }]);
      assert.strictEqual(unknown.statusCode, 400);
      const badBook = await post([{ id: 'western-soul-journal', format: 'book', qty: 1 }]);
      assert.strictEqual(badBook.statusCode, 400);
      const quote = await post([{ id: 'kindred', format: 'poster', display: 'standard', qty: 1 }]);
      const quoted = await checkout.handler({
        httpMethod: 'POST',
        headers: { host: 'dustandspurs.ca' },
        body: JSON.stringify({ items: [{ id: 'kindred', format: 'poster', display: 'standard', qty: 1 }], ship: Object.assign({}, ship, { region: 'Quebec' }) }),
      });
      assert.strictEqual(quoted.statusCode, 400);
      assert.match(JSON.parse(quoted.body).error, /shipping quote/);
      const framed = await checkout.handler({
        httpMethod: 'POST',
        headers: { host: 'dustandspurs.ca' },
        body: JSON.stringify({
          items: [{ title: 'Quiet Hour', collection: 'Ranch Light', tier: 'core', format: 'framed', size: '12x18', frame: 'walnut', qty: 1 }],
          ship,
        }),
      });
      squareTotal = 52500;
      const framedOk = await checkout.handler({
        httpMethod: 'POST',
        headers: { host: 'dustandspurs.ca' },
        body: JSON.stringify({
          items: [{ title: 'Quiet Hour', collection: 'Ranch Light', tier: 'core', format: 'framed', size: '12x18', frame: 'walnut', qty: 1 }],
          ship,
        }),
      });
      assert.strictEqual(framed.statusCode, 502);
      assert.strictEqual(framedOk.statusCode, 200);
      assert.strictEqual(captured.order.line_items[0].base_price_money.amount, 52500);
      assert.strictEqual(captured.order.line_items[0].variation_name, 'Framed Print · 12 × 18" · Walnut frame');
    } finally {
      global.fetch = original;
      restore();
    }
  });

  await test('new product pages are linked and their copy has no em dash', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('data-route="posters"'));
    assert.ok(html.includes('data-route="book"'));
    assert.ok(html.includes('id="journal"'));
    assert.ok(html.includes('amazon.ca'));
    const posters = html.slice(html.indexOf('id="posters"'), html.indexOf('id="book"'));
    const book = html.slice(html.indexOf('id="book"'), html.indexOf('id="journal"'));
    assert.ok(posters.includes('Standard Poster, $49'));
    assert.ok(posters.includes('Hanging Poster, $65'));
    assert.ok(posters.includes('12 × 18 inches'));
    assert.ok(posters.includes('200 gsm matte'));
    assert.ok(book.includes('Stories of the West'));
    assert.ok(book.includes('58 pages'));
    assert.ok(book.includes('$79'));
    assert.ok(book.includes('assets/book/front-cover.jpg'));
    assert.ok(book.includes('assets/book/back-cover.jpg'));
    assert.ok(book.includes('Inside: title and introduction'));
    assert.ok(book.includes('Inside: Quiet Presence'));
    assert.ok(book.includes('Inside: Peace in Motion'));
    assert.ok(book.includes('loading="lazy"'));
    assert.ok(book.indexOf('front-cover.jpg') < book.indexOf('back-cover.jpg'));
    assert.ok(book.indexOf('Inside: title and introduction') < book.indexOf('Inside: Quiet Presence'));
    assert.ok(book.indexOf('Inside: Quiet Presence') < book.indexOf('Inside: Peace in Motion'));
    assert.ok(!posters.includes('\u2014') && !book.includes('\u2014'));
    assert.ok(html.includes("format==='poster')item.display=c.display"));
  });

  await test('nodemailer is installed for the SMTP path', () => {
    const nodemailer = require('nodemailer');
    assert.strictEqual(typeof nodemailer.createTransport, 'function');
  });

  console.log('all tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
