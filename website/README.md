# Wizox Website (homepage + store)

One file: `index.html`. Edit the `LINKS` block near the bottom to set your Discord invite,
download link and the shop links for each plan (Sellix, Tebex, etc.). Prices and text are plain HTML.

## Put it online (Cloudflare Pages, free)

In PowerShell, inside this `website` folder:

```
npx wrangler login
npx wrangler pages deploy . --project-name wizox
```

Then in the Cloudflare dashboard → **Workers & Pages → wizox → Custom domains**, add `seekboosting.lol`.
