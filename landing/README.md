# tryhomecanvas.com — landing page

One self-contained static page (`index.html` + the demo video + poster). No build step, no framework: the hero's 3D home is CSS-3D built by a small inline script, the demo video autoplays muted on loop, everything else is inline CSS.

## Preview locally

```bash
open landing/index.html        # or any static server
```

## Email capture — where the emails go

Two paths, first match wins:

1. **Netlify (zero setup, recommended):** deploy this folder on Netlify and the
   forms are captured automatically — every signup appears in the Netlify
   dashboard under **Site → Forms → "early-access"** (enable email
   notifications there to get pinged per signup).
2. **Formspree (host-agnostic):** create a free form at
   [formspree.io](https://formspree.io) and replace `YOUR_FORM_ID` in
   `index.html` (one constant at the top of the script) — signups then land in
   your Formspree inbox instead, on any host (Cloudflare Pages, S3, anything).

⚠️ Until one of these is in place, submissions show the success state but are
**not stored anywhere** (a console warning says so on local previews).

## Deploy to tryhomecanvas.com

Any static host works — the folder is the site root:

- **Cloudflare Pages**: create a project → direct upload (or point at the repo with build output dir `landing/`) → add the custom domain `tryhomecanvas.com` (DNS is automatic if the domain is on Cloudflare).
- **Netlify**: `npx netlify deploy --dir landing --prod` → add the custom domain in site settings.

After DNS propagates, force HTTPS (both hosts do this automatically).
