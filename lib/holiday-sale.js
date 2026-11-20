// Black Friday 2026. One schedule for the banner and for checkout.
// Dates are America/Regina calendar days. Regina does not use daylight saving,
// so midnight is 06:00 UTC.
//
// The shop prices already include tax. Ten percent comes off that inclusive
// total, once for the whole order, in cents. Half a cent rounds up (half away
// from zero). Current prices are whole dollars, so 10% lands on a cent with
// nothing left over. Square is given that many cents as a named fixed discount.
// The customer pays list minus that discount. Included PST/GST is Square's
// share of the discounted total, not an extra charge.
//
// Switch the sale off by setting enabled to false, or by setting the Netlify
// variable HOLIDAY_SALE_ENABLED to false and redeploying. The variable only
// affects checkout. The banner and cart follow `enabled` in this file.

var HOLIDAY_SALE = {
  name: 'Black Friday 10% off',
  percent: 10,
  start: '2026-11-27',
  end: '2026-11-30',
  enabled: true,
};

function reginaStamp(now) {
  const when = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(when.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Regina',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(when);
  const value = function (type) {
    const part = parts.find(function (item) { return item.type === type; });
    return part ? part.value : '';
  };
  const year = value('year');
  const month = value('month');
  const day = value('day');
  if (!year || !month || !day) return '';
  return year + '-' + month + '-' + day;
}

function readEnv(env) {
  if (env) return env;
  if (typeof process !== 'undefined' && process.env) return process.env;
  return {};
}

function holidaySaleEnabled(env) {
  const raw = readEnv(env).HOLIDAY_SALE_ENABLED;
  if (raw == null || String(raw).trim() === '') return HOLIDAY_SALE.enabled !== false;
  const value = String(raw).trim().toLowerCase();
  if (value === 'false' || value === '0' || value === 'off' || value === 'no') return false;
  if (value === 'true' || value === '1' || value === 'on' || value === 'yes') return true;
  return HOLIDAY_SALE.enabled !== false;
}

function holidaySaleActive(now, env) {
  if (!holidaySaleEnabled(env)) return false;
  const stamp = reginaStamp(now);
  return stamp >= HOLIDAY_SALE.start && stamp <= HOLIDAY_SALE.end;
}

// Half up. rem === 50 is exactly half a cent and rounds away from zero.
function percentOffCents(listCents, percent) {
  const numerator = listCents * percent;
  const base = Math.floor(numerator / 100);
  const rem = numerator % 100;
  if (rem >= 50) return base + 1;
  return base;
}

function holidaySaleQuote(listCents, now, env) {
  const cents = Math.round(Number(listCents));
  if (!Number.isFinite(cents) || cents <= 0) return null;
  if (!holidaySaleActive(now, env)) return null;
  const discountCents = percentOffCents(cents, HOLIDAY_SALE.percent);
  if (discountCents <= 0 || discountCents >= cents) return null;
  return {
    name: HOLIDAY_SALE.name,
    percent: HOLIDAY_SALE.percent,
    listCents: cents,
    discountCents: discountCents,
    chargeCents: cents - discountCents,
  };
}

// Banker's rounding (half to even), matching Square's order adjustments for CAD.
// numerator and denominator are integers. This is the included-tax split only.
// It does not change the amount the customer pays.
function bankersRoundDiv(numerator, denominator) {
  const neg = numerator < 0;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  if (!d) return 0;
  const q = Math.floor(n / d);
  const rem = n % d;
  const twice = rem * 2;
  let rounded = q;
  if (twice > d || (twice === d && q % 2 === 1)) rounded = q + 1;
  return neg ? -rounded : rounded;
}

function includedTaxCents(chargeCents, rates) {
  const charge = Math.round(Number(chargeCents));
  const list = (Array.isArray(rates) ? rates : [rates]).map(Number).filter(function (rate) {
    return Number.isFinite(rate) && rate > 0;
  });
  const combined = list.reduce(function (sum, rate) { return sum + rate; }, 0);
  if (!Number.isFinite(charge) || charge <= 0 || combined <= 0) return 0;
  return list.reduce(function (sum, rate) {
    return sum + bankersRoundDiv(charge * rate, 100 + combined);
  }, 0);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HOLIDAY_SALE: HOLIDAY_SALE,
    reginaStamp: reginaStamp,
    holidaySaleEnabled: holidaySaleEnabled,
    holidaySaleActive: holidaySaleActive,
    holidaySaleQuote: holidaySaleQuote,
    percentOffCents: percentOffCents,
    bankersRoundDiv: bankersRoundDiv,
    includedTaxCents: includedTaxCents,
  };
}
