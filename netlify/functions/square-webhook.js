// Paid website orders: Square tells this function, and it emails hello@dustandspurs.ca.
//
// Act only on payment.updated or order.updated once a payment is COMPLETED.
// Verify x-square-hmacsha256-signature with SQUARE_WEBHOOK_SIGNATURE_KEY.
// The signed payload is SQUARE_WEBHOOK_NOTIFICATION_URL + the raw body.
// Fetch the order with SQUARE_ACCESS_TOKEN (SQUARE_ENV selects sandbox or production).
// One email per order: Square order metadata ds_alert_sent / ds_alert_lock.
//
// Email, first match wins:
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, optional SMTP_FROM
//   else RESEND_API_KEY and RESEND_FROM
// ORDER_ALERT_EMAIL defaults to hello@dustandspurs.ca.

const crypto = require('crypto');
const { normalizePhone } = require('../../lib/phone');

const LOCK_MS = 2 * 60 * 1000;
const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

function moneyCAD(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 'CA$0.00';
  const neg = n < 0;
  const abs = Math.abs(Math.round(n));
  const dollars = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rem = String(abs % 100).padStart(2, '0');
  return (neg ? '-' : '') + 'CA$' + dollars + '.' + rem;
}

function verifySquareSignature({ signature, notificationUrl, rawBody, signatureKey }) {
  if (!signature || !notificationUrl || signatureKey == null || rawBody == null) return false;
  const expected = crypto.createHmac('sha256', signatureKey).update(notificationUrl + rawBody, 'utf8').digest('base64');
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function header(event, name) {
  const headers = (event && event.headers) || {};
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === want) {
      const value = headers[key];
      return Array.isArray(value) ? String(value[0] || '') : String(value || '');
    }
  }
  return '';
}

function rawBody(event) {
  const body = event && event.body ? String(event.body) : '';
  if (event && event.isBase64Encoded && body) return Buffer.from(body, 'base64').toString('utf8');
  return body;
}

function squareCode(data) {
  return data && data.errors && data.errors[0] && data.errors[0].code;
}

function mailMode() {
  if (process.env.SMTP_HOST) {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
    return 'incomplete';
  }
  if (process.env.RESEND_API_KEY) {
    if (process.env.RESEND_FROM) return 'resend';
    return 'incomplete';
  }
  return 'missing';
}

function alertState(order, now = Date.now()) {
  const meta = (order && order.metadata) || {};
  if (meta.ds_alert_sent) return 'sent';
  if (meta.ds_alert_lock) {
    const at = Date.parse(meta.ds_alert_lock);
    if (Number.isFinite(at) && now - at < LOCK_MS) return 'locked';
  }
  return 'claim';
}

function isWebsiteOrder(order) {
  if (!order) return false;
  const meta = order.metadata || {};
  if (meta.source === 'dustandspurs.ca website') return true;
  return String(order.reference_id || '').startsWith('DS-');
}

function classifyEvent(payload) {
  const type = payload && payload.type;
  const object = payload && payload.data && payload.data.object;
  if (type === 'payment.updated') {
    const payment = object && object.payment;
    if (!payment || payment.status !== 'COMPLETED' || !payment.order_id) return null;
    return { orderId: payment.order_id, payment, requireCompletedPayment: false };
  }
  if (type === 'order.updated') {
    const updated = object && object.order_updated;
    if (!updated || updated.state !== 'COMPLETED') return null;
    const orderId = updated.order_id || (payload.data && payload.data.id);
    if (!orderId) return null;
    return { orderId, payment: null, requireCompletedPayment: true };
  }
  return null;
}

