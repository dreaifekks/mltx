# x-masonry

Lays out the x.com home timeline (For you, Following and the pinned tabs) as a
masonry that fills the window. Every other page stays as X renders it.

## Install

`chrome://extensions` → Load unpacked → this directory. Developer mode must be on.

## Use

- Column count follows the window: about one column per 500px, at most 4.
- `Alt+-` / `Alt+=` sets it by hand, `Alt+0` goes back to automatic. The choice is
  stored in `localStorage` under `xm-cols`.

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
