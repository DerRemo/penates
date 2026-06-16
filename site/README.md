# penates.dev — site (landing + docs)

The complete penates.dev website: a custom landing page (`/`, `/de/`) plus the
Starlight-powered documentation under `/docs/**` (`/de/docs/**`).

## Layout

- `src/pages/index.astro` + `src/pages/de/index.astro` — landing pages (skeleton; full build is Phase 2).
- `src/content/docs/docs/**` — English docs (the `docs/` subfolder yields the `/docs` URL prefix, keeping `/` free for the landing and future marketing routes).
- `src/content/docs/de/docs/**` — German docs (`de` is the locale segment).
- `src/content.config.ts` — registers the Starlight `docs` collection (required on Astro 5).
- `src/styles/custom.css` — brand theme (Catppuccin Latte default / Mocha dark, teal accent, self-hosted fonts).

## Develop

```bash
cd site
npm install
npm run dev      # http://localhost:4321
npm run build    # static output → dist/ (+ Pagefind search index)
npm run preview
```

The hub app (repo root) is independent: it has no build step and does not depend on this directory.
