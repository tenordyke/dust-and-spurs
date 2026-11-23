// Holiday sale and countdown copy for Christmas 2026.
// The Regina dates and the on/off switch live in lib/holiday-sale.js.
// This file shows whichever phase matches today's America/Regina date.
// Sale lines say the discount is applied at checkout.
// eGift cards are sold on Square's gift card page, not in the shop checkout.
// The Western Soul Journal is sold on Amazon and is not part of the sale,
// so sale copy never names it.
// Add data-hold to #saleBanner to hide the bar by hand.

const DELIVERY_NOTE = 'Delivery times are estimates and may vary depending on location, production requirements, and holiday shipping conditions. Christmas delivery cannot be guaranteed.';
const GIFT_CARDS = 'https://app.squareup.com/gift/ML5W8MYW4D9NW/order';

var sharedSale = (typeof holidaySaleActive === 'function' && typeof HOLIDAY_SALE === 'object' && HOLIDAY_SALE)
  ? {
      HOLIDAY_SALE: HOLIDAY_SALE,
      reginaStamp: reginaStamp,
      holidaySaleEnabled: holidaySaleEnabled,
    }
  : require('./holiday-sale');

function holidaySalePhase(stamp) {
  const sale = sharedSale.HOLIDAY_SALE;
  if (stamp >= '2026-11-20' && stamp < sale.start) {
    return {
      copy: '10% off the shop, November 27 to 30. Order fine art by December 1 for Christmas.',
      href: '#/collections',
      external: false,
      note: DELIVERY_NOTE,
      promisesSale: true,
    };
  }
  if (stamp >= sale.start && stamp <= sale.end) {
    return {
      copy: '10% off everything in the shop through Monday, November 30. Applied at checkout. Gift cards excluded.',
      href: '#/collections',
      external: false,
      note: '',
      promisesSale: true,
    };
  }
  if (stamp === '2026-12-01') {
    return {
      copy: 'Today is the last day to order fine art prints, framed prints and canvas for Christmas in Canada.',
      href: '#/collections',
      external: false,
      note: DELIVERY_NOTE,
    };
  }
  if (stamp >= '2026-12-02' && stamp <= '2026-12-12') {
    return {
      copy: 'Order Stories of the West by December 12 and posters by December 14 for Christmas in Canada.',
      href: '#/gifts',
      external: false,
      note: DELIVERY_NOTE,
    };
  }
  if (stamp >= '2026-12-13' && stamp <= '2026-12-14') {
    return {
      copy: 'Order posters by December 14 for Christmas in Canada.',
      href: '#/posters',
      external: false,
      note: DELIVERY_NOTE,
    };
  }
  if (stamp >= '2026-12-15' && stamp <= '2026-12-25') {
    return {
      copy: 'eGift cards arrive by email, the easy last-minute gift.',
      href: GIFT_CARDS,
      external: true,
      note: '',
    };
  }
  return null;
}

function presentPhase(phase) {
  return {
    copy: phase.copy,
    href: phase.href,
    external: phase.external,
    note: phase.note,
  };
}

function holidaySaleBanner(now, options) {
  const opts = options || {};
  if (opts.held || opts.route === 'thank-you') return null;
  const phase = holidaySalePhase(sharedSale.reginaStamp(now));
  if (!phase) return null;
  const enabled = opts.env
    ? sharedSale.holidaySaleEnabled(opts.env)
    : sharedSale.HOLIDAY_SALE.enabled !== false;
  if (phase.promisesSale && !enabled) return null;
  return presentPhase(phase);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    holidaySaleBanner: holidaySaleBanner,
  };
}