function describeItem(line) {
  const variation = String((line && line.variation_name) || '');
  const parts = variation.split(' · ').map((s) => s.trim()).filter(Boolean);
  let frame = '';
  let display = '';
  if (parts[2] && /frame/i.test(parts[2])) frame = parts[2].replace(/\s*frame$/i, '').trim();
  else if (parts[2] && /poster$/i.test(parts[2])) display = parts[2];
  const qty = Math.max(1, parseInt(line && line.quantity, 10) || 1);
  const unit = line && line.base_price_money ? Number(line.base_price_money.amount) : null;
  const lineTotal = line && line.total_money ? Number(line.total_money.amount)
    : line && line.gross_sales_money ? Number(line.gross_sales_money.amount)
    : unit == null ? null
    : unit * qty;
  return {
    name: (line && line.name) || 'Item',
    type: parts[0] || '',
    size: parts[1] ? parts[1].replace(/"$/, '') : '',
    frame,
    display,
    quantity: qty,
    unitCents: Number.isFinite(unit) ? unit : null,
    lineCents: Number.isFinite(lineTotal) ? lineTotal : null,
    note: (line && line.note) || '',
    variation,
    parsed: Boolean(parts[0] && parts[1]),
  };
}

function collectionFrom(note) {
  const parts = String(note || '').split(' · ');
  for (const part of parts) {
    const match = /^Collection:\s*(.*)$/.exec(part.trim());
    if (match && match[1].trim()) return match[1].trim();
  }
  return '';
}

function plainEmail(value) {
  const text = String(value || '').replace(/[\r\n]/g, '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return '';
  return text;
}

function countryName(code) {
  const names = { CA: 'Canada', US: 'United States' };
  const text = String(code || '').trim();
  return names[text] || text;
}

function shipmentRecipient(order) {
  const list = (order && order.fulfillments) || [];
  const shipment = list.find((item) => item && item.type === 'SHIPMENT' && item.shipment_details && item.shipment_details.recipient);
  return shipment ? shipment.shipment_details.recipient : null;
}

function personName(recipient, payment, meta) {
  if (recipient && recipient.display_name) return recipient.display_name;
  const addr = (payment && payment.shipping_address) || (recipient && recipient.address) || {};
  const fromAddress = [addr.first_name, addr.last_name].filter(Boolean).join(' ');
  if (fromAddress) return fromAddress;
  return (meta && meta.ship_to_name) || '';
}

function addressLines(recipient, payment, meta) {
  const addr = (recipient && recipient.address) || (payment && payment.shipping_address) || null;
  const unit = meta && meta.ship_unit ? String(meta.ship_unit).replace(/[\r\n]/g, ' ').trim() : '';
  if (!addr) {
    if (meta && meta.ship_to) return [meta.ship_to];
    return unit ? [unit] : [];
  }
  const lines = [];
  if (addr.address_line_1) lines.push(addr.address_line_1);
  if (addr.address_line_2) lines.push(addr.address_line_2);
  else if (unit && lines.every(function (line) { return line.indexOf(unit) === -1; })) lines.push(unit);
  const city = [addr.locality, addr.administrative_district_level_1].filter(Boolean).join(', ');
  const cityLine = [city, addr.postal_code].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  const country = countryName(addr.country);
  if (country) lines.push(country);
  return lines.length ? lines : ((meta && meta.ship_to) ? [meta.ship_to] : []);
}

function buildAlert({ order, payment }) {
  const meta = (order && order.metadata) || {};
  const recipient = shipmentRecipient(order);
  const name = personName(recipient, payment, meta);
  const email = [recipient && recipient.email_address, payment && payment.buyer_email_address, meta.customer_email]
    .map(plainEmail)
    .find(Boolean) || '';
  const phone = (recipient && recipient.phone_number) || meta.customer_phone || '';
  const address = addressLines(recipient, payment, meta);
  const total = Number(order && order.total_money && order.total_money.amount) || 0;
  const tax = Number(order && order.total_tax_money && order.total_tax_money.amount) || 0;
  const service = Number(order && order.total_service_charge_money && order.total_service_charge_money.amount) || 0;
  const subtotal = total - tax - service;
  const taxNames = ((order && order.taxes) || []).map((taxRow) => taxRow && taxRow.name).filter(Boolean);

  const lines = ['Place the matching order in Gelato.', '', 'Square order id: ' + ((order && order.id) || '')];
  lines.push('Reference: ' + ((order && order.reference_id) || ''));
  if (payment && payment.id) lines.push('Payment id: ' + payment.id);
  lines.push('', 'Items');

  const items = (order && order.line_items) || [];
  if (!items.length) lines.push('No line items were returned with this order.');
  items.forEach((line, index) => {
    const item = describeItem(line);
    lines.push('', (index + 1) + '. ' + item.name);
    if (item.type) lines.push('Type: ' + item.type);
    if (item.size) lines.push('Size: ' + item.size);
    if (item.frame) lines.push('Frame: ' + item.frame);
    if (item.display) lines.push('Display: ' + item.display);
    lines.push('Quantity: ' + item.quantity);
    if (item.unitCents != null) lines.push('Unit price: ' + moneyCAD(item.unitCents));
    if (item.lineCents != null) lines.push('Line total: ' + moneyCAD(item.lineCents));
    const collection = collectionFrom(item.note);
    if (collection) lines.push('Collection: ' + collection);
    if (item.note) lines.push('Note: ' + item.note);
    if (!item.parsed && item.variation) lines.push('Variation: ' + item.variation);
  });

  lines.push(
    '',
    'Subtotal before included tax: ' + moneyCAD(subtotal),
    'Tax included: ' + moneyCAD(tax) + (taxNames.length ? ' (' + taxNames.join(', ') + ')' : ''),
    'Shipping: ' + (service > 0 ? moneyCAD(service) : 'Included in the item prices'),
    'Total: ' + moneyCAD(total),
    '',
    'Customer',
    'Name: ' + name,
    'Email: ' + email,
    'Phone: ' + phone,
    '',
    'Shipping address',
    name || '(name not on the order)'
  );
  if (address.length) lines.push.apply(lines, address);
  else lines.push((meta.ship_to || '(address not on the order)'));
  lines.push('', 'Place the matching order in Gelato.');

  const reference = (order && (order.reference_id || order.id)) || 'order';
  return {
    subject: 'Paid website order ' + reference,
    text: lines.join('\n'),
    replyTo: /.+@.+\..+/.test(email) ? email : '',
    orderId: order && order.id,
  };
}

function squareBase() {
  const sandbox = (process.env.SQUARE_ENV || 'production').toLowerCase() === 'sandbox';
  return sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
}

async function square(method, path, body) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const res = await fetch(squareBase() + path, {
    method,
    headers: {
      'Square-Version': process.env.SQUARE_VERSION || '2024-11-20',
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = {}; }
  }
  return { ok: res.ok, status: res.status, data };
}

function nextMetadata(order, updates) {
  const metadata = {};
  const current = (order && order.metadata) || {};
  Object.keys(current).forEach((key) => {
    if (current[key] != null && current[key] !== '') metadata[key] = String(current[key]);
  });
  Object.keys(updates).forEach((key) => {
    const value = updates[key];
    metadata[key] = value == null || value === '' ? null : String(value);
  });
  return metadata;
}

async function getOrder(orderId) {
  const res = await square('GET', '/v2/orders/' + encodeURIComponent(orderId));
  if (!res.ok || !res.data.order) {
    const error = new Error('Square order fetch failed');
    error.code = squareCode(res.data) || String(res.status);
    throw error;
  }
  return res.data.order;
}

async function patchMetadata(order, updates) {
  const locationId = order.location_id || process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    const error = new Error('Square location is missing');
    error.code = 'NO_LOCATION';
    throw error;
  }
  return square('PUT', '/v2/orders/' + encodeURIComponent(order.id), {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: locationId,
      version: order.version,
      metadata: nextMetadata(order, updates),
    },
  });
}

