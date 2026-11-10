// X Masonry: lays the x.com home timeline out as a multi-column masonry.
//
// X's timeline is a virtualized list. It keeps one array of items, mounts the
// ones whose single-column position intersects the viewport rect, and positions
// them with translateY. Moving its cells to another container would fight React,
// so they stay where they are and only three things change:
//
//  1. X's list is handed a proxy viewport. Its rect is worked out from the board,
//     so X mounts the items the board shows rather than a single-column slice.
//  2. Each cell gets its board position through the CSS `translate` property.
//     X's own transform is disabled in the stylesheet.
//  3. The page keeps scrolling natively. The list root is resized to the board
//     height, so wheel, trackpad, scrollbar and keyboard all behave as usual.
//
// A card's column is decided once, when it is first measured, and never changes.
// Later height changes only move cards below it in that one column.
//
// If X renames any of this, nothing attaches and the page stays as X renders it.

(() => {
  if (window.__xMasonry) return;
  window.__xMasonry = true;

  const GAP = 12; // between cards
  const PAD = 12; // around the board
  const MIN_CARD_WIDTH = 360; // used to pick the column count
  const MAX_AUTO_COLS = 4;
  const MIN_WINDOW = 900; // below this the window is too narrow, leave X alone
  const SETTLE_FRAMES = 2; // a height must hold this long before a card is placed
  const VANISH_MS = 500; // a placed card must stay empty this long to count as gone
  const KEEP_SCREENS = 0.75; // cards stay mounted this many screens around the view
  const FILL_SCREENS = 2.5; // new cards are placed ahead of the view by this many screens
  const ATTACH_TIMEOUT = 8000; // ms on /home without a list before giving up
  const NAV_KEY = "xm-nav";
  const MAX_THREAD = 12; // posts a conversation in the feed can span
  const REPLY_SHARE = 0.6; // sideways: how much of a column a reply can keep in a squeezed conversation
  const FLOW_LOOKBACK = 3; // sideways: how many recent columns a card may fill a gap in
  const GESTURE_DEADZONE = 8; // px of movement before an unclear gesture picks a direction
  const SIDEWAYS_BIAS = 2; // vertical must exceed sideways by this much to count as vertical
  const NATIVE_MIN_DX = 3; // px of sideways in a first event to hand the gesture to the browser
  const GESTURE_FORGET = 1000; // ms after which movement too small to decide is dropped
  const GESTURE_GAP = 180; // ms without wheel events before the next one starts a new gesture
  const READY_TIMEOUT = 3000; // ms after attaching to stop hiding a list with nothing to place
  const NAV_LABELS_MIN_WINDOW = 1265; // X draws its rail labels from about this wide
  const PANEL_CACHE = 3; // side-panel pages kept alive
  // X's service worker answers navigations to /home, /notifications, /explore, /<user> and
  // others from a cached page that says X-Frame-Options: DENY, and that never reaches
  // frame-rules.json. It leaves this route to the network; panel-frame.js then swaps in
  // the real address before X starts. Safari ignores frame-rules.json, so safari-entry.js
  // sets another route there, one that starts from a page without the header.
  const PANEL_ENTRY = window.__xmPanelEntry || "/i/history";
  const PANEL_RETRY_MS = 5000;
  const POST_READY_TIMEOUT = 5000; // ms before showing the post window whatever state it's in
  // No allow-top-navigation, so a stray link can't send the feed away. This isn't an
  // isolation boundary: the frame is x.com's own code, same origin as the page.
  const FRAME_SANDBOX = "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";
  const FRAME_ALLOW = "autoplay; fullscreen; clipboard-write; encrypted-media";
  const TABS_CLOSE_DELAY = 180; // ms, so moving from the icon to the list doesn't close it

  const NOT_A_CARD = /^\$footer$/; // the loading spinner at the end of the list
  const CONVERSATION = /^impressionPlaceholder-home-conversation-(\d+)$/;
  // What the feed keeps of X's list, by the item's type: posts and what holds a conversation
  // or the list itself together. Who to follow, trends, prompts and the like all go, along
  // with the header, footer and divider around them. A post is never dropped for its id,
  // so one in a shape not seen before still shows.
  const FEED_TYPES = new Set(["tweet", "tombstone", "ui_tombstone", "ui_moduleImpressionPlaceholder", "ui_conversationModuleGap", "timelineCursor", "newEntries"]);
  const NOT_IN_FEED = /^(?:promoted-|\$divider-)/;
  // Empty items marking where something starts. They need no measuring and can't count on
  // being mounted: nothing with no height falls inside the window X is asked for.
  const MARKER = /^impressionPlaceholder-/;
  // The row X heads the list with for posts it is holding back ("Show 35 posts").
  const NEW_POSTS_BAR = "newEntries";
  const TOP_FRAMES = 30; // the view is kept at the start this long after X sends it there
  // Modules arrive as several items, e.g. header-who-to-follow-<n>, who-to-follow-<n>-user-<m>.
  const MODULE = /^(?:header-|footer-|\$divider-bottom-)?((?!tweet-|promoted-tweet-|impressionPlaceholder-)[a-zA-Z-]+?-\d{10,})/;
  // Routes X opens as a dialog over the page. Other /i/ routes (bookmarks...) are full pages.
  const OVERLAY_ROUTE = /^\/(compose\/|i\/(flow|display|keyboard_shortcuts)(\/|$)|[^/]+\/status\/\d+\/(photo|video)\/\d+)/;
  const STALL_FRAMES = 180; // a card that never gets ready stops holding up the rest
  const IDLE_FRAMES = 30; // quiet this long and the layout pass drops to every IDLE_EVERY frames
  const IDLE_EVERY = 6;

  const root = document.documentElement;
  const common = window.__xmCommon;
  const say = (key) => window.__xmI18n.t(common.settings().lang, key);
  const boards = new Map(); // cacheKey -> board; survives leaving and coming back
  const lists = []; // list instances X has created
  let latestList = window.scroller;
  let current = null; // { S, el, vp, st, board }
  let cfgCols = common.settings().cols;
  let homeSince = 0;
  let errors = 0;
  let themeAt = 0;
  let quietFrames = 0;
  let frameCount = 0;
  let lastPath = "";
  let navOpen = localStorage.getItem(NAV_KEY) === "open";
  let flowSideways = common.settings().flow === "h"; // the default until the switch is used
  let flowBtn = null;
  let flowPlacedAt = 0;
  let gesture = { at: 0, kind: null, dx: 0, dy: 0, cell: null };
  const resetGesture = () => {
    gesture = { at: 0, kind: null, dx: 0, dy: 0, cell: null };
  };
  let tabsBtn = null;
  let navBtn = null;
  let tabsCloseTimer = 0;
  let tabsClicked = false; // something inside the list was clicked, so a popup may be its own
  let panelEl = null;
  let panelScrim = null;
  let panelHref = null; // the page showing, or null when closed
  let panelLink = null;
  const panelFrames = new Map(); // href -> iframe, least recently used first
  let postEl = null;
  let postScrim = null;
  let postFrame = null;
  let postHref = null;
  let postReadyTimer = 0;
  let postHiddenAt = 0;
  let backGuardOn = false;
  let backGuardMoves = 0; // our own traversals on their way, whose popstate isn't anyone else's

  // X does `window.scroller = this` in the list's constructor.
  if (latestList) lists.push(latestList);
  Object.defineProperty(window, "scroller", {
    configurable: true,
    get: () => latestList,
    set(v) {
      latestList = v;
      if (v && !lists.includes(v)) {
        lists.push(v);
        if (lists.length > 12) lists.shift();
      }
    },
  });

  common.onSettings((next, before) => {
    if (next.flow !== before.flow) {
      flowSideways = next.flow === "h";
      flowPlacedAt = 0;
    }
    cfgCols = next.cols;
    if (next.panel !== "sheet") closePanel();
    if (JSON.stringify(next.mute) !== JSON.stringify(before.mute)) {
      for (const board of boards.values()) forgetEmpty(board);
    }
    quietFrames = 0;
  });

  // ---- routes -------------------------------------------------------------

  const isHome = () => location.pathname.replace(/\/+$/, "") === "/home";

  function shouldLayOut() {
    if (innerWidth < MIN_WINDOW) return false;
    if (isHome()) return homeSince === 0 || current || performance.now() - homeSince < ATTACH_TIMEOUT || !!liveList();
    // A dialog or the media viewer over a feed that is still mounted underneath.
    return !!(current && current.el.isConnected && OVERLAY_ROUTE.test(location.pathname));
  }

  function liveList() {
    for (let i = lists.length - 1; i >= 0; i--) {
      const S = lists[i];
      const el = S && S._rootRef && S._rootRef.current;
      if (el && el.isConnected && el.closest('[data-testid="primaryColumn"]') && S._viewport && S.props && S.props.list) return S;
    }
    return null;
  }

  // ---- stable order -------------------------------------------------------

  // Ads and X's recommendation modules never reach the list, so they're never mounted.
  // An item with no type is one of the list's own, like the spinner at the end.
  function belongsInFeed(item) {
    if (NOT_IN_FEED.test(item.id)) return false;
    const data = item.data;
    if (!data || !data.type) return true;
    return FEED_TYPES.has(data.type) && !(data.content && data.content.promotedMetadata);
  }

  const isBar = (item) => !!item.data && item.data.type === NEW_POSTS_BAR;

  // X numbers every entry, in more digits than a number holds. Longer is higher.
  const sortOf = (item) => (typeof item.sortIndex === "string" && /^\d+$/.test(item.sortIndex) ? item.sortIndex : null);
  const sortsAbove = (a, b) => (a.length === b.length ? a > b : a.length > b.length);

  // X moves posts it considers unseen to the end of its list when more load. The
  // board's cards don't care, but the mounted range is a slice of that list, so
  // X's list is kept in first-seen order. New ids stay in X's relative order.
  //
  // A refresh at the top is the exception: all of it goes first, in X's order. X numbers
  // its entries above everything it had, and that includes posts it had already and
  // sends again. Those leave where they were and come back with the rest of the batch.
  function arrange(board, incoming) {
    if (incoming === board.lastIn || incoming === board.lastOut) return board.lastOut;
    const list = incoming.filter(belongsInFeed);
    const bar = list.find(isBar) || null;
    const known = new Map();
    board.order.forEach((id, i) => {
      if (id !== board.barId) known.set(id, i);
    });
    const byId = new Map(list.map((item) => [item.id, item]));

    // Nothing left of what was there means a new list, not a batch on top of the old one.
    const onTop = board.topSort !== null && list.some((item) => known.has(item.id));
    const batch = [];
    let top = board.topSort;
    for (const item of list) {
      const sort = item === bar ? null : sortOf(item);
      if (sort === null) continue;
      if (onTop && sortsAbove(sort, board.topSort)) batch.push(item.id);
      if (top === null || sortsAbove(sort, top)) top = sort;
    }
    board.topSort = top;
    const inBatch = new Set(batch);
    const lifted = new Set();
    for (const id of batch) {
      if (NOT_A_CARD.test(id) || MARKER.test(id)) continue;
      board.kinds.set(id, "front");
      board.mids.delete(id);
      if (board.placed.has(id)) lifted.add(id);
    }
    if (batch.length) {
      board.frontBatch.clear(); // what's left of an earlier batch goes under this one
      quietFrames = 0;
    }
    if (lifted.size) takeOff(board, board.order, (id) => !lifted.has(id));

    const front = [];
    const after = new Map();
    let anchor = null;
    let furthest = -1;
    for (const item of list) {
      if (item === bar || inBatch.has(item.id)) continue;
      const at = known.get(item.id);
      if (at !== undefined) {
        if (at > furthest) {
          furthest = at;
          anchor = item.id;
        }
      } else if (anchor === null) {
        front.push(item.id);
      } else {
        if (!after.has(anchor)) after.set(anchor, []);
        after.get(anchor).push(item.id);
      }
    }
    classifyNew(board, known, byId, front, after);

    // Only a replacement stays where X put it. Anything else new goes to the end, in X's
    // order: left among cards already placed and scrolled past, it would drag the mounted
    // range back to them, or wait for a view that never returns.
    const next = bar ? [bar.id, ...batch, ...front] : [...batch, ...front];
    for (const id of board.order) {
      if (!byId.has(id) || id === board.barId || inBatch.has(id)) continue;
      next.push(id);
      if (after.has(id) && board.mids.has(after.get(id)[0])) next.push(after.get(id)[0]);
    }
    const inPlace = new Set(next);
    for (const item of list) if (!inPlace.has(item.id)) next.push(item.id);
    const before = board.order;
    board.order = next;
    board.barId = bar ? bar.id : null;
    // The bar is on the board from the start, heading the first column. It has no height
    // until X shows it, and X only gets to show it while it's mounted.
    if (bar && !board.placed.has(bar.id)) {
      board.placed.set(bar.id, { col: 0, join: false, shownJoin: false });
      if (board.flow !== "h" && board.columns.length) board.columns[0].unshift(bar.id);
      board.skipped.delete(bar.id);
      board.dirty = true;
    }
    const same = next.length === incoming.length && next.every((id, i) => incoming[i].id === id);
    board.lastIn = incoming;
    board.lastOut = same ? incoming : next.map((id) => byId.get(id));
    rebuildGroups(board);
    forgetDropped(board, byId, before);
    return board.lastOut;
  }

  // What each new item is, decided once when the list changes: a new post at the top, or
  // the replacement for a card that just went. Being ahead of known cards in the list
  // means nothing by itself: X moves old posts to the end whenever more load, so ordinary
  // new posts land before them, and those go to the shortest column like any other.
  function classifyNew(board, known, byId, front, after) {
    let lastAlive = -1;
    for (const [id, i] of known) if (byId.has(id) && i > lastAlive) lastAlive = i;
    if (lastAlive < 0) return; // nothing to be new relative to
    for (const id of front) board.kinds.set(id, "front");
    for (const [anchor, news] of after) {
      const neighbours = neighboursOfReplaced(board, board.order[known.get(anchor) + 1], byId);
      if (!neighbours.prev && !neighbours.next) continue;
      board.kinds.set(news[0], "mid");
      board.mids.set(news[0], neighbours);
    }
    // Taking the place of the very first card. The bar ahead of it comes and goes by itself.
    const first = board.order[board.order[0] === board.barId ? 1 : 0];
    if (front.length && !byId.has(first)) {
      const neighbours = neighboursOfReplaced(board, first, byId);
      if (neighbours.prev || neighbours.next) {
        board.kinds.set(front[0], "mid");
        board.mids.set(front[0], neighbours);
      }
    }
  }

  // If this card just went, what was around it in its column. Something new in its place
  // goes between those, whichever column that is. Names rather than a position, so it
  // still holds after other cards go or the columns are dealt again.
  function neighboursOfReplaced(board, oldId, byId) {
    const p = oldId && !byId.has(oldId) && board.placed.get(oldId);
    const col = p && board.columns[p.col];
    const at = col ? col.indexOf(oldId) : -1;
    if (at < 0) return {};
    return { prev: col.slice(0, at).reverse().find((id) => byId.has(id)), next: col.slice(at + 1).find((id) => byId.has(id)) };
  }

  // Which card each card follows in its conversation or module, read from the list. A
  // conversation is everything from its marker to the post it names.
  function rebuildGroups(board) {
    const order = board.order;
    board.groupPrev = new Map();
    let moduleKey = null;
    for (let k = 0; k < order.length; k++) {
      const id = order[k];
      const opens = CONVERSATION.exec(id);
      if (opens) {
        // Only an unbroken run of posts ending at the one it names, counting its own "show
        // more replies" row. Anything else in the way means the posts aren't known to belong
        // together, so they stay separate.
        const end = order.indexOf(`tweet-${opens[1]}`, k);
        const run = end > k && end - k <= MAX_THREAD ? order.slice(k + 1, end + 1) : [];
        const gap = `home-conversation-${opens[1]}-gap-`;
        if (run.every((m) => m.startsWith("tweet-") || m.startsWith(gap))) {
          for (let i = 1; i < run.length; i++) board.groupPrev.set(run[i], run[i - 1]);
        }
      }
      const mod = MODULE.exec(id);
      const key = mod ? mod[1] : null;
      if (key && key === moduleKey) board.groupPrev.set(id, order[k - 1]);
      moduleKey = key;
    }
  }

  // Muted words changed, so cards passed over for having no height may have one now. They
  // come back the way any card does that got its height back.
  function forgetEmpty(board) {
    for (const id of board.skipped) {
      board.seen.delete(id);
      board.heights.delete(id);
    }
    board.skipped.clear();
  }

  // Takes every card off the board that `stays` doesn't name.
  function takeOff(board, order, stays) {
    // A reply whose conversation head went mustn't glue onto whatever precedes it now.
    // In reading order, since a split conversation can be across columns.
    let headAlive = true;
    for (const id of order) {
      const p = board.placed.get(id);
      if (!p) continue;
      if (!p.join) headAlive = stays(id);
      else if (!headAlive && stays(id)) {
        p.join = false;
        headAlive = true;
      }
    }
    for (const col of board.columns) {
      for (let i = col.length - 1; i >= 0; i--) {
        if (stays(col[i])) continue;
        col.splice(i, 1);
        board.dirty = true;
      }
    }
    for (const id of board.placed.keys()) {
      if (stays(id)) continue;
      board.placed.delete(id);
      board.tops.delete(id);
      board.dirty = true;
    }
    // A replacement with nothing left to go by is just a card now.
    for (const [id, mid] of board.mids) {
      if (mid.prev && !stays(mid.prev)) mid.prev = null;
      if (mid.next && !stays(mid.next)) mid.next = null;
      if (!mid.prev && !mid.next) {
        board.mids.delete(id);
        board.kinds.delete(id);
      }
    }
  }

  function forgetDropped(board, byId, order) {
    takeOff(board, order, (id) => byId.has(id));
    for (const cache of [board.heights, board.seen, board.tops]) {
      for (const id of cache.keys()) if (!byId.has(id)) cache.delete(id);
    }
    for (const id of board.skipped) if (!byId.has(id)) board.skipped.delete(id);
    for (const map of [board.kinds, board.mids]) {
      for (const id of map.keys()) if (!byId.has(id)) map.delete(id);
    }
  }

  // ---- board --------------------------------------------------------------

  function newBoard() {
    return {
      order: [],
      lastIn: null,
      lastOut: null,
      topSort: null, // the highest number X has given an entry here
      barId: null, // X's "show new posts" row while it's in the list
      columns: [], // arrays of ids, top to bottom
      placed: new Map(), // id -> { col, join } for cards on the board
      skipped: new Set(), // zero-height items (placeholders and the like)
      heights: new Map(),
      seen: new Map(), // id -> { h, frames } while waiting to settle
      tops: new Map(),
      bottoms: [],
      total: 0,
      dirty: true,
      groupPrev: new Map(), // id -> the card it follows in its conversation or module
      kinds: new Map(), // unplaced id -> "front" or "mid"; the rest go at the end
      mids: new Map(), // "mid" id -> { prev, next }: the cards to place it between
      frontBatch: new Set(), // cards of the new-at-the-top batch still being placed
      frontHeight: [], // height the batch has taken in each column, rebuilt from frontBatch
      frontCount: [], // ...and how many cards, which is where the next one goes
      joinsNext: new Set(), // cards whose next card in the column is joined to them
      requested: new Set(), // unplaced cards the board has asked X to mount
      stallId: null,
      stallFrames: 0,
      y: 0,
      x: 0, // scroll position in the sideways flow
      flow: "v",
      listTop: 0, // where the list starts in the page, in the vertical layout
      colH: 0,
      totalW: 0,
      restoreFrames: 0,
      topFrames: 0,
    };
  }

  // Sideways: screen-high columns, filled in order. A card that doesn't fit where the
  // last one went can still use a gap in the columns just before it, so columns end up
  // full without the order wandering. Worked out from the sequence each time, so a
  // height change only moves cards after it.
  function relayoutSideways(b) {
    const seq = b.order.filter((id) => b.placed.has(id));
    const columns = [];
    const bottoms = [];
    const natural = (id) => b.heights.get(id) || 0;

    // A conversation stays in one column whatever it takes: the reply is what was
    // recommended, so it keeps its height up to a point and what it answers gets squeezed.
    const fit = (unit) => {
      const heights = unit.map((id) => Math.min(natural(id), b.colH));
      const total = heights.reduce((a, h) => a + h, 0);
      if (unit.length < 2 || total <= b.colH) return heights;
      const last = heights.length - 1;
      heights[last] = Math.min(heights[last], Math.round(b.colH * REPLY_SHARE));
      let room = b.colH - heights[last];
      const heads = heights.slice(0, last).map((h, i) => [h, i]).sort((x, y) => x[0] - y[0]);
      heads.forEach(([h, i], done) => {
        heights[i] = Math.min(h, Math.floor(room / (heads.length - done)));
        room -= heights[i];
      });
      return heights;
    };

    const put = (unit) => {
      const heights = fit(unit);
      const height = heights.reduce((a, h) => a + h, 0);
      let col = -1;
      for (let c = Math.max(0, columns.length - FLOW_LOOKBACK); c < columns.length; c++) {
        if (bottoms[c] + (bottoms[c] > 0 && height > 1 ? GAP : 0) + height <= b.colH) {
          col = c;
          break;
        }
      }
      if (col < 0) {
        col = columns.push([]) - 1;
        bottoms.push(0);
      }
      let y = bottoms[col];
      if (y > 0 && height > 1) y += GAP;
      unit.forEach((id, i) => {
        const p = b.placed.get(id);
        p.col = col;
        p.shownJoin = i > 0;
        // Only when squeezed to share a column; a lone tall card is held by the stylesheet.
        p.capH = unit.length > 1 && heights[i] < natural(id) ? heights[i] : 0;
        if (i > 0) b.joinsNext.add(unit[i - 1]);
        columns[col].push(id);
        b.tops.set(id, y);
        y += heights[i];
      });
      bottoms[col] = y;
    };

    b.joinsNext.clear();
    for (let i = 0; i < seq.length; ) {
      let j = i + 1;
      while (j < seq.length && b.placed.get(seq[j]).join) j++;
      put(seq.slice(i, j));
      i = j;
    }
    b.columns = columns;
    b.bottoms = bottoms;
    b.totalW = 2 * PAD + columns.length * (b.colw + GAP) - (columns.length ? GAP : 0);
    b.total = 0;
    b.dirty = false;
  }

  function relayout(b) {
    if (b.flow === "h") return relayoutSideways(b);
    b.joinsNext.clear();
    b.bottoms = b.columns.map((col) => {
      let y = 0;
      col.forEach((id, i) => {
        const p = b.placed.get(id);
        const h = b.heights.get(id) || 0;
        p.shownJoin = p.join;
        p.capH = 0;
        if (y > 0 && !p.join && h > 1) y += GAP;
        if (i > 0 && p.join) b.joinsNext.add(col[i - 1]);
        b.tops.set(id, y);
        y += h;
      });
      return y;
    });
    b.total = Math.ceil(Math.max(0, ...b.bottoms)) + 2 * PAD;
    b.dirty = false;
  }

  const shortest = (values) => values.reduce((best, v, i) => (v < values[best] ? i : best), 0);

  // The batch sits at the head of each column. Working this out from its members
  // holds up when one is dropped, the columns are re-dealt, or the batch pauses.
  function rebuildFront(b) {
    b.frontCount = b.columns.map((col) => {
      let n = col.length && col[0] === b.barId ? 1 : 0; // under the bar
      while (n < col.length && b.frontBatch.has(col[n])) n++;
      return n;
    });
    b.frontHeight = b.columns.map((col, c) => {
      let h = 0;
      for (let i = 0; i < b.frontCount[c]; i++) h += b.heights.get(col[i]) || 0;
      return h;
    });
  }


  // The card this one follows, past any with no height.
  function groupHead(b, id) {
    let head = b.groupPrev.get(id);
    while (head && !b.placed.has(head) && b.skipped.has(head)) head = b.groupPrev.get(head);
    return head || null;
  }

  // Where a card new among existing ones goes: by the cards it was given to go by.
  function midPosition(b, mid) {
    for (const [id, after] of [[mid.prev, 1], [mid.next, 0]]) {
      const p = id && b.placed.get(id);
      const col = p && b.columns[p.col];
      const at = col ? col.indexOf(id) : -1;
      if (at >= 0) return { col: p.col, at: at + after };
    }
    return null;
  }

  function placeCard(b, id, atFront, mid) {
    const head = groupHead(b, id);
    const join = !!head;
    const inFront = atFront || (head && b.frontBatch.has(head));
    if (inFront) b.frontBatch.add(id);
    b.dirty = true;
    if (b.flow === "h") {
      // Sideways, the order alone says where it goes.
      b.placed.set(id, { col: 0, join, shownJoin: join });
      return;
    }
    let col;
    if (head) {
      col = b.placed.get(head).col;
      b.columns[col].splice(b.columns[col].indexOf(head) + 1, 0, id);
      if (inFront) {
        b.frontCount[col]++;
        b.frontHeight[col] += b.heights.get(id) || 0;
      }
    } else {
      const position = mid && midPosition(b, mid);
      if (position) {
        col = position.col;
        b.columns[col].splice(position.at, 0, id);
        // Others replacing cards in the same gap come after this one.
        for (const other of b.mids.values()) if (other !== mid && other.prev === mid.prev && other.next === mid.next) other.prev = id;
      } else if (atFront) {
        col = shortest(b.frontHeight);
        b.columns[col].splice(b.frontCount[col], 0, id);
        b.frontCount[col]++;
        b.frontHeight[col] += b.heights.get(id) || 0;
      } else {
        if (b.columns.some((c) => c.length) || b.bottoms.length) relayout(b);
        col = shortest(b.bottoms);
        b.columns[col].push(id);
      }
    }
    b.placed.set(id, { col, join, shownJoin: join });
    b.dirty = true;
  }

  function lastPlacedIndex(b, list) {
    for (let k = list.length - 1; k >= 0; k--) if (b.placed.has(list[k].id)) return k;
    return -1;
  }

  // Posts new at the top of the list only join the board when the view is near
  // the top; mounting them from further down would mean mounting everything between.
  const farFromTop = (b) => (b.flow === "h" ? b.x > innerWidth : b.y > innerHeight);

  // The card's column is fixed here. Cards are taken strictly in list order, so a
  // card that is still loading holds back the ones after it.
  function placeReady(c) {
    const { S, board: b } = c;
    const list = S.props.list;
    const lastPlaced = lastPlacedIndex(b, list);
    let placedAny = false;
    let frontPending = false;
    let waiting = null;
    let prevPlaced = null;
    rebuildFront(b);
    for (let k = 0; k < list.length; k++) {
      const id = list[k].id;
      if (id === b.barId) continue; // on the board already, and no card is ahead of it or behind
      if (b.placed.has(id)) {
        prevPlaced = id;
        continue;
      }
      if (NOT_A_CARD.test(id)) continue;
      if (MARKER.test(id)) {
        b.skipped.add(id);
        continue;
      }
      const kind = b.kinds.get(id);
      const within = k < lastPlaced;
      const mid = b.mids.get(id) || null;
      const atFront = kind === "front" || (!kind && within && !prevPlaced);
      // Behind cards already placed, it can't hold up the ones after it, and waits for the
      // view to come near (a card back from having no height, say).
      const behind = !!mid || (!kind && within && !atFront);
      if (atFront && farFromTop(b)) {
        frontPending = true; // paused, not finished
        continue;
      }
      if (b.skipped.has(id)) {
        if ((b.heights.get(id) || 0) <= 1) continue;
        b.skipped.delete(id);
      }
      const seen = b.seen.get(id);
      if (!seen || seen.frames < SETTLE_FRAMES) {
        if (behind) continue;
        if (atFront) frontPending = true;
        // Only a card that was asked for can stall; the rest just aren't due yet.
        if (!b.requested.has(id)) break;
        if (b.stallId !== id) {
          b.stallId = id;
          b.stallFrames = 0;
        }
        if (++b.stallFrames < STALL_FRAMES) {
          waiting = id;
          break;
        }
        b.skipped.add(id); // X never rendered it; don't let it hold up the rest
        b.kinds.delete(id);
        b.mids.delete(id);
        continue;
      }
      // A reply waits for what it answers, or they'd end up apart for good.
      const head = groupHead(b, id);
      if (head && !b.placed.has(head)) continue;
      if (seen.h <= 1) {
        b.skipped.add(id);
      } else {
        placeCard(b, id, atFront, mid);
        prevPlaced = id;
        placedAny = true;
      }
      b.kinds.delete(id);
      b.mids.delete(id);
    }
    if (waiting === null) b.stallId = null;
    if (!frontPending) b.frontBatch.clear();
    return placedAny;
  }

  // Re-deals every card when the column count changes. Conversations stay together.
  function changeColumns(b, cols) {
    const seq = b.order.filter((id) => b.placed.has(id));
    b.columns = Array.from({ length: cols }, () => []);
    const bottoms = new Array(cols).fill(0);
    let col = 0;
    for (const id of seq) {
      const p = b.placed.get(id);
      if (!p.join) col = shortest(bottoms);
      p.col = col;
      b.columns[col].push(id);
      const h = b.heights.get(id) || 0;
      if (h > 1) bottoms[col] += h + GAP; // nothing for the bar while X keeps it empty
    }
    b.dirty = true;
  }

  // The first card at or below the top of the view, so a re-deal can come back to it.
  function anchorAt(b, viewTop) {
    if (b.dirty) relayout(b);
    for (const id of b.order) {
      if (b.placed.has(id) && b.tops.get(id) >= viewTop) return { id, offset: b.tops.get(id) - viewTop, frames: 90 };
    }
    return null;
  }

  // The first card in the sideways view, to come back to after a change of layout.
  function anchorSideways(b, viewLeft) {
    if (b.dirty) relayout(b);
    const stride = b.colw + GAP;
    for (const id of b.order) {
      const p = b.placed.get(id);
      if (p && p.col * stride + b.colw > viewLeft) return { id, offset: 0, frames: 90 };
    }
    return null;
  }

  // From the position this board saved: on a tab left in the other layout, what's on
  // screen right now says nothing about where it was.
  function changeFlow(c, b, sideways) {
    const anchor = b.flow === "h" ? anchorSideways(b, b.x) : anchorAt(b, b.y - b.listTop - PAD);
    resetGesture();
    b.flow = sideways ? "h" : "v";
    if (!sideways) b.columns = []; // dealt again below
    b.dirty = true;
    b.restoreFrames = 0;
    b.topFrames = 0;
    if (anchor && b.placed.size) b.anchor = anchor;
    if (!sideways) c.el.scrollLeft = 0;
  }

  // ---- attach -------------------------------------------------------------

  function boardFor(key) {
    if (!boards.has(key)) boards.set(key, newBoard());
    return boards.get(key);
  }

  function attach(S) {
    const vp = S._viewport;
    const el = S._rootRef.current;
    const Rect = vp.getRect().constructor;
    const st = { top: 0, height: 1, k0: -1, k1: -1 };

    const proxy = Object.create(vp);
    proxy.getRect = () => new Rect(el.getBoundingClientRect().top + st.top, st.height);
    proxy.scrollBy = () => {}; // X's corrections are in single-column coordinates
    proxy.scrollTo = (x, y) => {
      if (!y) vp.scrollTo(x, y);
    };
    S._viewport = proxy;

    // "Back to the top" (the new-posts pill, Home, showing new posts) means the first
    // column sideways. Called on the proxy too, which inherits it.
    if (!vp.__xmHooked) {
      vp.__xmHooked = true;
      const toTop = vp.scrollToTop;
      vp.scrollToTop = function (...args) {
        const c = current && current.vp === vp ? current : null;
        if (c && c.board.flow === "h") c.el.scrollLeft = 0;
        const out = toTop.apply(this, args);
        try {
          if (c) wentToTop(c);
        } catch (e) {
          console.error("[x-masonry]", e); // X's own handler goes on either way
        }
        return out;
      };
    }

    let props = S.props;
    const adopt = (p) => {
      try {
        if (p && Array.isArray(p.list)) {
          const out = arrange(boardFor(String(p.cacheKey)), p.list);
          if (out !== p.list) p.list = out;
          // Mount what the rect says, with no extra margin. The rect has its own.
          p.minimumOffscreenToViewportRatio = 0;
          p.preferredOffscreenToViewportRatio = 0;
        }
      } catch {}
      return p;
    };
    adopt(props);
    Object.defineProperty(S, "props", {
      configurable: true,
      enumerable: true,
      get: () => props,
      set: (v) => {
        props = adopt(v);
      },
    });

    el.setAttribute("data-xm-board", "");
    const key = String(S.props.cacheKey);
    const board = boardFor(key);
    board.restoreFrames = board.y > 0 || board.x > 0 ? 40 : 0;
    board.topFrames = 0;
    current = { S, el, vp, st, key, board, attachedAt: performance.now() };
    S._scheduleCriticalUpdate();
  }

  // X sent the view to the start of the list. It goes on to scroll to the first post it
  // has mounted and focus it, placed or not, without waiting for a frame. So the start of
  // the list is asked for now, and every cell is put where the board has it now: a post
  // that just left its place for the top isn't to be found where it was. And the view
  // stays put for a moment whatever X scrolls to.
  function wentToTop(c) {
    const b = c.board;
    const sideways = b.flow === "h";
    if (sideways ? c.el.scrollLeft > 0 : scrollY > 0) return; // still on its way there
    b.restoreFrames = 0;
    b.anchor = null;
    b.topFrames = TOP_FRAMES;
    if (sideways) b.x = 0;
    else b.y = 0;
    quietFrames = 0;
    if (!b.shownCols) return; // no frame has laid it out yet
    if (b.dirty) relayout(b);
    requestForView(c, b.shownCols, c.el.getBoundingClientRect());
    placeCells(c, b.colw);
  }

  function detach() {
    const c = current;
    if (!c) return;
    current = null;
    const { S, el, vp } = c;
    S._viewport = vp;
    const props = S.props;
    Object.defineProperty(S, "props", { configurable: true, enumerable: true, writable: true, value: props });
    el.scrollLeft = 0;
    el.removeAttribute("data-xm-board");
    root.removeAttribute("data-xm-ready");
    for (const cell of el.children) {
      cell.style.translate = "";
      cell.style.maxHeight = "";
      cell.removeAttribute("data-xm-squeezed");
      delete cell.__xm;
      cell.removeAttribute("data-xm-placed");
      cell.removeAttribute("data-xm-join");
    }
    try {
      S._scheduleCriticalUpdate();
    } catch {}
  }

  // ---- per frame ----------------------------------------------------------

  function pickColumns(width) {
    if (cfgCols) return cfgCols;
    return Math.max(1, Math.min(MAX_AUTO_COLS, Math.floor(width / MIN_CARD_WIDTH)));
  }

  function measure(c) {
    const { S, board: b } = c;
    for (const [id, comp] of S._cells) {
      const cell = comp && comp.getElement && comp.getElement();
      if (!cell) continue;
      common.checkCell(cell); // before measuring: a muted card has no height
      // Sideways a card can be held shorter than it is; the layout wants its real height.
      const h = b.flow === "h" ? Math.max(cell.scrollHeight, cell.offsetHeight) : cell.offsetHeight;
      const seen = b.seen.get(id);
      if (seen && seen.h === h) seen.frames++;
      else b.seen.set(id, { h, frames: 0 });
      // Kept on the node: a remounted card is a new node and starts counting again.
      if (h > 1) delete cell.__xmEmptySince;
      else if (!cell.__xmEmptySince) cell.__xmEmptySince = performance.now();
      if (b.placed.has(id)) {
        // A remounted card starts out short for a moment; only believe a settled height.
        // Empty needs longer, but it's real: an ad blocker can hide a card after it's placed.
        const settled = seen && seen.h === h && (h <= 1 ? performance.now() - cell.__xmEmptySince >= VANISH_MS : seen.frames >= SETTLE_FRAMES);
        if (settled && b.heights.get(id) !== h) {
          b.heights.set(id, h);
          b.dirty = true;
        }
      } else {
        b.heights.set(id, h);
      }
    }
  }

  // Which of X's items should be mounted: everything the board shows around the
  // view, plus the next few unplaced ones while a column still needs filling.
  function requestItems(c, y0, y1, fillTo, cols) {
    const { S, st, board: b } = c;
    const list = S.props.list;
    const sideways = b.flow === "h";
    const stride = b.colw + GAP;
    const reached = sideways ? b.columns.length * stride : b.bottoms.length ? Math.min(...b.bottoms) : 0;
    let want = reached < fillTo ? cols * 3 : 0;
    let wantFront = farFromTop(b) ? 0 : cols * 3; // new posts at the top don't depend on column depth
    const lastPlaced = lastPlacedIndex(b, list);
    b.requested.clear();
    let wantMid = cols * 2;
    let prevPlacedId = null;
    const nearView = (id) => {
      const p = id && b.placed.get(id);
      if (!p) return false;
      if (sideways) {
        const x = p.col * stride;
        return x + b.colw >= y0 && x <= y1;
      }
      const t = b.tops.get(id);
      return t + (b.heights.get(id) || 0) >= y0 && t <= y1;
    };
    let k0 = -1;
    let k1 = -1;
    let top = 0;
    let topAtK0 = 0;
    let bottomAtK1 = 0;
    for (let k = 0; k < list.length; k++) {
      const id = list[k].id;
      const h = S._getHeight(list[k]);
      const t = b.tops.get(id);
      let keep = false;
      if (b.placed.has(id)) {
        if (sideways) {
          const x = b.placed.get(id).col * stride;
          keep = x + b.colw >= y0 && x <= y1;
        } else {
          keep = t + (b.heights.get(id) || 0) >= y0 && t <= y1;
        }
      } else if (!NOT_A_CARD.test(id) && !MARKER.test(id) && !(b.skipped.has(id) && (b.heights.get(id) || 0) <= 1)) {
        const kind = b.kinds.get(id);
        const mid = b.mids.get(id);
        const behindCard = !kind && k < lastPlaced && prevPlacedId;
        if (mid || behindCard) {
          if (wantMid > 0 && (mid ? nearView(mid.prev) || nearView(mid.next) : nearView(prevPlacedId))) {
            keep = true;
            wantMid--;
          }
        } else if (kind === "front" || k < lastPlaced) {
          if (wantFront > 0) {
            keep = true;
            wantFront--;
          }
        } else if (want > 0) {
          keep = true;
          want--;
        }
        if (keep) b.requested.add(id);
      }
      if (b.placed.has(id) && id !== b.barId) prevPlacedId = id;
      if (keep) {
        if (k0 < 0) {
          k0 = k;
          topAtK0 = top;
        }
        k1 = k;
        bottomAtK1 = top + h;
      }
      top += h;
    }
    if (k0 < 0) return;
    // A pixel inside the first and last item, so their neighbours stay out. From the very
    // first item it starts a pixel before instead: with no height, as the bar has until X
    // shows it, that item would be left out too.
    const nextTop = k0 === 0 ? topAtK0 - 1 : topAtK0 + 1;
    const nextHeight = Math.max(1, bottomAtK1 - 1 - nextTop);
    // Same items but new coordinates also need a pass, or X keeps mounting by the old ones.
    const shifted = Math.abs(nextTop - st.top) > 1 || Math.abs(nextHeight - st.height) > 1;
    st.top = nextTop;
    st.height = nextHeight;
    if (k0 !== st.k0 || k1 !== st.k1 || shifted) {
      st.k0 = k0;
      st.k1 = k1;
      S._scheduleCriticalUpdate();
    }
  }

  // What the view needs mounted, as it is now.
  function requestForView(c, cols, rect) {
    if (c.board.flow === "h") {
      const left = c.el.scrollLeft;
      const view = c.el.clientWidth;
      const margin = view * KEEP_SCREENS;
      requestItems(c, left - margin, left + view + margin, left + view * (1 + FILL_SCREENS), cols);
    } else {
      const viewTop = -rect.top - PAD;
      const margin = innerHeight * KEEP_SCREENS;
      requestItems(c, viewTop - margin, viewTop + innerHeight + margin, viewTop + innerHeight * (1 + FILL_SCREENS), cols);
    }
  }

  function placeCells(c, colw) {
    const { S, board: b } = c;
    const sideways = b.flow === "h";
    // A card waiting to be placed sits where it's headed: X scrolls to the newest post
    // when it shows new ones, and from the end of the board that would take the view along.
    const parkAt = sideways ? `${b.totalW}px ${PAD}px` : `${PAD}px ${(b.bottoms.length ? Math.min(...b.bottoms) : 0) + PAD}px`;
    const parkFront = `${PAD}px ${PAD}px`;
    for (const [id, comp] of S._cells) {
      const cell = comp && comp.getElement && comp.getElement();
      if (!cell) continue;
      const p = b.placed.get(id);
      if (!p) {
        const at = b.kinds.get(id) === "front" ? parkFront : parkAt;
        if (cell.hasAttribute("data-xm-placed")) cell.removeAttribute("data-xm-placed");
        if (cell.__xm !== at) cell.style.translate = cell.__xm = at;
        continue;
      }
      const v = `${PAD + p.col * (colw + GAP)}px ${PAD + b.tops.get(id)}px`;
      if (cell.__xm !== v) cell.style.translate = cell.__xm = v;
      if (!cell.hasAttribute("data-xm-placed")) cell.setAttribute("data-xm-placed", "");
      const cap = p.capH ? `${p.capH}px` : "";
      if (cell.style.maxHeight !== cap) cell.style.maxHeight = cap;
      // Fades out only while there's more to scroll to.
      const more = !!cap && cell.scrollTop + cell.clientHeight < cell.scrollHeight - 1;
      if (cell.hasAttribute("data-xm-squeezed") !== more) cell.toggleAttribute("data-xm-squeezed", more);
      const join = [p.shownJoin && "prev", b.joinsNext.has(id) && "next"].filter(Boolean).join(" ");
      if ((cell.getAttribute("data-xm-join") || "") !== join) {
        if (join) cell.setAttribute("data-xm-join", join);
        else cell.removeAttribute("data-xm-join");
      }
    }
  }

  // ---- rail controls and tabs ---------------------------------------------

  const ICON_LIST = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M8.5 6h12M8.5 12h12M8.5 18h12"/><path d="M3.8 6h.01M3.8 12h.01M3.8 18h.01" stroke-width="2.6"/></svg>';
  const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

  const ICON_FLOW_V = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="7" height="9" rx="1.5"/><rect x="3.5" y="16" width="7" height="4" rx="1.5"/><rect x="13.5" y="4" width="7" height="4" rx="1.5"/><rect x="13.5" y="11" width="7" height="9" rx="1.5"/></svg>';
  const ICON_FLOW_H = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="6" height="16" rx="1.5"/><rect x="11" y="4" width="6" height="16" rx="1.5"/><path d="M20 8l2 4-2 4"/></svg>';

  function setTabsOpen(open) {
    clearTimeout(tabsCloseTimer);
    tabsCloseTimer = 0;
    if (open) {
      root.setAttribute("data-xm-tabs-open", "");
    } else {
      root.removeAttribute("data-xm-tabs-open");
      tabsClicked = false;
    }
  }

  const setIcon = (button, svg) => {
    const icon = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    button.replaceChildren(document.importNode(icon, true));
  };

  function makeButton(id, label, icon) {
    const b = document.createElement("button");
    b.id = id;
    b.type = "button";
    b.setAttribute("aria-label", label);
    if (icon) setIcon(b, icon);
    return b;
  }

  function placeControls(pc) {
    const header = document.querySelector('header[role="banner"]');
    const logo = header && header.querySelector("h1");
    if (!logo) return;
    // X's rail has no slot for these, so they go at the end of its header and
    // are positioned from the logo. They sit under X's dialogs that way.
    if (!tabsBtn) {
      tabsBtn = makeButton("xm-tabs-btn", "", ICON_LIST);
      tabsBtn.addEventListener("click", () => {
        closePanel();
        setTabsOpen(!root.hasAttribute("data-xm-tabs-open"));
      });
      navBtn = makeButton("xm-nav-btn", "", ICON_CHEVRON);
      navBtn.addEventListener("click", () => {
        navOpen = !navOpen;
        if (navOpen) localStorage.setItem(NAV_KEY, "open");
        else localStorage.removeItem(NAV_KEY);
        quietFrames = 0;
      });
    }
    if (tabsBtn.parentElement !== header) header.append(tabsBtn, navBtn);
    const at = performance.now();
    if (at - flowPlacedAt > 500 || !flowBtn || flowBtn.parentElement !== header) {
      flowPlacedAt = at;
      placeFlowButton(header);
    }
    // React may have rebuilt the rail under an open panel.
    if (panelHref && !(panelLink && panelLink.isConnected)) {
      markLink(header.querySelector(`nav a[href="${CSS.escape(panelHref)}"]`));
    }

    // Below about 1265px X draws its rail without labels, so there is nothing to expand to.
    const canExpand = !!header.querySelector("nav a span");
    toggleAttr("data-xm-nav-can", canExpand);
    setAttr("data-xm-nav", navOpen && canExpand ? "open" : null);

    const r = logo.getBoundingClientRect();
    setVar("--xm-rail", header.offsetWidth + "px");
    setVar("--xm-slot-top", Math.round(r.bottom) + "px");
    setVar("--xm-slot-left", Math.round(r.left + r.width / 2 - 22) + "px");
    setVar("--xm-logo-top", Math.round(r.top) + "px");
    setVar("--xm-logo-left", Math.round(r.left) + "px");
    setVar("--xm-logo-size", Math.round(r.width) + "px");
    const tip = say(navOpen ? "navCollapse" : "navExpand");
    if (navBtn.dataset.tip !== tip) {
      navBtn.dataset.tip = tip;
      navBtn.setAttribute("aria-label", tip);
    }
    const tabsLabel = say("timelines");
    if (tabsBtn.getAttribute("aria-label") !== tabsLabel) tabsBtn.setAttribute("aria-label", tabsLabel);

    // The tab bar only moves if its parts are where they were expected. Otherwise it stays on top.
    const list = pc.querySelector('[role="tablist"]');
    const nav = list && list.closest("nav");
    const box = nav && nav.parentElement && nav.parentElement.parentElement;
    const bar = pc.firstElementChild && pc.firstElementChild.firstElementChild;
    if (box && bar && bar.contains(box) && bar !== box) {
      if (!bar.hasAttribute("data-xm-tabbar")) bar.setAttribute("data-xm-tabbar", "");
      if (!box.hasAttribute("data-xm-tabs")) box.setAttribute("data-xm-tabs", "");
      const selected = list.querySelector('[role="tab"][aria-selected="true"]');
      const name = selected ? selected.innerText.trim() : "";
      if (tabsBtn.title !== name) tabsBtn.title = name;
    }
  }

  // Lives inside X's own topmost floating button (Grok, or chat without it), so it stays
  // right above it wherever X puts it, with no position to work out here. Styled from it.
  function placeFlowButton(header) {
    if (!flowBtn) {
      flowBtn = makeButton("xm-flow-btn", "", "");
      flowBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // it's inside X's button area, and isn't meant to open anything there
        flowSideways = !flowSideways; // until the page reloads; the default is in the settings
        flowPlacedAt = 0;
        quietFrames = 0;
      });
    }
    const home = document.querySelector('[data-testid="GrokDrawer"]') || document.querySelector('[data-testid="chat-drawer-root"]');
    const target = home || header;
    if (flowBtn.parentElement !== target) target.append(flowBtn);
    const label = say(flowSideways ? "flowToVertical" : "flowToSideways");
    if (flowBtn.title !== label) {
      flowBtn.title = label;
      flowBtn.setAttribute("aria-label", label);
      setIcon(flowBtn, flowSideways ? ICON_FLOW_V : ICON_FLOW_H);
    }
    const twin = home && [...home.querySelectorAll("button")].find((e) => e !== flowBtn);
    if (!twin) return;
    const cs = getComputedStyle(twin);
    setVar("--xm-flow-size", twin.offsetWidth + "px");
    setVar("--xm-flow-bg", cs.backgroundColor);
    setVar("--xm-flow-border", cs.border);
    setVar("--xm-flow-shadow", cs.boxShadow);
  }

  // Hovering the icon or the list keeps it open, and so does anything opened from
  // it, like the For you popup (X renders those elsewhere in the page). This listens on the document
  // because X re-renders the tabs.
  function scheduleTabsClose() {
    if (tabsCloseTimer || !root.hasAttribute("data-xm-tabs-open")) return;
    tabsCloseTimer = setTimeout(() => {
      tabsCloseTimer = 0;
      // A popup opened from the list keeps it open; look again once that closes.
      if (tabsClicked && document.querySelector('[role="menu"], [role="dialog"]')) scheduleTabsClose();
      else setTabsOpen(false);
    }, TABS_CLOSE_DELAY);
  }

  addEventListener(
    "pointerover",
    (e) => {
      if (e.pointerType === "touch" || !e.target.closest) return;
      // With the panel open this is a click away, or passing over the icon would cover it.
      if (e.target.closest("#xm-tabs-btn, [data-xm-tabs]")) {
        if (!panelHref) setTabsOpen(true);
      } else {
        scheduleTabsClose();
      }
    },
    { capture: true, passive: true },
  );
  addEventListener(
    "click",
    (e) => {
      if (e.target.closest && e.target.closest("[data-xm-tabs]")) tabsClicked = true;
    },
    { capture: true, passive: true },
  );
  root.addEventListener("pointerleave", scheduleTabsClose, { passive: true });
  addEventListener("blur", scheduleTabsClose);

  // ---- the browser's back and forward buttons --------------------------------

  const overlayShowing = () => !!panelHref || root.hasAttribute("data-xm-post-open");

  function moveInHistory(delta) {
    backGuardMoves++;
    history.go(delta);
  }

  // While a panel or the post window shows, the buttons work on it. A page can't cancel them,
  // so the tab's history gets an entry either side of the one in use, and arriving on one of
  // those means the button was pressed. Called whenever the overlays change. The entries are
  // copies of the feed's, in case they ever reach X, and left forward of it afterwards they
  // do nothing.
  function syncBackGuard() {
    if (backGuardMoves) return; // comes back here when that lands
    const showing = overlayShowing();
    if (showing && !backGuardOn) {
      backGuardOn = true;
      history.pushState({ ...history.state, xmGuard: "middle" }, "");
      history.pushState({ ...history.state, xmGuard: "forward" }, "");
      moveInHistory(-1);
    } else if (!showing && backGuardOn) {
      backGuardOn = false;
      // Unless X went somewhere itself, which already took us off them.
      if (history.state && history.state.xmGuard === "middle") moveInHistory(-1);
    }
  }

  // Registered before X's router, so what's meant for the overlay never reaches it.
  addEventListener("popstate", (e) => {
    if (backGuardMoves) {
      backGuardMoves--;
      e.stopImmediatePropagation();
      syncBackGuard();
    } else if (backGuardOn) {
      e.stopImmediatePropagation();
      const delta = history.state && history.state.xmGuard === "forward" ? 1 : -1;
      moveInHistory(-delta);
      overlayGo(delta);
    }
  });

  // Through the page's own history, then back out of it: past its first page closes it.
  function overlayGo(delta) {
    const frame = root.hasAttribute("data-xm-post-open") ? postFrame : panelFrames.get(panelHref);
    let pages = null;
    try {
      pages = frame.contentWindow.__xmFrameHistory;
    } catch {}
    if (pages && pages.canGo(delta)) pages.go(delta);
    else if (delta < 0) closeTopmost();
  }

  // ---- panel contents ---------------------------------------------------------

  // Whether a page hidden since then should start over rather than come back as it was.
  function expired(hiddenAt) {
    const minutes = common.settings().panelKeep;
    return !!minutes && !!hiddenAt && Date.now() - hiddenAt >= minutes * 60000;
  }

  // ---- side panel ----------------------------------------------------------

  // The rail's links open as a sheet over the feed, which stays mounted underneath.
  // Each page is its own iframe and stays alive when hidden, so its icon brings it
  // back as it was. frame-rules.json lets x.com frame itself; nothing else can.
  function buildPanel() {
    if (panelEl && panelEl.isConnected) return;
    panelEl = document.createElement("div");
    panelEl.id = "xm-panel";
    panelScrim = document.createElement("div");
    panelScrim.id = "xm-panel-scrim";
    panelScrim.addEventListener("click", closePanel);
    document.body.append(panelEl, panelScrim);
  }

  // A hidden page keeps its state but shouldn't keep playing.
  function pauseMedia(frame) {
    try {
      for (const m of frame.contentDocument.querySelectorAll("video, audio")) m.pause();
    } catch {}
  }

  const panelEntryUrl = (href) => `${PANEL_ENTRY}?xm-panel=${encodeURIComponent(href)}`;

  // Set by panel-frame.js. Chrome makes a refused frame unreadable, Safari leaves it blank.
  function frameIsOurs(frame) {
    try {
      const page = frame.contentDocument.documentElement;
      return page.hasAttribute("data-xm-panel") || page.hasAttribute("data-xm-entry");
    } catch {
      return false;
    }
  }

  // A page in the panel that reloads itself goes back through the service worker and is
  // refused, which shows up as a frame we can't read. Enter again, but don't keep trying.
  function recoverFrame(frame) {
    frame.__xmLoaded = true;
    if (frameIsOurs(frame)) return;
    const now = performance.now();
    if (now - (frame.__xmRetriedAt || -Infinity) < PANEL_RETRY_MS) return;
    frame.__xmRetriedAt = now;
    frame.src = panelEntryUrl(frame.dataset.xmHref);
  }

  function markLink(link) {
    if (panelLink) panelLink.removeAttribute("data-xm-active");
    panelLink = link;
    if (link) link.setAttribute("data-xm-active", "");
  }

  function openPanel(href, link) {
    buildPanel();
    let frame = panelFrames.get(href);
    if (frame) {
      panelFrames.delete(href);
      // Over its time, or it never got a page.
      if (expired(frame.__xmHiddenAt) || (frame.__xmLoaded && !frameIsOurs(frame))) frame.src = panelEntryUrl(href);
    } else {
      frame = document.createElement("iframe");
      frame.setAttribute("sandbox", FRAME_SANDBOX);
      frame.setAttribute("allow", FRAME_ALLOW);
      frame.dataset.xmHref = href;
      frame.src = panelEntryUrl(href);
      frame.addEventListener("load", () => recoverFrame(frame));
      panelEl.append(frame);
    }
    panelFrames.set(href, frame);
    for (const f of panelFrames.values()) {
      if (f !== frame && f.hasAttribute("data-xm-shown")) {
        pauseMedia(f);
        f.__xmHiddenAt = Date.now();
      }
      f.toggleAttribute("data-xm-shown", f === frame);
    }
    for (const [h, f] of panelFrames) {
      if (panelFrames.size <= PANEL_CACHE) break;
      if (f !== frame) {
        f.remove();
        panelFrames.delete(h);
      }
    }
    panelHref = href;
    markLink(link);
    setTabsOpen(false);
    root.setAttribute("data-xm-panel-open", "");
    syncBackGuard();
  }

  // ---- post view -----------------------------------------------------------

  // Clicking a post opens X's own post page in a floating window. One iframe is kept
  // warm and its router is pointed at each post, so only the first open loads a page.
  function buildPost() {
    if (postEl && postEl.isConnected) return;
    postEl = document.createElement("div");
    postEl.id = "xm-post";
    postScrim = document.createElement("div");
    postScrim.id = "xm-post-scrim";
    postScrim.addEventListener("click", closePost);
    document.body.append(postScrim, postEl);
  }

  function postLoaded() {
    clearTimeout(postReadyTimer);
    root.removeAttribute("data-xm-post-loading");
  }

  // Points the warm frame's router at a post. False if the frame can't take it: it was
  // refused, went elsewhere, or hasn't got a page yet.
  function pointPostFrame(href) {
    try {
      const win = postFrame.contentWindow;
      if (win.location.origin !== location.origin || !frameIsOurs(postFrame)) return false;
      if (win.location.pathname !== href) {
        if (win.__xmFrameHistory) win.__xmFrameHistory.forget(); // a new visit has no past
        win.history.replaceState(null, "", href);
        win.dispatchEvent(new win.PopStateEvent("popstate", { state: null }));
      }
      return true;
    } catch {
      return false;
    }
  }

  function postShows(href) {
    try {
      return postFrame.contentWindow.location.pathname === href && frameIsOurs(postFrame);
    } catch {
      return false;
    }
  }

  // Over the side panel if it came from there, so closing it goes back to that page.
  function openPost(href, overPanel) {
    if (!overPanel) closePanel();
    setTabsOpen(false);
    buildPost();
    root.setAttribute("data-xm-post-open", "");
    syncBackGuard();
    const stale = expired(postHiddenAt);
    if (postFrame && href === postHref && postShows(href) && !stale) return;
    postHref = href;
    root.setAttribute("data-xm-post-loading", "");
    clearTimeout(postReadyTimer);
    postReadyTimer = setTimeout(postLoaded, POST_READY_TIMEOUT);
    if (!postFrame) {
      postFrame = document.createElement("iframe");
      postFrame.name = "xm-post";
      postFrame.setAttribute("sandbox", FRAME_SANDBOX);
      postFrame.setAttribute("allow", FRAME_ALLOW);
      postFrame.dataset.xmHref = href;
      postFrame.src = panelEntryUrl(href);
      postFrame.addEventListener("load", () => recoverFrame(postFrame));
      postEl.append(postFrame);
      return;
    }
    postFrame.dataset.xmHref = href;
    if (stale || !pointPostFrame(href)) postFrame.src = panelEntryUrl(href);
  }

  function closePost() {
    resetGesture();
    postLoaded();
    if (postFrame) pauseMedia(postFrame);
    if (root.hasAttribute("data-xm-post-open")) postHiddenAt = Date.now();
    root.removeAttribute("data-xm-post-open");
    syncBackGuard();
  }

  addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data) return;
    const fromPost = postFrame && e.source === postFrame.contentWindow;
    if (e.data.xm === "post-ready") {
      // A message about the post before this one mustn't uncover this one.
      if (fromPost && postHref && postHref.endsWith(`/status/${e.data.id}`)) postLoaded();
      return;
    }
    const fromPanel = [...panelFrames.values()].some((f) => f.contentWindow === e.source);
    if (e.data.xm === "close") {
      if (fromPost || fromPanel) closeTopmost();
    } else if (e.data.xm === "open-post" && fromPanel) {
      const path = common.postPath(e.data.href);
      if (path) openPost(path, true);
    }
  });

  function closeTopmost() {
    if (root.hasAttribute("data-xm-post-open")) closePost();
    else closePanel();
  }

  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
    closeTopmost();
  });

  // A click on a card opens it, the same clicks that would go to the post page.
  addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!current || !t.closest || !root.hasAttribute("data-xm-on")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const path = common.clickedPost(t, "[data-xm-board]");
      if (!path) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openPost(path);
    },
    true,
  );

  function closePanel() {
    const frame = panelHref && panelFrames.get(panelHref);
    if (frame) {
      pauseMedia(frame);
      frame.__xmHiddenAt = Date.now();
    }
    panelHref = null;
    markLink(null);
    root.removeAttribute("data-xm-panel-open");
    syncBackGuard();
  }

  addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!current || !t.closest || !root.hasAttribute("data-xm-on")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab, as usual
      const header = t.closest('header[role="banner"]');
      if (!header || t.closest("#xm-tabs-btn, #xm-nav-btn")) return;
      const link = t.closest("nav a[href]");
      // Home is the feed; everything else in the rail (post, more, account) opens over it.
      if (!link || link.matches('[data-testid="AppTabBar_Home_Link"]')) {
        if (panelHref) {
          closePanel();
          if (link) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        }
        return;
      }
      const href = link.getAttribute("href");
      const opensIn = common.settings().panel;
      // What X opens as a dialog stays over the feed however pages open.
      if (opensIn === "same" || (opensIn === "tab" && OVERLAY_ROUTE.test(href))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (opensIn === "tab") window.open(href, "_blank", "noopener");
      else if (href === panelHref) closePanel();
      else openPanel(href, link);
    },
    true,
  );

  function toggleAttr(name, on) {
    if (on && !root.hasAttribute(name)) root.setAttribute(name, "");
    else if (!on && root.hasAttribute(name)) root.removeAttribute(name);
  }

  function setAttr(name, value) {
    if (value === null) {
      if (root.hasAttribute(name)) root.removeAttribute(name);
    } else if (root.getAttribute(name) !== value) {
      root.setAttribute(name, value);
    }
  }

  function setVar(name, value) {
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }

  function step() {
    const want = shouldLayOut();
    // The give-up timer runs from the last moment a list was attached: switching
    // between For you and Following replaces the list instance.
    if (isHome() && innerWidth >= MIN_WINDOW) {
      if (!homeSince || current) homeSince = performance.now();
    } else if (!current) {
      homeSince = 0;
    }
    if (!want) {
      if (current) detach();
      if (root.hasAttribute("data-xm-on")) root.removeAttribute("data-xm-on");
      if (root.hasAttribute("data-xm-tabs-open")) setTabsOpen(false);
      if (panelHref) closePanel();
      closePost();
      root.removeAttribute("data-xm-ready");
      return;
    }
    if (!root.hasAttribute("data-xm-on")) root.setAttribute("data-xm-on", "");

    const live = liveList();
    if (current && (!current.el.isConnected || (live && live !== current.S))) detach();
    if (!current) {
      if (!live) return;
      attach(live);
    }

    const c = current;
    // Following and For you share a list instance when X reuses it.
    const key = String(c.S.props.cacheKey);
    if (key !== c.key) {
      c.key = key;
      c.board = boardFor(key);
      c.board.restoreFrames = c.board.y > 0 || c.board.x > 0 ? 40 : 0;
      c.st.k0 = c.st.k1 = -1;
      resetGesture();
      if (!c.board.y) scrollTo(0, 0);
      c.el.scrollLeft = c.board.flow === "h" ? c.board.x : 0;
    }
    const b = c.board;
    if (b.lastOut !== c.S.props.list) c.S.props.list = arrange(b, c.S.props.list);

    const pc = c.el.closest('[data-testid="primaryColumn"]');
    placeControls(pc);
    if ((b.flow === "h") !== flowSideways) {
      changeFlow(c, b, flowSideways);
      c.st.k0 = c.st.k1 = -1;
    }
    setAttr("data-xm-flow", flowSideways ? "h" : null);
    const sideways = b.flow === "h";

    const width = pc.getBoundingClientRect().width;
    const cols = pickColumns(width);
    const colw = Math.floor((width - 2 * PAD - (cols - 1) * GAP) / cols);
    if (sideways) {
      const colH = c.el.clientHeight - 2 * PAD;
      if (b.placed.size && b.colH && (b.colw !== colw || b.colH !== colH) && !b.anchor) b.anchor = anchorSideways(b, c.el.scrollLeft);
      if (b.colw !== colw || b.colH !== colH) b.dirty = true;
      b.colH = colH;
      setVar("--xm-colh", colH + "px");
    } else if (b.columns.length !== cols || (b.colw && b.colw !== colw)) {
      const top = c.el.getBoundingClientRect().top;
      if (!b.anchor && b.columns.length && b.y > 0) b.anchor = anchorAt(b, -top - PAD);
      if (b.columns.length !== cols) changeColumns(b, cols);
    }
    b.colw = colw;
    b.shownCols = cols;
    setVar("--xm-colw", colw + "px");

    const now = performance.now();
    if (now - themeAt > 2000) {
      themeAt = now;
      setVar("--xm-stroke", getComputedStyle(pc).borderLeftColor);
      const body = getComputedStyle(document.body);
      setVar("--xm-bg", body.backgroundColor);
      setVar("--xm-fg", body.color);
    }

    const yBefore = b.y;
    const xBefore = b.x;
    measure(c);
    const placedAny = placeReady(c);
    const moved = placedAny || b.dirty;
    if (b.dirty) {
      // Sideways, a height change can send cards to other columns. Whatever else moves,
      // the first card in view stays where it is on screen. Except at the very start,
      // where new posts are meant to push the rest along and show.
      const stride = colw + GAP;
      const firstCol = sideways ? Math.floor(c.el.scrollLeft / stride) : -1;
      const held = sideways && !b.anchor && c.el.scrollLeft > 0 && b.columns[firstCol] ? b.columns[firstCol][0] : null;
      relayout(b);
      const now_ = held && b.placed.get(held);
      if (now_ && now_.col !== firstCol) c.el.scrollLeft += (now_.col - firstCol) * stride;
    }
    setVar("--xm-total", b.total + "px");
    if (sideways) setVar("--xm-total-w", b.totalW + "px");

    if (b.anchor) {
      const top = b.tops.get(b.anchor.id);
      if (sideways) {
        const p = b.placed.get(b.anchor.id);
        if (p) c.el.scrollLeft = p.col * (colw + GAP);
      } else if (top !== undefined) {
        const docTop = c.el.getBoundingClientRect().top + scrollY;
        scrollTo(0, docTop + PAD + top - b.anchor.offset);
      }
      if (top === undefined || --b.anchor.frames <= 0) b.anchor = null;
    }
    // X sent the view to the start. Until the user moves it, nothing takes it away again.
    if (b.topFrames > 0) {
      b.topFrames--;
      if (sideways) {
        if (c.el.scrollLeft > 0) c.el.scrollLeft = 0;
      } else if (scrollY > 0) scrollTo(0, 0);
    }
    const rect = c.el.getBoundingClientRect();
    if (b.restoreFrames > 0) {
      b.restoreFrames--;
      if (sideways) c.el.scrollLeft = b.x;
      else if (b.y > 0) scrollTo(0, b.y);
    }
    if (!OVERLAY_ROUTE.test(location.pathname) && !b.restoreFrames) {
      if (sideways) {
        b.x = c.el.scrollLeft;
      } else {
        b.y = scrollY;
        b.listTop = rect.top + scrollY;
      }
    }

    requestForView(c, cols, rect);
    placeCells(c, colw);
    if (!c.el.hasAttribute("data-xm-board")) c.el.setAttribute("data-xm-board", "");
    const cards = b.placed.size - (b.placed.has(b.barId) ? 1 : 0);
    if (cards > 0 || performance.now() - c.attachedAt > READY_TIMEOUT) toggleAttr("data-xm-ready", true);
    const busy = moved || b.y !== yBefore || b.x !== xBefore || b.anchor || b.restoreFrames > 0 || b.topFrames > 0 || b.stallId !== null;
    quietFrames = busy ? 0 : quietFrames + 1;
    errors = 0;
  }

  function frame() {
    requestAnimationFrame(frame);
    if (errors >= 3) return;
    // With nothing moving, the layout pass runs a few times a second. A route
    // change or a scroll always gets it at once.
    frameCount++;
    const b = current && current.board;
    const changed = location.pathname !== lastPath || (b && (b.flow === "h" ? current.el.scrollLeft !== b.x : scrollY !== b.y));
    lastPath = location.pathname;
    if (changed) quietFrames = 0;
    if (quietFrames > IDLE_FRAMES && frameCount % IDLE_EVERY) return;
    try {
      step();
    } catch (e) {
      errors++;
      console.error("[x-masonry]", e);
      quietFrames = 0;
      if (errors >= 3) {
        try {
          detach();
        } catch {}
        closePanel();
        closePost();
        setTabsOpen(false);
        root.removeAttribute("data-xm-on");
      }
    }
  }

  // Alt + - / Alt + = : one column fewer or more. Alt + 0 goes back to automatic.
  addEventListener(
    "keydown",
    (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || !current) return;
      const shown = current.board.shownCols;
      let next;
      if (e.code === "Minus") next = Math.max(1, shown - 1);
      else if (e.code === "Equal") next = Math.min(8, shown + 1);
      else if (e.code === "Digit0") next = 0;
      else return;
      e.preventDefault();
      cfgCols = next;
      quietFrames = 0;
      common.update({ cols: next });
    },
    true,
  );

  // Sideways, the list scrolls itself, and the wheel works anywhere in the window. The
  // direction is decided once per gesture, but not from the first event alone: a swipe
  // often opens with a stray dx=0, dy=-1, and locking onto that would turn the whole swipe
  // into a vertical one, running backwards. So:
  //  - clearly sideways from the first event: entirely native, the smoothest case, and
  //    the small vertical wobble at the end of its inertia can't drag the list about. It
  //    takes more than a pixel to count: choosing native can't be taken back, and it
  //    would leave a vertical swipe with nothing to move.
  //  - otherwise hold the movement until there's enough to tell, then apply it all. Sideways
  //    wins unless vertical clearly dominates, since that's what this list scrolls in.
  //  - a vertical gesture starting on a card too tall for its column scrolls that card.
  addEventListener(
    "wheel",
    (e) => {
      if (!current || current.board.flow !== "h" || e.ctrlKey || !root.hasAttribute("data-xm-on")) return;
      if (root.hasAttribute("data-xm-panel-open") || root.hasAttribute("data-xm-post-open")) return;
      const t = e.target;
      if (!t.closest || t.closest('#layers, [role="dialog"], [data-xm-tabs]')) return;

      const now = performance.now();
      const gap = now - gesture.at;
      // Small steps too far apart to reach a decision still add up, rather than vanishing.
      if (gap > GESTURE_GAP && (gesture.kind || gap > GESTURE_FORGET)) resetGesture();
      gesture.at = now;
      // The browser is already scrolling this natively, whatever the timing suggests.
      // Adding to it by hand is exactly what would run it backwards.
      if (!e.cancelable) {
        gesture.kind = "native";
        return;
      }
      const list = current.el;
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? list.clientWidth : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;

      if (!gesture.kind) {
        const first = !gesture.dx && !gesture.dy;
        if (first && Math.abs(dx) >= NATIVE_MIN_DX && Math.abs(dx) * SIDEWAYS_BIAS >= Math.abs(dy) && t.closest("[data-xm-board]")) {
          gesture.kind = "native";
          return;
        }
        // Prevented from the start, or the browser wouldn't let this be prevented later.
        e.preventDefault();
        gesture.dx += dx;
        gesture.dy += dy;
        if (Math.abs(gesture.dx) + Math.abs(gesture.dy) < GESTURE_DEADZONE) return;
        if (Math.abs(gesture.dx) * SIDEWAYS_BIAS >= Math.abs(gesture.dy)) {
          gesture.kind = "x";
          list.scrollLeft += gesture.dx;
          return;
        }
        const cell = t.closest("[data-xm-placed]");
        const room = cell && cell.scrollHeight > cell.clientHeight + 1 && (gesture.dy > 0 ? cell.scrollTop + cell.clientHeight < cell.scrollHeight - 1 : cell.scrollTop > 0);
        if (room) {
          gesture.kind = "card";
          gesture.cell = cell;
          cell.scrollTop += gesture.dy;
        } else {
          gesture.kind = "y";
          list.scrollLeft += gesture.dy;
        }
        return;
      }
      if (gesture.kind === "native") return;
      e.preventDefault();
      if (gesture.kind === "x") list.scrollLeft += dx;
      else if (gesture.kind === "y") list.scrollLeft += dy;
      else if (gesture.cell && gesture.cell.isConnected) gesture.cell.scrollTop += dy;
    },
    { capture: true, passive: false },
  );

  // Don't fight the user while putting the view back.
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) {
    addEventListener(
      type,
      () => {
        if (current) {
          current.board.restoreFrames = 0;
          current.board.topFrames = 0;
          current.board.anchor = null;
        }
      },
      { capture: true, passive: true },
    );
  }

  // At document_start, so X's single-column page never gets a first paint.
  if (isHome() && (innerWidth === 0 || innerWidth >= MIN_WINDOW)) {
    root.setAttribute("data-xm-on", "");
    homeSince = performance.now();
    if (navOpen && innerWidth >= NAV_LABELS_MIN_WINDOW) root.setAttribute("data-xm-nav", "open");
    if (flowSideways) root.setAttribute("data-xm-flow", "h");
  }

  requestAnimationFrame(frame);
})();
