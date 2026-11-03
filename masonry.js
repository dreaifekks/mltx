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
  const COLS_KEY = "xm-cols";
  const NAV_KEY = "xm-nav";
  const READY_TIMEOUT = 3000; // ms after attaching to stop hiding a list with nothing to place
  const NAV_LABELS_MIN_WINDOW = 1265; // X draws its rail labels from about this wide
  const PANEL_CACHE = 3; // side-panel pages kept alive
  // X's service worker answers navigations to /home, /notifications, /explore, /<user> and
  // others from a cached page that says X-Frame-Options: DENY, and that never reaches
  // frame-rules.json. It leaves this route to the network; panel-frame.js then swaps in
  // the real address before X starts.
  const PANEL_ENTRY = "/i/history";
  const PANEL_RETRY_MS = 5000;
  const POST_READY_TIMEOUT = 5000; // ms before showing the post window whatever state it's in
  // No allow-top-navigation, so a stray link can't send the feed away. This isn't an
  // isolation boundary: the frame is x.com's own code, same origin as the page.
  const FRAME_SANDBOX = "allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";
  const FRAME_ALLOW = "autoplay; fullscreen; clipboard-write; encrypted-media";
  const TABS_CLOSE_DELAY = 180; // ms, so moving from the icon to the list doesn't close it

  const NOT_A_CARD = /^\$footer$/; // the loading spinner at the end of the list
  const CONVERSATION = /^impressionPlaceholder-home-conversation-(\d+)$/;
  // Modules arrive as several items, e.g. header-who-to-follow-<n>, who-to-follow-<n>-user-<m>.
  const MODULE = /^(?:header-|footer-|\$divider-bottom-)?((?!tweet-|promoted-tweet-|impressionPlaceholder-)[a-zA-Z-]+?-\d{10,})/;
  // Routes X opens as a dialog over the page. Other /i/ routes (bookmarks...) are full pages.
  const OVERLAY_ROUTE = /^\/(compose\/|i\/(flow|display|keyboard_shortcuts)(\/|$)|[^/]+\/status\/\d+\/(photo|video)\/\d+)/;
  const STALL_FRAMES = 180; // a card that never gets ready stops holding up the rest
  const IDLE_FRAMES = 30; // quiet this long and the layout pass drops to every IDLE_EVERY frames
  const IDLE_EVERY = 6;

  const root = document.documentElement;
  const boards = new Map(); // cacheKey -> board; survives leaving and coming back
  const lists = []; // list instances X has created
  let latestList = window.scroller;
  let current = null; // { S, el, vp, st, board }
  let cfgCols = readCols();
  let homeSince = 0;
  let errors = 0;
  let themeAt = 0;
  let quietFrames = 0;
  let frameCount = 0;
  let lastPath = "";
  let navOpen = localStorage.getItem(NAV_KEY) === "open";
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

  function readCols() {
    const n = parseInt(localStorage.getItem(COLS_KEY) || "", 10);
    return n >= 1 && n <= 8 ? n : 0;
  }

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

  // X moves posts it considers unseen to the end of its list when more load. The
  // board's cards don't care, but the mounted range is a slice of that list, so
  // X's list is kept in first-seen order. New ids stay in X's relative order.
  function arrange(board, list) {
    if (list === board.lastIn || list === board.lastOut) return board.lastOut;
    const known = new Map(board.order.map((id, i) => [id, i]));
    const byId = new Map();
    const front = [];
    const after = new Map();
    let anchor = null;
    let furthest = -1;
    for (const item of list) {
      byId.set(item.id, item);
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
    const next = front;
    for (const id of board.order) {
      if (!byId.has(id)) continue;
      next.push(id);
      if (after.has(id)) next.push(...after.get(id));
    }
    board.order = next;
    const same = next.length === list.length && next.every((id, i) => list[i].id === id);
    board.lastIn = list;
    board.lastOut = same ? list : next.map((id) => byId.get(id));
    forgetDropped(board, byId);
    return board.lastOut;
  }

  function forgetDropped(board, byId) {
    for (const col of board.columns) {
      for (let i = col.length - 1; i >= 0; i--) {
        if (byId.has(col[i])) continue;
        // The card after a dropped conversation head must not glue onto an unrelated card.
        const gone = board.placed.get(col[i]);
        const next = board.placed.get(col[i + 1]);
        if (next && next.join && !gone.join) next.join = false;
        board.placed.delete(col[i]);
        col.splice(i, 1);
        board.dirty = true;
      }
    }
    for (const cache of [board.heights, board.seen, board.tops]) {
      for (const id of cache.keys()) if (!byId.has(id)) cache.delete(id);
    }
    for (const id of board.skipped) if (!byId.has(id)) board.skipped.delete(id);
    const g = board.group;
    if (g && ((g.last && !byId.has(g.last)) || (g.member && !board.placed.has(g.member)))) board.group = null;
  }

  // ---- board --------------------------------------------------------------

  function newBoard() {
    return {
      order: [],
      lastIn: null,
      lastOut: null,
      columns: [], // arrays of ids, top to bottom
      placed: new Map(), // id -> { col, join } for cards on the board
      skipped: new Set(), // zero-height items (placeholders and the like)
      heights: new Map(),
      seen: new Map(), // id -> { h, frames } while waiting to settle
      tops: new Map(),
      bottoms: [],
      total: 0,
      dirty: true,
      group: null, // conversation or module being placed: { last | module, col, member }
      frontBatch: new Set(), // cards of the new-at-the-top batch still being placed
      frontHeight: [], // height the batch has taken in each column, rebuilt from frontBatch
      frontCount: [], // ...and how many cards, which is where the next one goes
      joinsNext: new Set(), // cards whose next card in the column is joined to them
      requested: new Set(), // unplaced cards the board has asked X to mount
      stallId: null,
      stallFrames: 0,
      y: 0,
      restoreFrames: 0,
    };
  }

  function relayout(b) {
    b.joinsNext.clear();
    b.bottoms = b.columns.map((col) => {
      let y = 0;
      col.forEach((id, i) => {
        const p = b.placed.get(id);
        const h = b.heights.get(id) || 0;
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
      let n = 0;
      while (n < col.length && b.frontBatch.has(col[n])) n++;
      return n;
    });
    b.frontHeight = b.columns.map((col, c) => {
      let h = 0;
      for (let i = 0; i < b.frontCount[c]; i++) h += b.heights.get(col[i]) || 0;
      return h;
    });
  }

  const endGroupAt = (b, id) => {
    if (b.group && id === b.group.last) b.group = null;
  };

  function placeCard(b, id, atFront) {
    const g = b.group;
    const joined = !!(g && g.col !== null);
    let col;
    if (joined) {
      col = g.col;
    } else if (atFront) {
      col = shortest(b.frontHeight);
    } else {
      if (b.dirty) relayout(b);
      col = shortest(b.bottoms);
    }
    if (g) {
      g.col = col;
      g.member = id;
    }
    if (atFront) {
      b.columns[col].splice(b.frontCount[col], 0, id);
      b.frontBatch.add(id);
      b.frontCount[col]++;
      b.frontHeight[col] += b.heights.get(id) || 0;
    } else {
      b.columns[col].push(id);
    }
    b.placed.set(id, { col, join: joined });
    b.dirty = true;
  }

  function lastPlacedIndex(b, list) {
    for (let k = list.length - 1; k >= 0; k--) if (b.placed.has(list[k].id)) return k;
    return -1;
  }

  // Posts new at the top of the list only join the board when the view is near
  // the top; mounting them from further down would mean mounting everything between.
  const farFromTop = (b) => b.y > innerHeight;

  // The card's column is fixed here. Cards are taken strictly in list order, so a
  // card that is still loading holds back the ones after it.
  function placeReady(c) {
    const { S, board: b } = c;
    const list = S.props.list;
    const lastPlaced = lastPlacedIndex(b, list);
    let placedAny = false;
    let frontPending = false;
    let waiting = null;
    rebuildFront(b);
    for (let k = 0; k < list.length; k++) {
      const id = list[k].id;
      if (b.placed.has(id) || NOT_A_CARD.test(id)) continue;
      const atFront = k < lastPlaced;
      if (atFront && farFromTop(b)) {
        frontPending = true; // paused, not finished
        continue;
      }
      if (b.skipped.has(id)) {
        if ((b.heights.get(id) || 0) <= 1) {
          endGroupAt(b, id);
          continue;
        }
        b.skipped.delete(id);
      }
      const seen = b.seen.get(id);
      if (!seen || seen.frames < SETTLE_FRAMES) {
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
        endGroupAt(b, id);
        continue;
      }
      const m = CONVERSATION.exec(id);
      if (m) {
        const last = `tweet-${m[1]}`;
        b.group = b.placed.has(last) || b.skipped.has(last) ? null : { last, col: null };
      }
      const mod = MODULE.exec(id);
      if (mod && !(b.group && b.group.module === mod[1])) b.group = { module: mod[1], col: null };
      else if (!mod && b.group && b.group.module) b.group = null;
      if (seen.h <= 1) {
        b.skipped.add(id);
      } else {
        placeCard(b, id, atFront);
        placedAny = true;
      }
      endGroupAt(b, id);
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
      bottoms[col] += (b.heights.get(id) || 0) + GAP;
    }
    const g = b.group;
    if (g && g.member) g.col = b.placed.get(g.member).col;
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
    board.restoreFrames = board.y > 0 ? 40 : 0;
    current = { S, el, vp, st, key, board, attachedAt: performance.now() };
    S._scheduleCriticalUpdate();
  }

  function detach() {
    const c = current;
    if (!c) return;
    current = null;
    const { S, el, vp } = c;
    S._viewport = vp;
    const props = S.props;
    Object.defineProperty(S, "props", { configurable: true, enumerable: true, writable: true, value: props });
    el.removeAttribute("data-xm-board");
    root.removeAttribute("data-xm-ready");
    for (const cell of el.children) {
      cell.style.translate = "";
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
      const h = cell.offsetHeight;
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
    const shortestBottom = b.bottoms.length ? Math.min(...b.bottoms) : 0;
    let want = shortestBottom < fillTo ? cols * 3 : 0;
    let wantFront = farFromTop(b) ? 0 : cols * 3; // new posts at the top don't depend on column depth
    const lastPlaced = lastPlacedIndex(b, list);
    b.requested.clear();
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
        keep = t + (b.heights.get(id) || 0) >= y0 && t <= y1;
      } else if (!NOT_A_CARD.test(id) && !(b.skipped.has(id) && (b.heights.get(id) || 0) <= 1)) {
        if (k < lastPlaced) {
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
    const nextTop = topAtK0 + 1;
    const nextHeight = Math.max(1, bottomAtK1 - topAtK0 - 2);
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

  function placeCells(c, colw) {
    const { S, board: b } = c;
    const parkY = (b.bottoms.length ? Math.min(...b.bottoms) : 0) + PAD;
    for (const [id, comp] of S._cells) {
      const cell = comp && comp.getElement && comp.getElement();
      if (!cell) continue;
      const p = b.placed.get(id);
      if (!p) {
        if (cell.hasAttribute("data-xm-placed")) cell.removeAttribute("data-xm-placed");
        const park = `${PAD}px ${parkY}px`;
        if (cell.__xm !== park) cell.style.translate = cell.__xm = park;
        continue;
      }
      const v = `${PAD + p.col * (colw + GAP)}px ${PAD + b.tops.get(id)}px`;
      if (cell.__xm !== v) cell.style.translate = cell.__xm = v;
      if (!cell.hasAttribute("data-xm-placed")) cell.setAttribute("data-xm-placed", "");
      const join = [p.join && "prev", b.joinsNext.has(id) && "next"].filter(Boolean).join(" ");
      if ((cell.getAttribute("data-xm-join") || "") !== join) {
        if (join) cell.setAttribute("data-xm-join", join);
        else cell.removeAttribute("data-xm-join");
      }
    }
  }

  // ---- rail controls and tabs ---------------------------------------------

  const ICON_LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M8.5 6h12M8.5 12h12M8.5 18h12"/><path d="M3.8 6h.01M3.8 12h.01M3.8 18h.01" stroke-width="2.6"/></svg>';
  const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

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

  function makeButton(id, label, icon) {
    const b = document.createElement("button");
    b.id = id;
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.innerHTML = icon;
    return b;
  }

  function placeControls(pc) {
    const header = document.querySelector('header[role="banner"]');
    const logo = header && header.querySelector("h1");
    if (!logo) return;
    // X's rail has no slot for these, so they go at the end of its header and
    // are positioned from the logo. They sit under X's dialogs that way.
    if (!tabsBtn) {
      tabsBtn = makeButton("xm-tabs-btn", "Timelines", ICON_LIST);
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
    const tip = navOpen ? "收起侧边栏" : "展开侧边栏";
    if (navBtn.dataset.tip !== tip) {
      navBtn.dataset.tip = tip;
      navBtn.setAttribute("aria-label", tip);
    }

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

  // A page in the panel that reloads itself goes back through the service worker and is
  // refused, which shows up as a frame we can't read. Enter again, but don't keep trying.
  function recoverFrame(frame) {
    let readable = false;
    try {
      readable = !!frame.contentWindow.location.href;
    } catch {}
    if (readable) return;
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
      if (f !== frame && f.hasAttribute("data-xm-shown")) pauseMedia(f);
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

  function openPost(href) {
    closePanel();
    setTabsOpen(false);
    buildPost();
    root.setAttribute("data-xm-post-open", "");
    if (href === postHref) return;
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
    const win = postFrame.contentWindow;
    win.history.replaceState(null, "", href);
    win.dispatchEvent(new win.PopStateEvent("popstate", { state: null }));
  }

  function closePost() {
    postLoaded();
    if (postFrame) pauseMedia(postFrame);
    root.removeAttribute("data-xm-post-open");
  }

  addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.xm === "post-ready") postLoaded();
    else if (e.data.xm === "close") {
      closePost();
      closePanel();
    }
  });

  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
    closePost();
    closePanel();
  });

  // A click on a card opens it, the same clicks that would go to the post page. Buttons,
  // profile links, hashtags and photos keep doing what they do.
  addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!current || !t.closest || !root.hasAttribute("data-xm-on")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const article = t.closest('[data-xm-board] article[data-testid="tweet"]');
      if (!article) return;
      const time = article.querySelector('a[href*="/status/"] time');
      const statusLink = time && time.closest("a");
      if (!statusLink) return;
      if (!t.closest('[data-testid="tweet-text-show-more-link"]')) {
        const link = t.closest("a[href]");
        if (link && link !== statusLink) return;
        if (t.closest('button, [role="button"], [role="menuitem"], input, textarea')) return;
        // A quoted post is a link of its own; X goes there.
        const quote = t.closest('[role="link"]');
        if (quote && quote !== article && article.contains(quote)) return;
        if (String(getSelection())) return; // selecting text, not opening
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      openPost(statusLink.getAttribute("href"));
    },
    true,
  );

  function closePanel() {
    if (panelHref && panelFrames.has(panelHref)) pauseMedia(panelFrames.get(panelHref));
    panelHref = null;
    markLink(null);
    root.removeAttribute("data-xm-panel-open");
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
      e.preventDefault();
      e.stopImmediatePropagation();
      const href = link.getAttribute("href");
      if (href === panelHref) closePanel();
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
      c.board.restoreFrames = c.board.y > 0 ? 40 : 0;
      c.st.k0 = c.st.k1 = -1;
      if (!c.board.y) scrollTo(0, 0);
    }
    const b = c.board;
    if (b.lastOut !== c.S.props.list) c.S.props.list = arrange(b, c.S.props.list);

    const pc = c.el.closest('[data-testid="primaryColumn"]');
    placeControls(pc);
    const width = pc.getBoundingClientRect().width;
    const cols = pickColumns(width);
    const colw = Math.floor((width - 2 * PAD - (cols - 1) * GAP) / cols);
    if (b.columns.length !== cols || (b.colw && b.colw !== colw)) {
      const top = c.el.getBoundingClientRect().top;
      if (b.columns.length && b.y > 0) b.anchor = anchorAt(b, -top - PAD);
      if (b.columns.length !== cols) changeColumns(b, cols);
    }
    b.colw = colw;
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
    measure(c);
    const placedAny = placeReady(c);
    const moved = placedAny || b.dirty;
    if (b.dirty) relayout(b);
    setVar("--xm-total", b.total + "px");

    if (b.anchor) {
      const top = b.tops.get(b.anchor.id);
      const docTop = c.el.getBoundingClientRect().top + scrollY;
      if (top !== undefined) scrollTo(0, docTop + PAD + top - b.anchor.offset);
      if (top === undefined || --b.anchor.frames <= 0) b.anchor = null;
    }
    const rect = c.el.getBoundingClientRect();
    if (b.restoreFrames > 0) {
      b.restoreFrames--;
      if (b.y > 0) scrollTo(0, b.y);
    }
    if (!OVERLAY_ROUTE.test(location.pathname) && !b.restoreFrames) b.y = scrollY;

    const viewTop = -rect.top - PAD;
    const margin = innerHeight * KEEP_SCREENS;
    requestItems(c, viewTop - margin, viewTop + innerHeight + margin, viewTop + innerHeight * (1 + FILL_SCREENS), cols);
    placeCells(c, colw);
    if (!c.el.hasAttribute("data-xm-board")) c.el.setAttribute("data-xm-board", "");
    if (b.placed.size > 0 || performance.now() - c.attachedAt > READY_TIMEOUT) toggleAttr("data-xm-ready", true);
    const busy = moved || b.y !== yBefore || b.anchor || b.restoreFrames > 0 || b.stallId !== null;
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
    const changed = location.pathname !== lastPath || (b && scrollY !== b.y);
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
      const shown = current.board.columns.length;
      let next;
      if (e.code === "Minus") next = Math.max(1, shown - 1);
      else if (e.code === "Equal") next = Math.min(8, shown + 1);
      else if (e.code === "Digit0") next = 0;
      else return;
      e.preventDefault();
      cfgCols = next;
      quietFrames = 0;
      if (next) localStorage.setItem(COLS_KEY, String(next));
      else localStorage.removeItem(COLS_KEY);
    },
    true,
  );

  // Don't fight the user while putting the view back.
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) {
    addEventListener(
      type,
      () => {
        if (current) {
          current.board.restoreFrames = 0;
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
  }

  requestAnimationFrame(frame);
})();
