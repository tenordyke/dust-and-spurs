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
