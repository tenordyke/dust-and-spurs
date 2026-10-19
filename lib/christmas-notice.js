// Christmas 2026 ordering notice stays up through December 25, 2026 in Saskatchewan.

function christmasNoticeVisible(now) {
  const when = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(when.getTime())) return false;
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
  const stamp = value('year') + '-' + value('month') + '-' + value('day');
  return stamp <= '2026-12-25';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { christmasNoticeVisible: christmasNoticeVisible };
}
