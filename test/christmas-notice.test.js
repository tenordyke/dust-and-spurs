const assert = require('assert');
const { christmasNoticeVisible } = require('../lib/christmas-notice');

assert.strictEqual(christmasNoticeVisible(new Date('2026-12-01T18:00:00.000Z')), true);
assert.strictEqual(christmasNoticeVisible(new Date('2026-12-26T05:59:00.000Z')), true);
assert.strictEqual(christmasNoticeVisible(new Date('2026-12-26T06:00:00.000Z')), false);
assert.strictEqual(christmasNoticeVisible(new Date('2026-12-31T18:00:00.000Z')), false);
assert.strictEqual(christmasNoticeVisible(new Date('2027-01-01T00:00:00.000Z')), false);

console.log('christmas notice tests passed');
