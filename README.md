# Dust & Spurs — Connecting Square (setup guide)

This folder is the complete website plus one small serverless function
(`netlify/functions/checkout.js`) that hands each order to Square's secure
checkout. Square takes the payment (cards, Apple Pay, Google Pay), keeps the
order record, emails the customer a receipt, and handles refunds.

Nothing secret is stored in the website. Square credentials live only in
Netlify's environment variables (step 2).

---------------------------------------------------------------------
STEP 1 — Get two values from Square (Alix, about 5 minutes)
---------------------------------------------------------------------
1. Go to https://developer.squareup.com/apps and sign in with the Square account.
2. Click "+" (Create your first application), name it "Dust & Spurs Website", Save.
3. Open the app -> "Credentials". Use the Sandbox / Production switch at the top.
   - For TESTING first:  switch to Sandbox and copy the Sandbox Access Token.
   - For GOING LIVE:     switch to Production and copy the Production Access Token.
4. Click "Locations" (left menu) and copy the Location ID
   (there is a Sandbox location and a Production location — match the token).

Treat the Access Token like a password. Do not email it or paste it in chats.

---------------------------------------------------------------------
STEP 2 — Add the values to Netlify
---------------------------------------------------------------------
1. Log in to Netlify -> open the Dust & Spurs site
   -> Site configuration -> Environment variables -> Add a variable:

   SQUARE_ACCESS_TOKEN   = (the access token)
   SQUARE_LOCATION_ID    = (the location ID)
   SQUARE_ENV            = sandbox        (change to  production  when going live)
   SITE_URL              = https://YOUR-SITE-NAME.netlify.app   (the live site address — used to send customers back after paying)

   Optional:
   STORE_EMAIL           = hello@dustandspurs.ca
   TAX_PST_PCT           = 6              (included Saskatchewan PST, recorded on each Square order)
   GST_ENABLED           = false          (set to true, with GST_PCT = 5, once registered for GST)

2. IMPORTANT: add the variables BEFORE deploying — a deploy picks them up.
   If you change them later, redeploy (Deploys -> Trigger deploy -> Deploy site).

---------------------------------------------------------------------
STEP 3 — Deploy this folder
---------------------------------------------------------------------
Make sure you are LOGGED IN to Netlify (serverless functions only deploy when
you are logged in). Then either:
   - drag the ZIP file (or this whole unzipped folder) onto the drop zone at the
     bottom of your site's Deploys page, or
   - for a brand-new site, drop it at https://app.netlify.com/drop while logged in.

After the deploy finishes, open the site's "Functions" tab — you should see
"checkout" listed. If it isn't there, redeploy while logged in.

---------------------------------------------------------------------
STEP 4 — Test it (sandbox)
---------------------------------------------------------------------
With SQUARE_ENV = sandbox and the SANDBOX token/location:
1. On the live site add a piece to the cart, enter a Saskatchewan address,
   click "Pay with Square". You should land on Square's checkout page.
2. Pay with Square's sandbox test card:
      Card number 4111 1111 1111 1111 · any future expiry · CVV 111 · any postal code
   (nothing real is charged in sandbox).
3. You should be sent back to the site's "Thank you" page, and the order should
   appear in the Square Developer sandbox dashboard.

---------------------------------------------------------------------
STEP 5 — Go live
---------------------------------------------------------------------
1. In Netlify, change SQUARE_ENV to  production  and replace the token and
   location ID with the PRODUCTION values from Step 1.
2. Redeploy (Deploys -> Trigger deploy -> Deploy site).
3. Place a small real order to confirm, then refund it in the Square Dashboard.

---------------------------------------------------------------------
Day-to-day
---------------------------------------------------------------------
- New paid orders appear in Square Dashboard -> Orders, with the photograph
  title, format, size, collection, quantity, price and the shipping address.
  Turn on order notifications in Square (Account & Settings -> Notifications).
- Each order records the included PST separately for bookkeeping; the customer
  pays exactly the price shown on the site.
- Quebec / Yukon / NWT / US customers never reach payment: the site emails a
  shipping-quote request to hello@dustandspurs.ca and Alix replies with a
  Square invoice.
- Refunds, order status and receipts are all handled inside Square.
- If prices or sizes change, update them in BOTH index.html and
  netlify/functions/checkout.js (the function re-checks every price for safety).
- When the custom domain dustandspurs.ca is connected, update SITE_URL and redeploy.

---------------------------------------------------------------------
Paid order alert (email to hello@dustandspurs.ca)
---------------------------------------------------------------------
Square's own "you got paid" email does not list the print, size, or frame.
When a website order is paid, Netlify emails hello@dustandspurs.ca with the
Square order id, reference, each item (name, size, paper/canvas/framed type,
frame color when it is framed, quantity, price), subtotal, included tax,
shipping, total, customer name, email, phone, and the full shipping address.
The message asks Alix to place the matching order in Gelato.

In-person sales rung up in Square are ignored. Only website orders are emailed
(the order is marked source "dustandspurs.ca website", or its reference starts
with DS-). The same order is emailed once. A repeat webhook does not send a
second message.

