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
- `Alt+-` / `Alt+=` sets it by hand, `Alt+0` goes back to automatic. The choice is
  stored in `localStorage` under `xm-cols`.
- The button above X's Grok and chat buttons switches to a sideways flow: screen-high
  columns that scroll left and right. A sideways swipe stays native, a vertical gesture
  or mouse wheel anywhere in the window moves the list, and a card taller than its
  column scrolls inside itself. The choice is stored under `xm-flow`.
- Timelines (For you, Following, pinned lists): hover the list icon under the X logo.
- Hover the X logo and click to expand or collapse the sidebar. X only draws labels
  in windows about 1265px or wider, so narrower ones keep the plain logo.
- The rail's links open in a sheet over the feed. Clicking outside it goes back, and
  clicking the icon again brings the page back as it was. The 3 most recently used
  pages stay alive; each is a full X page in an iframe, so they cost memory.
- Clicking a post opens X's post page in a floating window: the post on the left with
  its own scrolling and the action bar and reply box pinned below it, the sort button
  and replies on the right. Clicking outside or Esc closes it. One iframe stays warm, so only the first open loads a page.
  Photos, profile links, buttons and quoted posts on a card keep doing what they do.
- `frame-rules.json` removes `X-Frame-Options` only for x.com framed by x.com.
  Pages enter the panel through `/i/history`, because X's service worker answers
  `/notifications`, `/<user>` and others from a cached page the rule can't reach.
- The post box is gone from the timeline. The rail's + button opens the composer.

## How it works

See the comment at the top of `masonry.js`. In short: X's own cells stay in X's
list, the list gets a proxy viewport so it mounts what the board shows, and each
cell is positioned with the CSS `translate` property. The page scrolls natively.

It depends on X's internals: `window.scroller`, and on that object `_viewport`,
`_cells`, `_rootRef`, `_getHeight`, `_scheduleCriticalUpdate`, `props.list`,
`props.cacheKey`. If those change, the list does not attach and the page falls
back to X's normal layout after 8 seconds, or after 3 errors in a row.

`test/inject.mjs` bundles the script and stylesheet into one expression, for
trying a change in an open tab without reloading the extension.

The approach of driving X's list through a proxy viewport comes from
[x-ultrawide](https://github.com/thehasnaink/x-ultrawide) (MIT). No code is copied.
