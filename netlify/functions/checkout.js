// Dust & Spurs — Square checkout (Netlify serverless function)
// Creates a Square-hosted checkout page for the customer's order.
// Secrets live ONLY in Netlify environment variables (never in the website file):
//   SQUARE_ACCESS_TOKEN  – from developer.squareup.com (Production access token)
//   SQUARE_LOCATION_ID   – from developer.squareup.com → Locations
//   SQUARE_ENV           – "production" (default) or "sandbox" for testing
//   SITE_URL             – e.g. https://dust-and-spurs.netlify.app (where Square sends customers back)
//   STORE_EMAIL          – optional, defaults to hello@dustandspurs.ca
//   TAX_PST_PCT          – optional, included Saskatchewan PST %, defaults to 6
//   GST_ENABLED / GST_PCT – optional; set GST_ENABLED=true (and GST_PCT, default 5) once registered

const crypto = require('crypto');

// ---- Trusted price list (must match the website). Prices are all-in CAD. ----
const PRICE = {
  print:  {'8x12':125,'12x18':225,'16x24':325,'24x36':475,'32x48':750},
  framed: {'12x18':525,'16x24':675,'24x36':1095,'32x48':1595},
  canvas: {'16x24':350,'24x36':525,'32x48':795},
};
const TIERS = {
  entry:     {print:['8x12','12x18']},
  core:      {print:['8x12','12x18','16x24','24x36'], framed:['8x12','12x18','16x24','24x36']},
  collector: {print:['16x24','24x36','32x48'], framed:['16x24','24x36','32x48'], canvas:['16x24','24x36','32x48']},
};
const PRODUCTS = {print:'Fine Art Print', framed:'Framed Print', canvas:'Gallery Wrapped Canvas'};
const FRAMES = {black:'Black', walnut:'Walnut'};

// ---- Shipping rules (keep in sync with the website) ----
const QUOTE_PROVINCES = ['Quebec','Yukon','Northwest Territories'];
const QUOTE_COUNTRIES = ['United States'];
const PROV = {'Alberta':'AB','British Columbia':'BC','Manitoba':'MB','New Brunswick':'NB','Newfoundland and Labrador':'NL',
  'Northwest Territories':'NT','Nova Scotia':'NS','Nunavut':'NU','Ontario':'ON','Prince Edward Island':'PE','Quebec':'QC',
  'Saskatchewan':'SK','Yukon':'YT'};

