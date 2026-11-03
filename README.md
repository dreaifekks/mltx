# x-masonry

Lays out the x.com home timeline (For you, Following and the pinned tabs) as a
masonry that fills the window. Every other page stays as X renders it.

## Install

`chrome://extensions` → Load unpacked → this directory. Developer mode must be on.

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
