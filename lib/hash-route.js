// Hash routes stay intact when a URL also has a query string, including UTM tags.

function parseHashRoute(hash, pages) {
  const list = Array.isArray(pages) ? pages : [];
  const raw = String(hash || '').replace(/^#\/?/, '');
  const path = raw.split('?')[0];
  const bits = path.split('/').filter(Boolean);
  const known = bits.length && list.indexOf(bits[0]) !== -1;
  return {
    page: known ? bits[0] : 'home',
    parts: known ? bits.slice(1) : [],
  };
}

function hashQuery(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const i = raw.indexOf('?');
  return i >= 0 ? raw.slice(i) : '';
}

function buildAppUrl(search, hash, page, parts) {
  const q = search ? (String(search).charAt(0) === '?' ? String(search) : '?' + String(search)) : '';
  const extra = parts && parts.length ? '/' + parts.map(function (part) {
    return encodeURIComponent(part);
  }).join('/') : '';
  return q + '#/' + page + extra + hashQuery(hash);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseHashRoute: parseHashRoute, hashQuery: hashQuery, buildAppUrl: buildAppUrl };
}