const json = (statusCode, obj) => ({ statusCode, headers: {'Content-Type':'application/json'}, body: JSON.stringify(obj) });
const clean = (s, n=120) => String(s||'').replace(/[\r\n\t]/g,' ').trim().slice(0, n);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, {error:'Method not allowed'});

  const token = process.env.SQUARE_ACCESS_TOKEN, location = process.env.SQUARE_LOCATION_ID;
  if (!token || !location) return json(503, {error:'Online payment is not connected yet. Please email hello@dustandspurs.ca to complete your order.'});
  const sandbox = (process.env.SQUARE_ENV||'production').toLowerCase() === 'sandbox';
  const base = sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, {error:'Bad request'}); }
  const items = Array.isArray(body.items) ? body.items : [];
  const ship = body.ship || {};

  // --- customer / shipping validation ---
  const need = ['name','email','addr','city','country','region','postal'].filter(k => !clean(ship[k]));
  if (need.length) return json(400, {error:'Missing shipping details: '+need.join(', ')});
  if (!/.+@.+\..+/.test(ship.email)) return json(400, {error:'Please enter a valid email address.'});
  if (QUOTE_COUNTRIES.includes(ship.country) || (ship.country==='Canada' && QUOTE_PROVINCES.includes(ship.region)))
    return json(400, {error:'This destination requires a shipping quote before payment.'});
  if (ship.country !== 'Canada') return json(400, {error:'Unsupported destination.'});

  // --- rebuild line items from the trusted price list (never trust prices sent by the browser) ---
  if (!items.length) return json(400, {error:'Your selection is empty.'});
  const line_items = []; let total = 0;
  for (const it of items) {
    const format = it.format, size = it.size, tier = it.tier;
    const price = PRICE[format] && PRICE[format][size];
    const allowed = TIERS[tier] && TIERS[tier][format] && TIERS[tier][format].includes(size);
    if (price == null || !allowed) return json(400, {error:`"${clean(it.title)}" is not available in that size or format.`});
    const qty = Math.max(1, Math.min(10, parseInt(it.qty, 10) || 1));
    total += price * qty;
    let variation = `${PRODUCTS[format]} · ${size.replace('x',' × ')}"`;
    let note = 'Collection: ' + clean(it.collection);
    if (format === 'framed') {
      const frameName = FRAMES[it.frame];
      if (!frameName) return json(400, {error:`Please choose a Black or Walnut frame for "${clean(it.title)}".`});
      variation += ` · ${frameName} frame`;
      note += ' · Frame: ' + frameName;
    }
    line_items.push({
      name: clean(it.title),
      variation_name: variation,
      note,
      quantity: String(qty),
      item_type: 'ITEM',
      base_price_money: { amount: price * 100, currency: 'CAD' },
    });
  }

  // Prices on the site already include tax. Square order taxes use `type`
  // (ADDITIVE or INCLUSIVE). `inclusion_type` is only a catalog-tax field;
  // Square ignores it on an order and then adds the percentage on top.
  const taxes = [{ uid:'pst', name:'Saskatchewan PST (included in price)', percentage: String(process.env.TAX_PST_PCT || '6'), scope:'ORDER', type:'INCLUSIVE' }];
  if ((process.env.GST_ENABLED||'').toLowerCase() === 'true')
    taxes.push({ uid:'gst', name:'GST (included in price)', percentage: String(process.env.GST_PCT || '5'), scope:'ORDER', type:'INCLUSIVE' });

  const siteUrl = (process.env.SITE_URL || `https://${event.headers.host}`).replace(/\/$/, '');
  const nameParts = clean(ship.name).split(/\s+/);
  const reference = 'DS-' + Date.now().toString(36).toUpperCase();

  const payload = {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: location,
      reference_id: reference,
      line_items,
      taxes,
      metadata: {
        ship_to_name: clean(ship.name, 255),
        ship_to: clean(`${ship.addr}, ${ship.city}, ${ship.region}, ${ship.country} ${ship.postal}`, 255),
        customer_email: clean(ship.email, 255),
        source: 'dustandspurs.ca website',
      },
    },
    checkout_options: {
      redirect_url: `${siteUrl}/#/thank-you`,
      ask_for_shipping_address: true,
      allow_tipping: false,
      merchant_support_email: process.env.STORE_EMAIL || 'hello@dustandspurs.ca',
      accepted_payment_methods: { apple_pay: true, google_pay: true, cash_app_pay: false, afterpay_clearpay: false },
    },
    pre_populated_data: {
      buyer_email: clean(ship.email),
      buyer_address: {
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        address_line_1: clean(ship.addr),
        locality: clean(ship.city),
        administrative_district_level_1: PROV[ship.region] || clean(ship.region),
        postal_code: clean(ship.postal, 20),
        country: 'CA',
      },
    },
    payment_note: `Dust & Spurs order ${reference} — ${clean(ship.name)}`,
  };

  const r = await fetch(base + '/v2/online-checkout/payment-links', {
    method: 'POST',
    headers: { 'Square-Version': process.env.SQUARE_VERSION || '2024-11-20', 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = {}; try { data = await r.json(); } catch {}
  if (!r.ok || !data.payment_link || !data.payment_link.url) {
    const detail = data.errors && data.errors[0] && data.errors[0].detail;
    console.error('Square error', r.status, JSON.stringify(data));
    return json(502, {error: 'Square could not open the checkout' + (detail ? ': ' + detail : '.') });
  }
  const squareOrder = data.related_resources && data.related_resources.orders && data.related_resources.orders[0];
  const charged = squareOrder && squareOrder.total_money && Number(squareOrder.total_money.amount);
  if (Number.isFinite(charged) && charged !== total * 100) {
    console.error('Square total did not match the site price', JSON.stringify({ charged, expected: total * 100, total_tax_money: squareOrder.total_tax_money, taxes: squareOrder.taxes }));
    return json(502, {error: 'Checkout total did not match the price on the site. Please email hello@dustandspurs.ca to complete your order.'});
  }
  return json(200, { url: data.payment_link.url, orderId: data.payment_link.order_id, reference, total });
};
