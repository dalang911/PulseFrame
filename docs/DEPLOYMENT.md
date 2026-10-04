# Deployment

Two artefacts, deployed apart from each other:

| Artefact | What | Hosted at |
|---|---|---|
| **frontend** | this repository — static files only | any static host, CDN or object storage |
| **store** | optional community endpoint, not published here | a separate deployment you do not have to touch |

The frontend is just `index.html` plus ES modules — nothing on this page needs a
server language. The store is only needed for the *Shared* panel and for
publishing.

---

## 1. Static hosting

```bash
# local test — ES modules will NOT load from file://
python3 -m http.server 8080
php -S localhost:8080            # or any other static server
```

Then copy the folder to the host. Nothing else is required: no build output, no
`node_modules`, no server language.

Browsers only run WebCodecs in a secure context, so serve the **production** site
over HTTPS. Local `http://localhost` is treated as secure and works for
development.

Caching: modules are requested with a `?v=` cache-buster on some pages. Keep one
value per module within a page — two different strings create two instances of the
same module (two registries, two stores). After an upgrade, change the `?v=` value
or purge the CDN.

## 2. Configuration: `site.config.js`

Create it from the example; it is git-ignored because you will typically swap the
shared demo values for your own:

```bash
cp site.config.example.js site.config.js
```

The example is pre-filled with two shared defaults so a fresh clone browses the
public store and renders the map components immediately:

```js
window.PULSEFRAME_CONFIG = {
    // points at the public demo store; set to '' to derive from your own URL
    apiBase: 'https://sportsfile.data4u.vip/pages/server/api.php',
    apiBaseByHost: {
        // only needed when the store lives on a different origin than the app
        // 'www.example.com': 'https://api.example.com/server/api.php',
    },
    amapKey: 'dc517396597f9dbd58c7483f2626c68c',  // demo key — replace before
                                                   // you deploy anywhere real
};
```

The demo `amapKey` is exposed in a public repository and is rate-limited on
purpose; every quota blow-up lands on the owner. Apply for your own at
<https://console.amap.com> and restrict it to your domain. The demo `apiBase`
is a public read surface — a fresh clone can browse the shared library.
Publishing back is a separate concern of the store itself: this frontend does
not implement or document how a store identifies a user or decides whether to
accept a submission.

`index.html`, `designer.html` and `studio/index.html` load this file before the
modules. If it is missing the app still runs on the derivation described below
and logs one line — you can delete the file entirely and everything except the
AMap tile layer keeps working.

The same values can be provided without a file:

```html
<meta name="pulseframe:api-base" content="https://api.example.org/api.php">
<meta name="pulseframe:amap-key" content="…">
```

## 3. How the API address is resolved

`js/core/appConfig.js` → `apiBase()`, first match wins:

1. `PULSEFRAME_CONFIG.apiBase`
2. `PULSEFRAME_CONFIG.apiBaseByHost[location.hostname]`
3. `<meta name="pulseframe:api-base">`
4. **derived** from the current URL

The derivation walks up from the page path to the folder that contains the
frontend, then across to a sibling `server/`:

| Page URL | Derived API URL |
|---|---|
| `https://host/pulseframe/index.html` | `https://host/server/api.php` |
| `https://host/pulseframe/studio/index.html` | `https://host/server/api.php` |
| `https://host/index.html` | `https://host/server/api.php` |
| `https://host/apps/pulseframe/designer.html` | `https://host/apps/server/api.php` |
| `https://host/apps/pulseframe/v3/designer.html` | `https://host/apps/pulseframe/server/api.php` |

Note the last row: the derivation goes up **exactly one** level from the folder
holding the page, so it only finds a store that is a sibling of that folder. If
your layout differs — deeper nesting, or the store on another domain — set
`apiBase` (or `apiBaseByHost`) explicitly. `studio/` is special-cased: the
`…/studio/` suffix is stripped before going up, so Studio and the editor reach the
same API.

### Cross-origin requests

The frontend makes plain `fetch()` calls, so the browser enforces CORS. If your
frontend origin differs from the store origin, the store has to send an
`Access-Control-Allow-Origin` header that matches — that is a concern of
whoever runs the store, and this repository does not document any particular
store's policy. When frontend and store are same-origin (the demo layout below)
this is a non-issue.

The store list is cached in `localStorage` under `templateShop_cache`, so after
switching `apiBase`, a hard reload may be needed.

## 4. Reference layout (the live instance)

The public demo runs at:

```
https://pulseframe.data4u.vip/              frontend (this repo)
https://pulseframe.data4u.vip/studio/       PulseFrame Studio
https://sportsfile.data4u.vip/pages/server/api.php   shared store (apiBase)
```

Frontend and store are same-origin there, so a clone can simply leave `apiBase`
empty and the derived default resolves correctly. Set `apiBase` (or an
`apiBaseByHost` entry) only if you mirror the frontend to another hostname that
does not sit alongside a store.

## 5. Optional: no store at all

Delete nothing; simply leave `apiBase` pointing at a host you do not run. The
*Shared* panel shows an empty/failed list and everything else keeps working:
upload, parsing, editing, local templates (`localStorage`), Studio, video export.

To disable the panel entirely, hide the *Shared* tab (`#tabShop` /
`#sharedContainer` in `index.html`) — the store calls are all issued from
`js/ui/TemplateShop.js` and `js/components/visual/loader.js`.

## 6. Optional: self-host the CDN dependencies

The editor pages load Leafer from unpkg and a font sheet from a Google-Fonts
mirror host; `index.html` loads the AMap script when a key is configured. For an
air-gapped or privacy-sensitive deployment, vendor those files and edit the
`<script>`/`<link>` tags. `js/core/GlobalFont.js` holds the font host in
`FONT_HOST` — one constant, one place to change.

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) §2 for the exact list.

## 7. Deploy checklist (frontend)

- [ ] `site.config.js` present on the server, absent from git, with your own
      AMap key (do not ship production traffic on the shared demo key)
- [ ] `apiBase()` resolves to the intended URL (open the console: the shop logs
      its request; the response should be JSON)
- [ ] HTTPS + HSTS at the edge
- [ ] every `?v=` cache-buster is stable within a page and was bumped after an
      upgrade
- [ ] *Shared* panel loads the store list, or you have hidden the panel
- [ ] the map components render, or you have swapped the tile provider
      (OSM-HOT / CARTO / Esri / AMap) to one whose terms suit your use

Hosting your own store is a separate concern and not documented in this
repository — see [README §The shared template store](../README.md#the-shared-template-store).
