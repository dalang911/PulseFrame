# Security policy

This repository is the **frontend**: static HTML, ES modules, styles and
assets. It ships no server-side code and no secrets. Everything below describes
the risk surface of the browser application — how it handles untrusted template
JSON, image URLs, third-party scripts and the CDN supply chain.

The optional community store is a **separate application** deployed apart from
this repo. Its implementation, file layout, configuration and hardening measures
are intentionally **not documented here**. Clients only need the URL that
`js/core/appConfig.js` resolves; the request and response shapes are visible in
the browser's Network tab when the *Shared* panel runs, and nothing else about
the store needs to be public.

## Reporting a vulnerability

Please use a **private** channel rather than a public issue:

1. GitHub security advisory: *Security → Report a vulnerability* on the
   repository, or
2. any contact listed on the maintainer's GitHub profile.

Include: the page URL, the browser and version, a minimal reproduction (an
activity file, a template JSON, or a `curl` command against the public store),
and the impact. We aim to acknowledge within 7 days and ship a fix or a
mitigation plan within 30.

**Do not** post exploits, real user data, or credentials in a public issue.

## What the frontend protects against

| Risk | Mitigation |
|---|---|
| Script injection through a shared template's `thumbnail` URL | `safeThumb()` in `js/core/appConfig.js` accepts only an `https://` URL with no quotes/angle brackets, or a `data:image/(png|jpeg|webp);base64,` prefix. Everything else — `javascript:`, `data:text/html`, scheme tricks — is dropped before it reaches an `img.src` or a CSS `url()`. |
| Markup injection from template titles, author names, descriptions | `escapeHtml()` in `js/core/appConfig.js` is applied wherever store values are written into the DOM as HTML. |
| Two live copies of a module (divergent state, phantom listeners) | All deployment URLs resolve through one module, `js/core/appConfig.js`; the `?v=` cache-buster is kept identical per page. |
| Leaking a private map API key in public source | The AMap key is not hard-coded in `index.html`; it is read from `site.config.js`, which stays git-ignored on every deployment. `site.config.example.js` ships a **shared demo key** on purpose, so anyone cloning the repo sees the map components work — treat that key as rate-limited and expected to be replaced with a personal one before any real hosting. Personal or production keys must never make it into the example file. |
| Silent failure when an optional third-party script is blocked | The AMap layer checks that `AMap` actually loaded before use and degrades to the other tile providers instead of throwing. |
| Third-party script supply chain | Every CDN dependency is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) §2, including the Google-Fonts mirror host that the codebase currently uses. Replace it in your own deployment. |
| Rendering untrusted JSON as code | Component definitions are compiled only from files inside `js/components/definitions/` and Studio-authored *spec* JSON that goes through `registry.register()` validation. Store JSON is data: `factory.js` maps declared tags (`Text`, `Rect`, `Path`, `Ellipse`, `Line`, `Polygon`, `Group`) to Leafer constructors — nothing calls `eval`, and the JSON has no way to introduce new constructors. |

## Remaining risks a hosting operator should decide about

1. **Anonymous submissions land in whoever runs the store.** Reading them back
   into this frontend is safe thanks to `safeThumb` / `escapeHtml`, but any
   *other* consumer of the same store must repeat that validation.
2. **Template JSON is data, not code** — but it carries numeric layout values
   that the renderer has to iterate. Extremely large templates slow the canvas
   down; treat store quotas as a policy of the store you use, not a guarantee of
   this frontend.
3. **Vendored libraries** (layui, maptalks, jQuery, Leafer, MediaBunny) need
   periodic updates. The loader falls back to unpkg, which you should pin or
   self-host for a hardened deployment. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §6.
4. **Video encoding runs entirely client-side.** It never executes server code,
   so the frontend's attack surface really is just "render untrusted JSON and
   image URLs".
5. **Anything you serve publicly is scrapable.** The API URL is visible in every
   Network panel; that is by design (the store is meant to be shared). Do not
   put private data in a template you publish.

## Notes for AI-assisted contributions

Parts of this codebase were written with AI assistance. That is not a security
guarantee: review every change to `js/core/appConfig.js`, `js/components/registry.js`
and `js/components/factory.js` before shipping, and do not weaken the validation
matrix without a plan to replace it.