async function findCompletedPayment(order) {
  const tenders = Array.isArray(order.tenders) ? order.tenders : [];
  let lookups = 0;
  let failures = 0;
  for (const tender of tenders) {
    const id = tender && (tender.payment_id || tender.id);
    if (!id) continue;
    lookups += 1;
    const res = await square('GET', '/v2/payments/' + encodeURIComponent(id));
    if (!res.ok || !res.data.payment) {
      failures += 1;
      continue;
    }
    if (res.data.payment.status === 'COMPLETED') return res.data.payment;
  }
  if (lookups > 0 && failures === lookups) {
    const error = new Error('Square payment fetch failed');
    error.code = 'PAYMENT_FETCH';
    throw error;
  }
  return null;
}

let sendOverride = null;
function setSendOverride(fn) { sendOverride = fn; }

async function sendSmtp(message) {
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: port === 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ORDER_ALERT_EMAIL || 'hello@dustandspurs.ca',
    replyTo: message.replyTo || undefined,
    subject: message.subject,
    text: message.text,
  });
}

async function sendResend(message) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'order-alert-' + (message.orderId || message.subject),
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [process.env.ORDER_ALERT_EMAIL || 'hello@dustandspurs.ca'],
      reply_to: message.replyTo || undefined,
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!res.ok) {
    const error = new Error('Resend rejected the order alert');
    error.code = String(res.status);
    throw error;
  }
}

