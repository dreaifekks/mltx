# mltx

Lays out the x.com home timeline (For you, Following and the pinned tabs) as a
masonry that fills the window. Every other page stays as X renders it.

## Install

Chrome: `chrome://extensions` → Load unpacked → this directory, with Developer mode on.
Or use a package from Releases.

## Build and release

See [docs/RELEASING.md](docs/RELEASING.md).

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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

MIT
