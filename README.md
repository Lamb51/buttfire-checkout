# Buttfire Coffee — Checkout Setup (Vercel + Stripe)

This folder is a complete, deployable Vercel project:

```
buttfire-checkout/
├── index.html                        ← storefront
├── checkout.html                     ← checkout page (calls the API below)
├── success.html                      ← shown after a successful payment
├── package.json
└── api/
    └── create-checkout-session.js    ← serverless function, creates the Stripe session
```

## 1. Create a Stripe account
Sign up at https://dashboard.stripe.com/register if you haven't already...
Once in, go to **Developers → API keys** and copy your **Secret key**
(starts with `sk_test_...` while testing, `sk_live_...` when you're ready
for real payments).

## 2. Push this folder to GitHub
Vercel deploys from a Git repo.

```bash
cd buttfire-checkout
git init
git add .
git commit -m "Buttfire Coffee storefront + checkout"
git branch -M main
git remote add origin https://github.com/<your-username>/buttfire-checkout.git
git push -u origin main
```

## 3. Import the project into Vercel
1. Go to https://vercel.com/new
2. Import the GitHub repo you just pushed.
3. Framework preset: choose **Other** (this is plain static + serverless
   functions, no framework needed).
4. Before deploying, add two **Environment Variables**:
   - `STRIPE_SECRET_KEY` → your Stripe secret key from step 1
   - `SITE_URL` → your Vercel URL, e.g. `https://buttfire-checkout.vercel.app`
     (you can update this later once you connect a custom domain)
5. Click **Deploy**.

Vercel will automatically detect `api/create-checkout-session.js` and turn
it into a live endpoint at `/api/create-checkout-session` — no extra config
needed.

## 4. Test it
1. Visit your deployed `checkout.html`.
2. Fill in the form and hit **Pay**.
3. You'll be redirected to a Stripe-hosted payment page. Use Stripe's test
   card `4242 4242 4242 4242`, any future expiry, any CVC.
4. On success you'll land on `success.html` with a confirmation reference.

## 5. Go live
- Swap your Stripe **test key** for your **live key** in Vercel's
  environment variables once you're ready to accept real payments.
- Stripe requires you to finish their account activation (business details,
  bank account) before live charges will process.

## 6. Connect your domain
`bfcafes.com` is the domain for this storefront:
- In Vercel: **Project → Settings → Domains** → add `bfcafes.com` (and
  `www.bfcafes.com` if you want both to resolve).
- In bfcafes.com's DNS settings (wherever it's registered): add the
  A/CNAME record Vercel provides.
- Once it's verified, update the `SITE_URL` environment variable to
  `https://bfcafes.com` and redeploy — this is what Stripe uses to build
  the success/cancel redirect URLs.
- If bfcafes.com has email or other services on it already, those live on
  separate MX records — pointing the site to Vercel only touches the
  A/CNAME records, so email won't be affected.

## 7. Order notifications (webhook)
`api/webhook.js` listens for completed Stripe payments — this is the
reliable record of an order, since it fires even if a customer closes the
tab right after paying (before `success.html` ever loads). On every
completed checkout it:

1. **Logs the order** — visible in Vercel's dashboard under
   **Project → Logs**, or via `vercel logs` from the CLI. This is a
   real-time feed with short retention, not permanent storage — see
   section 8 below for the actual permanent, searchable record.
2. **Saves the order** to a Postgres database (section 8) so you have a
   permanent, queryable history.
3. **Emails a notification** to you with the customer's email, items,
   quantities, total, and shipping address (if collected).

### Set up the webhook in Stripe
1. Go to **Developers → Webhooks** in the Stripe dashboard.
2. Click **Add endpoint**, set the URL to
   `https://bfcafes.com/api/webhook` (or your `.vercel.app` URL while
   testing).
3. Select the event `checkout.session.completed`.
4. Stripe will show you a **signing secret** (`whsec_...`) — copy it.

