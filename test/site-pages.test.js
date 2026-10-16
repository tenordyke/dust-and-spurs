const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');

assert.strictEqual(html.includes('data:image'), false);
assert.ok(html.includes('img/prints/where-they-gather.jpg'));
assert.ok(html.includes('srcset="${base}-400.webp'));
assert.ok(html.includes('width="${p.w}"'));
assert.ok(html.includes('height="${p.h}"'));
assert.ok(html.includes('Fine art photograph by Alix Apperley.'));
assert.ok(html.includes('loading="${load}"'));
assert.ok(toml.includes('/img/*'));
assert.ok(toml.includes('max-age=31536000'));

assert.ok(html.includes('data-page="gifts"'));
assert.ok(html.includes('id="giftGrid"'));
assert.ok(html.includes('A guide for October 30.'));
assert.strictEqual(html.includes('#/posters/${p.id}${suffix}'), false);
assert.strictEqual(html.includes('class="gift-list"'), false);
assert.ok(html.includes('href="#/posters/against-the-light"'));
assert.ok(html.includes('href="#/posters/kindred/hanging"'));
assert.ok(html.includes('href="#/posters/prairie-watcher"'));
assert.ok(html.includes("card.classList.add('lit')"));
assert.ok(html.includes('.poster-card.lit'));

const nav = html.slice(html.indexOf('id="navlinks"'), html.indexOf('id="navToggle"'));
const navLabels = [...nav.matchAll(/>([^<]+)<\/a>/g)].map((match) => match[1]);
assert.deepStrictEqual(navLabels, ['Home', 'About', 'Collections', 'Posters', 'Book', 'Journal', 'Gifts', 'Gift Cards', 'Print Information', 'Contact']);

const welcome = html.slice(html.indexOf('class="section welcome'), html.indexOf('id="homeGifts"'));
assert.strictEqual(welcome.includes('Gifts under $125'), false);
assert.ok(html.includes("a fine art print isn't within reach for everyone"));
assert.ok(html.includes('href="#/collections">explore the Collections</a>'));

const gifts = html.slice(html.indexOf('id="gifts"'), html.indexOf('id="contact"'));
assert.ok(gifts.includes('assets/posters/against-the-light.jpg'));
assert.ok(gifts.includes('assets/posters/kindred.jpg'));
assert.ok(gifts.includes('assets/book/front-cover.jpg'));
assert.ok(gifts.includes('assets/journal/alix-holding.jpg'));
assert.ok(gifts.includes('assets/gifts/egift-card.png'));
assert.strictEqual(gifts.includes('assets/og/dust-and-spurs.jpg'), false);
assert.ok(gifts.includes('Hangers are not pictured.'));
assert.ok(gifts.includes('>Standard poster</h3>'));
assert.ok(gifts.includes('>Hanging poster</h3>'));
assert.ok(gifts.includes('>$49</p>'));
assert.ok(gifts.includes('>$65</p>'));
assert.ok(gifts.includes('>$79</p>'));
const amazonPrice = 'Paperback, $15.22 on Amazon.ca (price set by Amazon, may change)';
assert.ok(gifts.includes(amazonPrice));
const journal = html.slice(html.indexOf('id="journal"'), html.indexOf('id="gifts"'));
assert.ok(journal.includes(amazonPrice));
assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'checkout.js'), 'utf8').includes('15.22'), false);
assert.strictEqual(gifts.includes('Along the Fence Line'), false);
assert.ok(html.includes("parseHashRoute(location.hash, PAGES)"));
assert.ok(html.includes('buildAppUrl(location.search, location.hash, r, parts)'));
assert.ok(html.includes('historyAction(here, next, historyMode)'));
assert.ok(html.includes("navigate(routeFromHash(), 'replace')"));
assert.ok(html.includes("navigate(routeFromHash(), 'none')"));
assert.ok(html.includes("'gifts'"));

assert.ok(html.includes('id="cutoffBanner" hidden'));
assert.ok(html.includes('TODO-confirm: Holiday shipping cutoff.'));

const forms = html.split('<form class="signup"').length - 1;
assert.strictEqual(forms, 2);
assert.strictEqual(html.includes('name="consent" checked'), false);
assert.ok(html.includes('name="company"'));
assert.ok(html.includes('Every email includes a way to unsubscribe.'));
assert.ok(html.includes('hello@dustandspurs.ca'));
assert.ok(html.includes('/.netlify/functions/signup'));

assert.strictEqual(html.includes('\u2014'), false);
assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'signup.js'), 'utf8').includes('\u2014'), false);

const analyticsJs = fs.readFileSync(path.join(__dirname, '..', 'lib', 'analytics.js'), 'utf8');
assert.strictEqual(analyticsJs.includes('\u2014'), false);
assert.strictEqual((html.match(/const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';/g) || []).length, 1);
assert.strictEqual(html.includes('src="https://www.googletagmanager.com'), false);
assert.ok(html.includes('installAnalytics(GA_MEASUREMENT_ID)'));
assert.ok(html.includes("ga('page_view'"));
assert.ok(html.includes("ga('view_item'"));
assert.ok(html.includes("ga('add_to_cart'"));
assert.ok(html.includes("ga('begin_checkout'"));
assert.ok(html.includes("sendPurchase(GA_MEASUREMENT_ID, window, r, location.search, location.hash, sessionStorage)"));
assert.ok(html.includes('Your IP address is anonymized.'));
assert.ok(html.includes('These cookies are not used for ads.'));
assert.ok(analyticsJs.includes('anonymize_ip: true'));
assert.ok(analyticsJs.includes('allow_google_signals: false'));
assert.ok(analyticsJs.includes('allow_ad_personalization_signals: false'));

const prints = fs.readdirSync(path.join(__dirname, '..', 'img', 'prints'));
assert.ok(prints.includes('where-they-gather.jpg'));
assert.ok(prints.includes('where-they-gather.webp'));
assert.ok(prints.includes('where-they-gather-400.jpg'));
assert.ok(prints.includes('where-they-gather-400.webp'));
assert.ok(prints.length >= 96 * 4);

console.log('site page tests passed');
