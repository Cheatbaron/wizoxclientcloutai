# Wizox License Site

Admin panel + key check API, running as a Cloudflare Worker (free, always online, no PC needed).

- `https://license.seekboosting.lol/admin` – log in, generate / revoke / delete keys, reset HWID
- `POST https://license.seekboosting.lol/api/verify` – the client checks a key here

## Put it online (one time, on Windows)

Needs Node.js from https://nodejs.org. Open PowerShell in the `license-site` folder and run these one at a time:

```
npm install
npx wrangler login
npx wrangler kv namespace create KEYS
```

Copy the `id` it prints into `wrangler.toml` (replace `REPLACE_WITH_YOUR_KV_ID`). Then:

```
npx wrangler secret put ADMIN_PASSWORD
```

Type the password you want for the admin page. Then, in the Cloudflare dashboard → seekboosting.lol → **DNS**,
delete the old `license` record (the one pointing at the dead tunnel). Finally:

```
npx wrangler deploy
```

Done – open https://license.seekboosting.lol/admin.

## Payments (Stripe)

The website's **Get Monthly / Get Lifetime** buttons open a Stripe checkout. When the payment goes through,
a key is created automatically and shown to the buyer on `thanks.html`. It also shows up in the admin panel
with the plan and the buyer's email as its note.

Prices live in `PLANS` at the top of `src/worker.js` (in cents: `799` = €7.99).

1. Make an account at https://dashboard.stripe.com and finish the business details so you can take payments.
2. **Developers → API keys**: copy the *Secret key* (`sk_live_...`) and run:
   ```
   npx wrangler secret put STRIPE_SECRET_KEY
   ```
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://license.seekboosting.lol/api/stripe-webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Copy its *Signing secret* (`whsec_...`) and run:
   ```
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
4. `npx wrangler deploy`

Tip: test first with Stripe's **test mode** keys (`sk_test_...`) and card `4242 4242 4242 4242`.

## How keys work

- Format: `WIZOX-XXXX-XXXX-XXXX-XXXX`
- Duration (1/7/30/90/365 days or lifetime) starts counting the **first time** the key is used.
- With HWID lock on, the first PC that uses the key owns it. Use **Reset HWID** to let the buyer move PCs.

## Client check

```
POST /api/verify
{"key": "WIZOX-....", "hwid": "<unique id of this PC>"}
```

Reply: `{"valid": true, "expiresAt": 1730000000000}` or `{"valid": false, "reason": "..."}` where reason is one of
`invalid_key`, `revoked`, `expired`, `hwid_mismatch`, `missing_key`, `missing_hwid`.