async function sendAlert(message) {
  if (sendOverride) return sendOverride(message);
  const mode = mailMode();
  if (mode === 'smtp') return sendSmtp(message);
  if (mode === 'resend') return sendResend(message);
  throw new Error('Order alert email is not configured.');
}

async function claimOrder(orderId) {
  let order = await getOrder(orderId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!isWebsiteOrder(order)) return { stop: json(200, { ok: true }) };
    const state = alertState(order);
    if (state === 'sent') return { stop: json(200, { ok: true }) };
    if (state === 'locked') return { stop: json(500, { error: 'Alert already in progress.' }) };
    const claimed = await patchMetadata(order, { ds_alert_lock: new Date().toISOString() });
    if (claimed.ok && claimed.data.order) return { order: claimed.data.order };
    if (squareCode(claimed.data) === 'VERSION_MISMATCH') {
      order = await getOrder(orderId);
      continue;
    }
    console.error('Square alert lock failed', orderId, claimed.status, squareCode(claimed.data) || '');
    return { stop: json(500, { error: 'Could not reserve this order for an alert.' }) };
  }
  return { stop: json(500, { error: 'Could not reserve this order for an alert.' }) };
}

async function markSent(order) {
  let current = order;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await patchMetadata(current, {
      ds_alert_sent: new Date().toISOString(),
      ds_alert_lock: null,
    });
    if (res.ok) return true;
    if (squareCode(res.data) === 'VERSION_MISMATCH') {
      current = await getOrder(order.id);
      if (current.metadata && current.metadata.ds_alert_sent) return true;
      continue;
    }
    console.error('Square alert mark failed', order.id, res.status, squareCode(res.data) || '');
    return false;
  }
  return false;
}

async function clearLock(order) {
  try {
    await patchMetadata(order, { ds_alert_lock: null });
  } catch (err) {
    console.error('Square alert unlock failed', order && order.id, err && err.code);
  }
}

async function handle(event) {
  if (event && event.httpMethod && event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '';
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || '';
  if (!signatureKey || !notificationUrl) return json(503, { error: 'Webhook signature is not configured.' });

  const raw = rawBody(event);
  const signature = header(event, 'x-square-hmacsha256-signature');
  if (!verifySquareSignature({ signature, notificationUrl, rawBody: raw, signatureKey })) {
    return json(403, { error: 'Invalid signature.' });
  }

  let payload;
  try { payload = JSON.parse(raw || '{}'); }
  catch { return json(400, { error: 'Bad request' }); }

  const intent = classifyEvent(payload);
  if (!intent) return json(200, { ok: true });

  if (!process.env.SQUARE_ACCESS_TOKEN) return json(503, { error: 'Square is not configured.' });
  const mode = mailMode();
  if (mode !== 'smtp' && mode !== 'resend') return json(503, { error: 'Order alert email is not configured.' });

  const peeked = await getOrder(intent.orderId);
  if (!isWebsiteOrder(peeked)) return json(200, { ok: true });
  let payment = intent.payment;
  if (intent.requireCompletedPayment) {
    payment = await findCompletedPayment(peeked);
    if (!payment) return json(200, { ok: true });
  }

  const claimed = await claimOrder(intent.orderId);
  if (claimed.stop) return claimed.stop;
  const order = claimed.order;

  const message = buildAlert({ order, payment });
  try {
    await sendAlert(message);
  } catch (err) {
    console.error('Order alert email failed', order.id, err && (err.code || err.message));
    await clearLock(order);
    return json(500, { error: 'Could not send the order alert.' });
  }

  const marked = await markSent(order);
  if (!marked) return json(500, { error: 'Alert email was sent but the order was not marked.' });
  return json(200, { ok: true });
}

exports.handler = async (event) => {
  try {
    return await handle(event);
  } catch (err) {
    console.error('square webhook failed', err && (err.code || err.message));
    return json(500, { error: 'Could not process the Square event.' });
  }
};

exports.verifySquareSignature = verifySquareSignature;
exports.normalizePhone = normalizePhone;
exports.describeItem = describeItem;
exports.buildAlert = buildAlert;
exports.alertState = alertState;
exports.isWebsiteOrder = isWebsiteOrder;
exports.moneyCAD = moneyCAD;
exports.mailMode = mailMode;
exports.classifyEvent = classifyEvent;
exports.setSendOverride = setSendOverride;
exports.sendAlert = sendAlert;
