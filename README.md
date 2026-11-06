# mltx

Lays out the x.com home timeline (For you, Following and the pinned tabs) as a
masonry that fills the window. Every other page stays as X renders it.

## Install

Chrome: `chrome://extensions` → Load unpacked → this directory, with Developer mode on.
Or use a package from Releases.

## Build and release

```
npm ci
npm test            # end-to-end against a fake x.com; needs `npx playwright-core install chromium`
npm run build       # dist/chrome, dist/firefox, dist/safari
npm run package     # the zips in packages/; add scripts/package-safari.sh for the dmg
```

Pushing a tag `v<version>`, matching `manifest.json`, builds all three and publishes a
GitHub Release. Running the Release workflow by hand only builds, leaving the packages as
artifacts. Without Apple signing secrets the Safari dmg is ad-hoc signed, so Safari needs
"Allow Unsigned Extensions" turned on; set `MACOS_SIGNING_P12`, `MACOS_SIGNING_PASSWORD`
and `APPLE_API_*` to sign and notarize.

Needs Chrome, Firefox 128 or Safari 18.4 and up. The Firefox zip isn't signed: load it from
`about:debugging`, or submit it to AMO to get an installable package.

## Use

- Column count follows the window: as many as fit at 360px or wider, at most 4.
  Below a 900px window, X's own layout stays.
- `Alt+-` / `Alt+=` sets it by hand, `Alt+0` goes back to automatic. This is the same
  setting as the column count in the toolbar popup.
- The button above X's Grok and chat buttons switches to a sideways flow: screen-high
  columns that scroll left and right. A sideways swipe stays native, a vertical gesture
  or mouse wheel anywhere in the window moves the list, and a card taller than its
  column scrolls inside itself. The switch lasts until the page reloads; the default
  flow is in the toolbar popup.
- Timelines (For you, Following, pinned lists): hover the list icon under the X logo.
- Hover the X logo and click to expand or collapse the sidebar. X only draws labels
  in windows about 1265px or wider, so narrower ones keep the plain logo.
- The rail's links open in a sheet over the feed. Clicking outside it goes back, and
  clicking the icon again brings the page back as it was. The 3 most recently used
  pages stay alive; each is a full X page in an iframe, so they cost memory.
- Clicking a post opens X's post page in a floating window: the conversation on the left
  with the action bar and reply box pinned below it, the sort button and replies on the
  right. Clicking outside or Esc closes it. One iframe stays warm, so only the first open
  loads a page. Photos, profile links and buttons on a card keep doing what they do.
- The left side runs from the root of the conversation down to the post clicked, moved up
  only as far as it takes to see that post whole. Everything above it is shown in full and
  can be scrolled to. Clicking any post, above or among the replies, moves the window to
  it the same way.
- While a side panel or the post window shows, the browser's back and forward buttons work
  on its pages. Back past its first page closes it.
- Quoted posts, "show this thread" links and timestamps on a card open in the window too,
  and so do posts clicked in a side panel, over that panel. A photo in a quote stays X's.
- `frame-rules.json` removes `X-Frame-Options` only for x.com framed by x.com.
  Pages enter the panel through `/i/history`, because X's service worker answers
  `/notifications`, `/<user>` and others from a cached page the rule can't reach.
- The toolbar icon opens the settings: muted words, default flow, theme (follow X, black
  or white), whether the rail's links open in the side panel, in the same tab or in a new
  tab, the side panel's refresh time (a hidden page past it loads again when reopened, in
  the post window too), the column count, and the language.
- The settings and the hints on the extension's buttons come in Chinese, English and
  Japanese. They follow the browser's languages until one is chosen, and fall back to
  English. X's own text stays in the language set on X.
  Everything saves as it changes and reaches open pages at
  once, except that changing the theme reloads them, since X only reads it starting up.
- Muted words hide posts in the feed, the post window's replies and the side panels, by
  their text, author or link card. The post opened and what it answers always show.
- The post box is gone from the timeline. The rail's + button opens the composer.
- Ads, Who to follow, trends and X's other non-post modules are gone from the feed.
  A conversation's "show more replies" row stays inside its card and opens the post window.

## How it works

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

## License

MIT
