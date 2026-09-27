# SME Cash Stress Test

A free, no-login cash-flow diagnostic quiz for Australian SME owners: a 15-question
questionnaire → an instant 0–100 "cash stress" score across five categories → a
lead-capture step → a results page with a waitlist CTA for a paid "Financial Rescue
Report".

Built as a static front end (Cloudflare Pages) + a small API (Cloudflare Worker +
D1 database) for lead storage and authoritative server-side scoring.

## Project structure

```
sme-cash-stress-test/
├── public/              Static assets, served directly by the Worker
│   ├── index.html       Landing page, quiz, capture form, results
│   ├── styles.css
│   ├── app.js           Quiz engine, client-side scoring preview, API calls
│   ├── privacy.html
│   ├── terms.html
│   ├── contact.html
│   ├── robots.txt
│   ├── sitemap.xml
│   └── _headers         Security headers + caching rules
├── worker/
│   └── index.js         API: POST /api/lead, POST /api/waitlist
├── wrangler.toml        Single config: static assets + Worker + D1 binding
├── schema.sql           D1 table definitions
└── README.md
```

This is a single **Cloudflare Workers** project (using Workers' built-in
static assets support) rather than a separate Pages project + Worker.
One deploy publishes both the site and the API together — requests that
match a file in `public/` are served as static assets automatically;
everything else (like `/api/lead`) is handled by `worker/index.js`.

## How it works

1. Visitor lands on `/`, clicks **Start the Free Cash Stress Test**.
2. 15-question quiz runs client-side (`app.js`), with two conditional
   follow-ups (inventory ageing, debt pressure) shown only when relevant.
3. On completion, the visitor enters name/email/business size on the
   capture screen.
4. The browser computes a **preview** score locally and immediately
   `POST`s the raw answers + contact details to `/api/lead`.
5. The Worker recomputes the **authoritative** score from the raw
   answers (never trusts a client-sent score), stores the lead and
   answers in D1, and returns the score/category/issues.
6. Results render with a category breakdown, top 3 "cash leak" issues,
   and a waitlist button (`POST /api/waitlist`) for the paid report.

The scoring logic lives in two places — `public/app.js` (instant preview)
and `worker/index.js` (source of truth) — deliberately kept in sync so a
slow network doesn't block the UI, but nothing user-editable ever
determines the stored score.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is fine)
- [Node.js](https://nodejs.org/) 18+ and npm
- Wrangler CLI: `npm install -g wrangler` (or use `npx wrangler`)
- `wrangler login` once, to authenticate the CLI

## 1. Set up the database

```bash
cd sme-cash-stress-test
wrangler d1 create sme-cash-stress-test
```

This prints a `database_id`. Copy it into `wrangler.toml` (repo root)
under `[[d1_databases]]`.

Apply the schema:

```bash
wrangler d1 execute sme-cash-stress-test --file=./schema.sql
```

## 2. Deploy — via the Cloudflare dashboard (recommended for GitHub)

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Compute (Workers) → Import a
   repository**, and select this repo.
3. On the "Set up your application" screen:
   - **Project name:** whatever you like (this becomes part of your
     `*.workers.dev` URL).
   - **Build command:** leave blank.
   - **Deploy command:** leave as `npx wrangler deploy` (default).
   - **Preview command:** leave as default.
4. Click **Deploy**. Cloudflare reads `wrangler.toml` from the repo
   root, publishes `public/` as static assets, and deploys
   `worker/index.js` as the API — all in one project.
5. **Add the D1 binding:** if you didn't already put a real
   `database_id` in `wrangler.toml` before deploying, go to the
   deployed Worker's **Settings → Bindings → Add binding → D1
   database**, name it `DB`, and select the `sme-cash-stress-test`
   database you created in step 1. Redeploy after adding it.
6. Every future push to your default branch will auto-redeploy.

## 2b. Alternative — deploy via CLI

```bash
wrangler deploy
```

This publishes to `https://<project-name>.<your-subdomain>.workers.dev`,
serving both the site and the API from that one URL — no separate
`API_BASE` configuration needed, since `app.js` calls `/api/lead` as a
same-origin relative path by default.

## 3. Custom domain

In the Worker's **Settings → Domains & Routes**, add your custom domain.
Update the `canonical`, `og:url`, `robots.txt` and `sitemap.xml` URLs in
`public/` from the placeholder `smeCashStressTest.com` to your real
domain, and tighten `ALLOWED_ORIGIN` in `worker/index.js` from `"*"` to
that domain.

## 5. Before going live

- [ ] Replace all `[BUSINESS NAME]`, `[DATE]` and email placeholders in
      `privacy.html`, `terms.html` and `contact.html`, and have them
      reviewed by a qualified professional for your jurisdiction.
- [ ] Wire up a real email send in `handleLead()` in `worker/index.js`
      (e.g. Resend, Postmark, Mailgun, or Cloudflare Email Workers) so
      leads actually receive their report.
- [ ] Replace the `track()` stub in `app.js` with real analytics (e.g.
      Meta Pixel / Conversions API, Plausible, or GA4) once you have a
      privacy policy that discloses it.
- [ ] Tighten `ALLOWED_ORIGIN` in `worker/index.js` to your real domain.
- [ ] Consider basic rate limiting on `/api/lead` (e.g. Cloudflare's
      built-in rate limiting rules) to deter abuse.
- [ ] Swap the placeholder favicon/logo for real brand assets.

## Local development

```bash
wrangler dev
```

This serves `public/` and `worker/index.js` together at
`http://127.0.0.1:8787`, using a local D1 instance — no extra
configuration needed since it's all one project.

## License

No license specified — treat as proprietary to the project owner unless
you add one.
