const assert = require('assert');
const signup = require('../netlify/functions/signup');

function event(body, ip) {
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || '203.0.113.10' },
    body: JSON.stringify(body),
  };
}

async function test(name, fn) {
  signup.resetSignupLimits();
  signup.setSendOverride(null);
  await fn();
  signup.setSendOverride(null);
  signup.resetSignupLimits();
  console.log('ok ', name);
}

async function main() {
  await test('consent is required and the checkbox default is not assumed', async () => {
    const res = await signup.handle(event({ email: 'ada@example.com', consent: false, name: 'Ada' }));
    assert.strictEqual(res.statusCode, 400);
    assert.match(JSON.parse(res.body).error, /box/);
  });

  await test('a bad email is rejected', async () => {
    const res = await signup.handle(event({ email: 'not-an-email', consent: true }));
    assert.strictEqual(res.statusCode, 400);
  });

  await test('a signup emails Alix the name, address, and consent time', async () => {
    let sent = null;
    signup.setSendOverride(async (message) => { sent = message; });
    const res = await signup.handle(event({ email: 'Ada@Example.com', consent: true, name: 'Ada\nLovelace' }, '203.0.113.11'), Date.parse('2026-10-16T15:04:00.000Z'));
    assert.strictEqual(res.statusCode, 200);
    assert.ok(sent);
    assert.strictEqual(sent.subject, 'New Dust & Spurs list signup');
    assert.strictEqual(sent.replyTo, 'Ada@Example.com');
    assert.ok(sent.text.includes('Ada Lovelace'));
    assert.ok(sent.text.includes('Ada@Example.com'));
    assert.ok(sent.text.includes('2026-10-16T15:04:00.000Z'));
    assert.ok(sent.text.includes('Dust & Spurs, hello@dustandspurs.ca'));
    assert.ok(sent.text.includes('unsubscribe'));
    assert.strictEqual(sent.text.includes('\u2014'), false);
  });

  await test('name is optional', async () => {
    let sent = null;
    signup.setSendOverride(async (message) => { sent = message; });
    const res = await signup.handle(event({ email: 'quiet@example.com', consent: true }));
    assert.strictEqual(res.statusCode, 200);
    assert.ok(sent.text.includes('(not given)'));
  });

  await test('a honeypot submission does not send mail', async () => {
    let sent = 0;
    signup.setSendOverride(async () => { sent += 1; });
    const res = await signup.handle(event({ email: 'bot@example.com', consent: true, company: 'Spam Co' }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(sent, 0);
  });

  await test('the same address is rate limited', async () => {
    signup.setSendOverride(async () => {});
    const first = await signup.handle(event({ email: 'repeat@example.com', consent: true }, '203.0.113.20'));
    const second = await signup.handle(event({ email: 'repeat@example.com', consent: true }, '203.0.113.21'));
    const third = await signup.handle(event({ email: 'repeat@example.com', consent: true }, '203.0.113.22'));
    assert.strictEqual(first.statusCode, 200);
    assert.strictEqual(second.statusCode, 200);
    assert.strictEqual(third.statusCode, 429);
  });

  await test('one address cannot flood from one IP', async () => {
    signup.setSendOverride(async () => {});
    const codes = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await signup.handle(event({ email: 'ip' + i + '@example.com', consent: true }, '203.0.113.30'));
      codes.push(res.statusCode);
    }
    assert.deepStrictEqual(codes, [200, 200, 200, 200, 200, 429]);
  });

  await test('missing SMTP tells the visitor signup is unavailable', async () => {
    const prev = {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
    };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    try {
      const res = await signup.handle(event({ email: 'ada@example.com', consent: true }, '203.0.113.40'));
      assert.strictEqual(res.statusCode, 503);
    } finally {
      for (const key of Object.keys(prev)) {
        if (prev[key] == null) delete process.env[key];
        else process.env[key] = prev[key];
      }
    }
  });

  console.log('signup tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