### New environment variables to add in Vercel
| Variable | Value |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | the `whsec_...` value from step 4 above |
| `SMTP_HOST` | your email provider's SMTP host |
| `SMTP_PORT` | usually `587` (or `465` if using SSL) |
| `SMTP_SECURE` | `true` if using port 465, otherwise `false` |
| `SMTP_USER` | the mailbox username to send from |
| `SMTP_PASS` | that mailbox's password |
| `SMTP_FROM` | optional — defaults to `SMTP_USER` if omitted |
| `NOTIFY_EMAIL` | the address that should receive new-order emails |
| `POSTGRES_URL` | auto-added by Vercel when you create the Postgres database (section 8) |
| `ADMIN_API_KEY` | any long random string — protects the `/api/orders` lookup endpoint (section 8) |

Since business email is already set up on Hostinger, its IMAP/SMTP
credentials work directly here — Hostinger's SMTP host is typically
`smtp.hostinger.com` on port `587` (check your Hostinger email settings
for the exact host if it differs). No separate email service needed.

### Testing the webhook
Stripe's CLI lets you trigger test events locally:
```bash
stripe listen --forward-to localhost:3000/api/webhook
stripe trigger checkout.session.completed
```
Or, once deployed, just complete a real test-mode checkout with card
`4242 4242 4242 4242` — the webhook will fire automatically and you should
get an email within a few seconds.

## 8. Order history (database)
Beyond the log and email, every completed order is now also saved to a
Postgres database — this is your permanent, searchable record.

### Set up Vercel Postgres
1. In your Vercel project: **Storage → Create Database → Postgres**
   (this uses Neon under the hood; the free tier is plenty for a small
   shop).
2. Vercel automatically adds a `POSTGRES_URL` environment variable to
   your project — no manual copying needed.
3. Open the **Query** tab for that database and run the contents of
   `schema.sql` (included in this folder) once, to create the `orders`
   table.

### Looking up past orders
A real table view with search lives at:
```
https://bfcafes.com/orders.html
```
It asks for your admin key once (the same `ADMIN_API_KEY` you set above),
then shows every order — date, customer, items, shipping city/state, and
total — with a search box to filter by customer email. The key is kept
only in that browser tab's session storage (cleared when the tab closes,
or by clicking **Lock**), and the page is marked `noindex` so it won't
show up in search results. It's not linked from the public storefront on
purpose — bookmark it directly rather than navigating to it from the
site.

There's also the raw JSON endpoint if you ever want to script against it:
```
https://bfcafes.com/api/orders?key=YOUR_ADMIN_API_KEY
https://bfcafes.com/api/orders?key=YOUR_ADMIN_API_KEY&search=someone@email.com
```

If you'd rather browse orders visually instead of either of those, the
Postgres **Query** tab in Vercel also lets you run
`SELECT * FROM orders ORDER BY created_at DESC;` directly.

## How the cart works
`cart.js` is shared by `index.html` and `checkout.html` and stores the
cart in the browser's `localStorage` under the key `buttfire_cart`.

- Clicking **Add to bag** on the storefront adds/increments an item and
  updates the cart badge next to the bag icon in the nav.
- `checkout.html` reads the same cart on load, renders each line item with
  quantity +/− controls and a remove option, and recalculates subtotal,
  shipping (free at $75+, otherwise $8), tax (7%), and total live.
- On submit, the real cart (name + quantity per item) is sent to
  `/api/create-checkout-session`, which looks up the authoritative price
  for each item server-side — so nothing about the charge amount is
  trusted from the browser.
- After a successful Stripe payment, `success.html` clears the cart.

**Product catalog:** prices/names live in two places that need to stay in
sync — `cart.js` (`CATALOG`, for display) and
`api/create-checkout-session.js` (`CATALOG`, for the actual charge). If you
add or reprice a product, update both. Product ids (e.g. `ignition-mug`)
must match exactly between `cart.js`, the `data-id` attributes on each
"Add to bag" button in `index.html`, and the server catalog.

There's no inventory tracking, discount codes, or account system yet — the
promo code field is a placeholder. Happy to build any of those next.
