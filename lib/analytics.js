// Google Analytics 4. The placeholder measurement ID loads nothing and sends nothing.
// Ads features stay off. IP anonymization is requested on every config call.

const GA_PLACEHOLDER = 'G-XXXXXXXXXX';
const CHECKOUT_KEY = 'ds-square-checkout';
const PURCHASED_KEY = 'ds-ga-purchase';

function analyticsReady(id) {
  const value = String(id || '').trim();
  if (!value || value === GA_PLACEHOLDER) return false;
  return /^G-[A-Z0-9]{6,20}$/.test(value);
}

function pagePath(page, parts) {
  const extra = parts && parts.length
    ? '/' + parts.map(function (part) { return encodeURIComponent(part); }).join('/')
    : '';
  return '/' + (page || 'home') + extra;
}

function cleanSquareId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return '';
  return id;
}

function paramValue(params, name) {
  if (!params) return '';
  const value = typeof params.get === 'function' ? params.get(name) : '';
  return cleanSquareId(value);
}

function squareReturn(search, hash) {
  const query = String(search || '').replace(/^\?/, '');
  const hashRaw = String(hash || '').replace(/^#\/?/, '');
  const hashQuery = hashRaw.indexOf('?') >= 0 ? hashRaw.slice(hashRaw.indexOf('?') + 1) : '';
  const fromSearch = new URLSearchParams(query);
  const fromHash = new URLSearchParams(hashQuery);
  const orderId = paramValue(fromSearch, 'orderId') || paramValue(fromHash, 'orderId');
  const transactionId = paramValue(fromSearch, 'transactionId') || paramValue(fromHash, 'transactionId');
  if (!orderId || !transactionId) return null;
  return { orderId: orderId, transactionId: transactionId };
}

function gaItem(line) {
  const source = line || {};
  const bits = [];
  if (source.prod) bits.push(String(source.prod));
  if (source.size) bits.push(String(source.size));
  if (source.displayLabel) bits.push(String(source.displayLabel));
  if (source.frameLabel) bits.push(String(source.frameLabel));
  const price = Number(source.price);
  return {
    item_id: String(source.id || ''),
    item_name: String(source.title || ''),
    item_category: String(source.collection || ''),
    item_variant: bits.join(', '),
    price: Number.isFinite(price) ? price : 0,
    quantity: Math.max(1, parseInt(source.qty, 10) || 1),
  };
}

function ecommerceEvent(lines) {
  const items = (Array.isArray(lines) ? lines : []).map(gaItem);
  const value = items.reduce(function (sum, item) {
    return sum + item.price * item.quantity;
  }, 0);
  return { currency: 'CAD', value: value, items: items };
}

function pendingCheckout(result, lines) {
  const orderId = cleanSquareId(result && result.orderId);
  const value = Number(result && result.total);
  if (!orderId || !Number.isFinite(value)) return null;
  return {
    orderId: orderId,
    reference: String((result && result.reference) || ''),
    value: value,
    currency: 'CAD',
    items: ecommerceEvent(lines).items,
  };
}

function savePendingCheckout(storage, snapshot) {
  if (!storage || !snapshot || !snapshot.orderId) return false;
  storage.setItem(CHECKOUT_KEY, JSON.stringify(snapshot));
  return true;
}

function readPendingCheckout(storage) {
  if (!storage) return null;
  try {
    const data = JSON.parse(storage.getItem(CHECKOUT_KEY) || '');
    if (!data || !cleanSquareId(data.orderId) || !Number.isFinite(Number(data.value))) return null;
    return data;
  } catch (err) {
    return null;
  }
}

function readPurchased(storage) {
  if (!storage) return [];
  try {
    const data = JSON.parse(storage.getItem(PURCHASED_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

function rememberPurchase(storage, transactionId) {
  const id = cleanSquareId(transactionId);
  if (!storage || !id) return false;
  const list = readPurchased(storage);
  if (list.indexOf(id) === -1) list.push(id);
  storage.setItem(PURCHASED_KEY, JSON.stringify(list.slice(-20)));
  return true;
}

function confirmedPurchase(page, search, hash, storage) {
  if (page !== 'thank-you') return null;
  const returned = squareReturn(search, hash);
  if (!returned) return null;
  const pending = readPendingCheckout(storage);
  if (!pending || pending.orderId !== returned.orderId) return null;
  if (readPurchased(storage).indexOf(returned.transactionId) !== -1) return null;
  return {
    transaction_id: returned.transactionId,
    currency: 'CAD',
    value: Number(pending.value),
    items: Array.isArray(pending.items) ? pending.items : [],
  };
}

function installAnalytics(id, doc) {
  if (!analyticsReady(id) || !doc || typeof doc.createElement !== 'function') return false;
  const win = doc.defaultView;
  if (!win) return false;
  win.dataLayer = win.dataLayer || [];
  win.gtag = function () {
    win.dataLayer.push([].slice.call(arguments));
  };
  win.gtag('js', new Date());
  win.gtag('config', id, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: false,
  });
  const script = doc.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  doc.head.appendChild(script);
  return true;
}

function trackEvent(id, win, eventName, params) {
  if (!analyticsReady(id)) return false;
  if (!win || typeof win.gtag !== 'function') return false;
  win.gtag('event', eventName, params || {});
  return true;
}

function sendPurchase(id, win, page, search, hash, storage) {
  const event = confirmedPurchase(page, search, hash, storage);
  if (!event) return null;
  if (!trackEvent(id, win, 'purchase', event)) return null;
  rememberPurchase(storage, event.transaction_id);
  return event;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GA_PLACEHOLDER: GA_PLACEHOLDER,
    analyticsReady: analyticsReady,
    pagePath: pagePath,
    squareReturn: squareReturn,
    gaItem: gaItem,
    ecommerceEvent: ecommerceEvent,
    pendingCheckout: pendingCheckout,
    savePendingCheckout: savePendingCheckout,
    confirmedPurchase: confirmedPurchase,
    installAnalytics: installAnalytics,
    trackEvent: trackEvent,
    sendPurchase: sendPurchase,
  };
}
