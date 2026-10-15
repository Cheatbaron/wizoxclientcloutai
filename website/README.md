# Wizox Website (homepage + store)

One file: `index.html`. Edit the `LINKS` block near the bottom to set your Discord invite,
download link. Prices and text are plain HTML.

The buy buttons use Stripe through the license site (`API` in `index.html` and `thanks.html`).
Set up Stripe as described in `license-site/README.md`. If you change prices, change them in both
`index.html` and `PLANS` in `license-site/src/worker.js`.

## Put it online (Cloudflare Pages, free)

In PowerShell, inside this `website` folder:

```
npx wrangler login
npx wrangler pages deploy . --project-name wizox
```

Then in the Cloudflare dashboard → **Workers & Pages → wizox → Custom domains**, add `seekboosting.lol`.
