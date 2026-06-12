# tryhomecanvas.com — landing page

One self-contained static page (`index.html` + the demo video + poster). No build step, no framework: the hero's 3D home is CSS-3D built by a small inline script, the demo video autoplays muted on loop, everything else is inline CSS.

## Preview locally

```bash
open landing/index.html        # or any static server
```

## Wire up email capture (2 minutes)

1. Create a free form at [formspree.io](https://formspree.io) → copy the form ID.
2. In `index.html`, replace `YOUR_FORM_ID` (one constant at the top of the script).

Until then, submissions show the success state locally and send nothing.

## Deploy to tryhomecanvas.com

Any static host works — the folder is the site root:

- **Cloudflare Pages**: create a project → direct upload (or point at the repo with build output dir `landing/`) → add the custom domain `tryhomecanvas.com` (DNS is automatic if the domain is on Cloudflare).
- **Netlify**: `npx netlify deploy --dir landing --prod` → add the custom domain in site settings.

After DNS propagates, force HTTPS (both hosts do this automatically).
