// Shared phone cleanup for checkout and the order alert.
// Square wants E.164, for example +13065550199. Max 17 characters on a payment link.

function normalizePhone(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (text.startsWith('+')) {
    if (digits.length >= 10 && digits.length <= 15) return '+' + digits;
    return null;
  }
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

module.exports = { normalizePhone };
