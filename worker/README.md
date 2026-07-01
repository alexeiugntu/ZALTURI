# ZALTURI control-panel Worker — setup

The site control panel needs one small Cloudflare Worker (free tier is fine).
Do this once in the **Cloudflare dashboard**. ~10 minutes.

## 1. KV namespace (storage for the config)
Dashboard → **Storage & Databases → KV** → **Create a namespace**
- Name: `zalturi-config` → Create.

## 2. Create the Worker
Dashboard → **Workers & Pages → Create → Worker**
- Name: `zalturi-admin` → Deploy (the default "Hello World").
- Then **Edit code**, delete everything, paste the contents of `zalturi-admin.js`, **Deploy**.

## 3. Bind KV + R2 to the Worker
Worker → **Settings → Bindings → Add binding**
- **KV namespace**: Variable name `CONFIG` → namespace `zalturi-config`.
- **R2 bucket**: Variable name `AUDIO` → bucket `zaltiri-audio`.

## 4. Set the password (secret)
Worker → **Settings → Variables and Secrets → Add**
- Type **Secret**, name `ADMIN_PASSWORD`, value = your panel password → Save.

## 5. Give it an address
Worker → **Settings → Domains & Routes**
- Easiest: use the default `https://zalturi-admin.<your-subdomain>.workers.dev`.
- Nicer: **Add Custom Domain** → `admin.zalturi.com` (Cloudflare handles the DNS since zalturi.com is on Cloudflare).

## 6. Tell me the final URL
Send me the Worker URL (workers.dev or admin.zalturi.com). I'll wire the site + build the
panel at `zalturi.com/admin/` against it.

### Quick test (optional)
Open `https://<worker-url>/config` in a browser — it should return `{}` (empty config, correct).

---
CLI alternative (if you prefer): `npx wrangler deploy` with `wrangler.toml`, then
`npx wrangler secret put ADMIN_PASSWORD`. Dashboard is easier and needs no install.