The website checkout form collects name, email, phone, and shipping address.
Square's payment page is prefilled with those, and it still asks the buyer to
confirm the shipping address.

---------------------------------------------------------------------
STEP 6. Environment variables for the alert
---------------------------------------------------------------------
Add these in Netlify beside the Square variables from Step 2. Redeploy after
any change. Never put the values in the website files or in git.

Already required (same token and location the checkout function uses):

   SQUARE_ACCESS_TOKEN
   SQUARE_LOCATION_ID
   SQUARE_ENV                 sandbox or production. Must match the webhook below.

Webhook (required):

   SQUARE_WEBHOOK_SIGNATURE_KEY
        The signature key Square shows for this webhook subscription.
   SQUARE_WEBHOOK_NOTIFICATION_URL
        The notification URL copied exactly from that same subscription,
        including https. The signature check uses this string. If it differs
        by even one character, every webhook is rejected.

Email. Use the existing hello@dustandspurs.ca mailbox. No new paid account.

   SMTP_HOST                  from the mailbox SMTP settings
   SMTP_PORT                  usually 587. Use 465 only if the mailbox says so.
   SMTP_USER                  the full mailbox address, usually hello@dustandspurs.ca
   SMTP_PASS                  the mailbox password or app password
   SMTP_FROM                  optional. Defaults to SMTP_USER. Hosted mail usually
                              requires this to be that same mailbox.

Optional, only if you are not using the mailbox SMTP:

   RESEND_API_KEY
   RESEND_FROM                a from-address Resend has verified

If SMTP_HOST is set, the mailbox is used and Resend is ignored.

Optional:

   ORDER_ALERT_EMAIL          who receives the alert. Defaults to hello@dustandspurs.ca.
                              Point this at a personal inbox while testing.
   SQUARE_VERSION             optional. Defaults to 2024-11-20.

The site runs on Node 22, set in netlify.toml. Leave that in place. The mail
library needs Node 20 or newer.

Hostedemail: open the hello@dustandspurs.ca mailbox settings and copy the SMTP
host, port, username, and password from there. The host is often
mail.hostedemail.com and the port is often 587. Use the values the mailbox
shows. Do not invent them.

---------------------------------------------------------------------
STEP 7. Square webhook subscription
---------------------------------------------------------------------
Sandbox and production are separate subscriptions, with different signature
keys. Create the sandbox subscription first. The endpoint's SQUARE_ENV and
access token must be the same environment as the subscription. Do not point a
production webhook at a site that still has SQUARE_ENV=sandbox.

1. Open https://developer.squareup.com/apps and the app "Dust & Spurs Website".
2. Switch to Sandbox (top of the page) for a test, or Production when going live.
3. Left menu: Webhooks, then Subscriptions, then Add subscription.
4. Name it "Dust & Spurs order alert".
5. Notification URL, exactly one of:
      Production:  https://dustandspurs.ca/.netlify/functions/square-webhook
      Sandbox test on a deploy preview:
                   https://deploy-preview-NUMBER--heroic-flan-fc0427.netlify.app/.netlify/functions/square-webhook
   Replace NUMBER with the preview's pull request number. The path
   /.netlify/functions/square-webhook stays the same.
6. API version: 2024-11-20 or newer.
7. Events: payment.updated and order.updated. Save.
8. Open the subscription, choose Show beside Signature key, and copy it into
   SQUARE_WEBHOOK_SIGNATURE_KEY.
9. Copy the notification URL you saved, unchanged, into
   SQUARE_WEBHOOK_NOTIFICATION_URL.
10. Redeploy the site so Netlify picks up the new variables.

---------------------------------------------------------------------
STEP 8. Test the alert safely (no real charge)
---------------------------------------------------------------------
1. On a computer with this folder, run:  npm install   then   npm test
   That checks the signature, the email text, and duplicate protection.
   It does not call Square and does not send mail.
2. In Netlify, set SQUARE_ENV=sandbox, the sandbox token, the sandbox location,
   the sandbox signature key, and SQUARE_WEBHOOK_NOTIFICATION_URL to the preview
   URL from Step 7. Set ORDER_ALERT_EMAIL to an inbox you can open. Add the
   SMTP variables. Redeploy.
3. On that preview, add a print, enter a Canadian address and a real phone
   number (Square rejects obvious fake numbers such as 555), and pay with
   Square's sandbox card:
      4111 1111 1111 1111    any future expiry    CVV 111    any postal code
4. Confirm one email arrives with the item, size, type, frame if any, prices,
   phone, and shipping address, and that it says to place the order in Gelato.
5. In the Square Developer webhook logs, resend the same event. A second email
   must not arrive.
6. Only after that, create the production subscription aimed at
   https://dustandspurs.ca/.netlify/functions/square-webhook
   with the production signature key, production token, and SQUARE_ENV=production.
   Set ORDER_ALERT_EMAIL back to hello@dustandspurs.ca if you changed it.
   Redeploy. Do not use a real card until that production check is the one you intend.
