# How it works

See the comment at the top of `masonry.js`. In short: X's own cells stay in X's
list, the list gets a proxy viewport so it mounts what the board shows, and each
cell is positioned with the CSS `translate` property. The page scrolls natively.

It depends on X's internals: `window.scroller`, and on that object `_viewport`,
`_cells`, `_rootRef`, `_getHeight`, `_scheduleCriticalUpdate`, `props.list`,
`props.cacheKey`. If those change, the list does not attach and the page falls
back to X's normal layout after 8 seconds, or after 3 errors in a row.

The content scripts are grouped in `manifest.json` so that each lists what it needs ahead
of it, with `common.js` in both of its entries. Chrome only promises the order inside one
entry: across entries `panel-frame.js` has run first on real pages, leaving the panel on
`/i/history` and the post window in one column. `test/mock-e2e.mjs` checks the listing.

The words live in `i18n.js`, because the page's own world can't reach `chrome.i18n` and it
can't follow the language setting. `_locales` only holds what the manifest shows.

`frame-rules.json` removes `X-Frame-Options` only for x.com framed by x.com.
Pages enter the panel through `/i/history`, because X's service worker answers
`/notifications`, `/<user>` and others from a cached page the rule can't reach.

`safari-entry.js` is the route that writes X's page into a frame, since Safari ignores
`frame-rules.json`. Only the Safari build loads or contains it (`scripts/safari-manifest.mjs`).

Settings live in the extension's storage. `settings-bridge.js`, the only part in the
extension's own world, copies them to `localStorage` under `xm-settings`, so `common.js`
has them synchronously at `document_start`. The black and white themes show X a
`night_mode` cookie and a `prefers-color-scheme` in that page only, and the real cookie
stays as it was.

`test/inject.mjs` bundles the script and stylesheet into one expression, for
trying a change in an open tab without reloading the extension.

The approach of driving X's list through a proxy viewport comes from
[x-ultrawide](https://github.com/thehasnaink/x-ultrawide) (MIT). No code is copied.
