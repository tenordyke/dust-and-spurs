// Holiday sale and countdown copy for Christmas 2026.
// Dates use the America/Regina calendar.
//
// HOLD: leave holidaySaleBannerEnabled false until Square applies
// 10% off the shop automatically at checkout for November 27 to 30, 2026.
// eGift cards are excluded from that discount. The Western Soul Journal
// is sold on Amazon and is not part of the sale, so sale copy never names it.
// Set the flag to true to show the phase that matches today's Regina date.
// Add data-hold to #saleBanner to hide the bar by hand even after that.

const holidaySaleBannerEnabled = false;

const DELIVERY_NOTE = 'Delivery times are estimates and may vary depending on location, production requirements, and holiday shipping conditions. Christmas delivery cannot be guaranteed.';
const GIFT_CARDS = 'https://app.squareup.com/gift/ML5W8MYW4D9NW/order';

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

function holidaySalePhase(stamp) {
  if (stamp >= '2026-11-20' && stamp <= '2026-11-26') {
    return {
      copy: '10% off the shop, November 27 to 30. Order fine art by December 1 for Christmas.',
      href: '#/collections',
      external: false,
      note: DELIVERY_NOTE,
    };
  }
  if (stamp >= '2026-11-27' && stamp <= '2026-11-30') {
    return {
      copy: '10% off everything in the shop through Monday, November 30. Applied at checkout. Gift cards excluded.',
      href: '#/collections',
      external: false,
      note: '',
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

function holidaySaleBanner(now, options) {
  const opts = options || {};
  const enabled = opts.enabled === undefined ? holidaySaleBannerEnabled : opts.enabled;
  if (!enabled || opts.held || opts.route === 'thank-you') return null;
  return holidaySalePhase(reginaStamp(now));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    holidaySaleBanner: holidaySaleBanner,
    holidaySaleBannerEnabled: holidaySaleBannerEnabled,
  };
}
