// Mailing list signup. Emails Alix each new consent. No third-party list service.
// Uses the same SMTP env vars as the order alert: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
// ORDER_ALERT_EMAIL receives the note. It defaults to hello@dustandspurs.ca.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

let sendOverride = null;
function setSendOverride(fn) { sendOverride = fn; }
function resetSignupLimits() { hits.clear(); }

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function header(event, name) {
  const headers = (event && event.headers) || {};
  const want = name.toLowerCase();
  const key = Object.keys(headers).find((item) => item.toLowerCase() === want);
  return key ? String(headers[key]) : '';
}

function clientIp(event) {
  const direct = header(event, 'x-nf-client-connection-ip');
  if (direct) return direct.trim();
  const forwarded = header(event, 'x-forwarded-for');
  return (forwarded.split(',')[0] || 'unknown').trim() || 'unknown';
}

function rawBody(event) {
  const body = event && event.body ? String(event.body) : '';
  if (event && event.isBase64Encoded && body) return Buffer.from(body, 'base64').toString('utf8');
  return body;
}

function recent(key, now) {
  const list = (hits.get(key) || []).filter((at) => now - at < WINDOW_MS);
  hits.set(key, list);
  return list;
}

function tooMany(key, now, max) {
  return recent(key, now).length >= max;
}

function mark(key, now) {
  const list = recent(key, now);
  list.push(now);
  hits.set(key, list);
}

function cleanName(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
}

function validEmail(value) {
  const email = String(value || '').trim();
  if (email.length < 5 || email.length > 200) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function buildSignupMessage({ name, email, consentedAt }) {
  return {
    subject: 'New Dust & Spurs list signup',
    replyTo: email,
    text: [
      'New mailing list signup',
      '',
      'Sender identity on the form: Dust & Spurs, hello@dustandspurs.ca',
      'Name: ' + (name || '(not given)'),
      'Email: ' + email,
      'Consent: yes',
      'Consent time: ' + consentedAt,
      '',
      'They asked for occasional notes about new photographs, the journal, and upcoming markets.',
      'Every email to this person must include a way to unsubscribe.',
    ].join('\n'),
  };
}

async function sendSignup(message) {
  if (sendOverride) return sendOverride(message);
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const error = new Error('Signup email is not configured.');
    error.code = 'NO_MAIL';
    throw error;
  }
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ORDER_ALERT_EMAIL || 'hello@dustandspurs.ca',
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
  });
}

async function handle(event, now) {
  if (!event || event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });
  const raw = rawBody(event);
  if (raw.length > 4000) return json(400, { error: 'That signup could not be read.' });
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return json(400, { error: 'That signup could not be read.' }); }

  const at = Number.isFinite(now) ? now : Date.now();
  const ip = clientIp(event);
  const ipKey = 'ip:' + ip;
  if (tooMany(ipKey, at, MAX_PER_WINDOW)) return json(429, { error: 'Please wait a little while and try again.' });

  const company = String(body.company || body.website || '').trim();
  if (company) {
    mark(ipKey, at);
    return json(200, { ok: true });
  }

  const email = validEmail(body.email);
  const consent = body.consent === true || body.consent === 'yes' || body.consent === 'on';
  if (!consent || !email) {
    mark(ipKey, at);
    if (!consent) return json(400, { error: 'Please check the box to say yes to email.' });
    return json(400, { error: 'Please add a valid email.' });
  }
  const emailKey = 'email:' + email.toLowerCase();
  if (tooMany(emailKey, at, 2)) return json(429, { error: 'Please wait a little while and try again.' });

  const name = cleanName(body.name);
  const message = buildSignupMessage({
    name,
    email,
    consentedAt: new Date(at).toISOString(),
  });
  try {
    await sendSignup(message);
  } catch (err) {
    mark(ipKey, at);
    console.error('Signup email failed', err && (err.code || err.message));
    return json(503, { error: 'Signup is unavailable right now.' });
  }
  mark(ipKey, at);
  mark(emailKey, at);
  return json(200, { ok: true });
}

exports.handler = async (event) => {
  try {
    return await handle(event);
  } catch (err) {
    console.error('signup failed', err && (err.code || err.message));
    return json(500, { error: 'Signup is unavailable right now.' });
  }
};

exports.handle = handle;
exports.buildSignupMessage = buildSignupMessage;
exports.validEmail = validEmail;
exports.setSendOverride = setSendOverride;
exports.resetSignupLimits = resetSignupLimits;
