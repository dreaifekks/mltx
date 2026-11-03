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
  const TARGET_WIDTH = 500; // used to pick the column count
  const MAX_AUTO_COLS = 4;
  const MIN_WINDOW = 900; // below this the window is too narrow, leave X alone
  const SETTLE_FRAMES = 2; // a height must hold this long before a card is placed
  const KEEP_SCREENS = 0.75; // cards stay mounted this many screens around the view
  const FILL_SCREENS = 2.5; // new cards are placed ahead of the view by this many screens
  const ATTACH_TIMEOUT = 8000; // ms on /home without a list before giving up
  const COLS_KEY = "xm-cols";

  const NOT_A_CARD = /^\$footer$/; // the loading spinner at the end of the list
  const CONVERSATION = /^impressionPlaceholder-home-conversation-(\d+)$/;
  // Modules arrive as several items, e.g. header-who-to-follow-<n>, who-to-follow-<n>-user-<m>.
  const MODULE = /^(?:header-|footer-|\$divider-bottom-)?((?!tweet-|promoted-tweet-|impressionPlaceholder-)[a-zA-Z-]+?-\d{10,})/;
  const OVERLAY_ROUTE = /^\/(compose\/|i\/|[^/]+\/status\/\d+\/(photo|video)\/\d+)/;

  const root = document.documentElement;
  const boards = new Map(); // cacheKey -> board; survives leaving and coming back
  const lists = []; // list instances X has created
  let latestList = window.scroller;
  let current = null; // { S, el, vp, st, board }
  let cfgCols = readCols();
  let homeSince = 0;
  let errors = 0;
  let themeAt = 0;

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
    if (isHome()) return homeSince === 0 || current || performance.now() - homeSince < ATTACH_TIMEOUT;
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
    let changed = false;
    for (const col of board.columns) {
      for (let i = col.length - 1; i >= 0; i--) {
        if (!byId.has(col[i])) {
          board.placed.delete(col[i]);
          col.splice(i, 1);
          changed = true;
        }
      }
    }
    if (changed) board.dirty = true;
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
      group: null, // conversation being placed: { last, col }
      frontStack: [], // how many new-at-the-top cards each column has taken
      y: 0,
      restoreFrames: 0,
    };
  }

  function relayout(b) {
    b.bottoms = b.columns.map((col) => {
      let y = 0;
      col.forEach((id, i) => {
        const p = b.placed.get(id);
        if (i > 0 && !p.join) y += GAP;
        b.tops.set(id, y);
        y += b.heights.get(id) || 0;
      });
      return y;
    });
    b.total = Math.ceil(Math.max(0, ...b.bottoms)) + 2 * PAD;
    b.dirty = false;
  }

  const shortest = (values) => values.reduce((best, v, i) => (v < values[best] ? i : best), 0);

  function placeCard(b, id, atFront) {
    const g = b.group;
    const joined = !!(g && g.col !== null);
    let col;
    if (joined) {
      col = g.col;
    } else if (atFront) {
      col = shortest(b.frontStack);
    } else {
      if (b.dirty) relayout(b);
      col = shortest(b.bottoms);
    }
    if (g) {
      g.col = col;
      if (id === g.last) b.group = null;
    }
    if (atFront) {
      b.columns[col].splice(b.frontStackCount[col], 0, id);
      b.frontStackCount[col]++;
      b.frontStack[col] += b.heights.get(id) || 0;
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
    b.frontStack = b.columns.map(() => 0);
    b.frontStackCount = b.columns.map(() => 0);
    for (let k = 0; k < list.length; k++) {
      const id = list[k].id;
      if (b.placed.has(id) || NOT_A_CARD.test(id)) continue;
      const atFront = k < lastPlaced;
      if (atFront && farFromTop(b)) continue;
      if (b.skipped.has(id)) {
        const h = b.heights.get(id) || 0;
        if (h <= 1) continue;
        b.skipped.delete(id);
      }
      const seen = b.seen.get(id);
      if (!seen || seen.frames < SETTLE_FRAMES) break;
      const m = CONVERSATION.exec(id);
      if (m) b.group = { last: `tweet-${m[1]}`, col: null };
      const mod = MODULE.exec(id);
      if (mod && !(b.group && b.group.module === mod[1])) b.group = { module: mod[1], col: null };
      else if (!mod && b.group && b.group.module) b.group = null;
      if (seen.h <= 1) {
        b.skipped.add(id);
        continue;
      }
      placeCard(b, id, atFront);
    }
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
    b.dirty = true;
  }

  // The first card at or below the top of the view, so a re-deal can come back to it.
  function anchorAt(b, viewTop) {
    if (b.dirty) relayout(b);
    for (const id of b.order) {
      if (b.placed.has(id) && b.tops.get(id) >= viewTop) return { id, offset: b.tops.get(id) - viewTop, frames: 30 };
    }
    return null;
  }

  // ---- attach -------------------------------------------------------------

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
          const key = String(p.cacheKey);
          if (!boards.has(key)) boards.set(key, newBoard());
          const out = arrange(boards.get(key), p.list);
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
    const board = boards.get(key);
    board.restoreFrames = board.y > 0 ? 40 : 0;
    current = { S, el, vp, st, key, board };
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
    for (const cell of el.children) {
      cell.style.translate = "";
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
    return Math.max(1, Math.min(MAX_AUTO_COLS, Math.round(width / TARGET_WIDTH)));
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
      if (b.placed.has(id)) {
        // A remounted card starts out short for a moment; only believe a settled height.
        const settled = seen && seen.h === h && seen.frames >= SETTLE_FRAMES;
        if (settled && h > 0 && b.heights.get(id) !== h) {
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
    const lastPlaced = lastPlacedIndex(b, list);
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
      } else if (want > 0 && !NOT_A_CARD.test(id) && !(k < lastPlaced && farFromTop(b)) && !(b.skipped.has(id) && (b.heights.get(id) || 0) <= 1)) {
        keep = true;
        want--;
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
    st.top = topAtK0 + 1;
    st.height = Math.max(1, bottomAtK1 - topAtK0 - 2);
    if (k0 !== st.k0 || k1 !== st.k1) {
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
      const col = b.columns[p.col];
      const next = col[col.indexOf(id) + 1];
      const join = [p.join && "prev", next && b.placed.get(next).join && "next"].filter(Boolean).join(" ");
      if ((cell.getAttribute("data-xm-join") || "") !== join) {
        if (join) cell.setAttribute("data-xm-join", join);
        else cell.removeAttribute("data-xm-join");
      }
    }
  }

  function setVar(name, value) {
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }

  function step() {
    const want = shouldLayOut();
    // The give-up timer runs from the last moment a list was attached: switching
    // between For you and Following replaces the list instance.
    if (isHome()) {
      if (!homeSince || current) homeSince = performance.now();
    } else if (!current) {
      homeSince = 0;
    }
    if (!want) {
      if (current) detach();
      if (root.hasAttribute("data-xm-on")) root.removeAttribute("data-xm-on");
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
      c.board = boards.get(key);
      c.board.restoreFrames = c.board.y > 0 ? 40 : 0;
      c.st.k0 = c.st.k1 = -1;
      if (!c.board.y) scrollTo(0, 0);
    }
    const b = c.board;
    if (b.lastOut !== c.S.props.list) c.S.props.list = arrange(b, c.S.props.list);

    const pc = c.el.closest('[data-testid="primaryColumn"]');
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
    }

    measure(c);
    placeReady(c);
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
    errors = 0;
  }

  function frame() {
    requestAnimationFrame(frame);
    if (errors >= 3) return;
    try {
      step();
    } catch (e) {
      errors++;
      console.error("[x-masonry]", e);
      if (errors >= 3) {
        try {
          detach();
        } catch {}
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
      if (next) localStorage.setItem(COLS_KEY, String(next));
      else localStorage.removeItem(COLS_KEY);
    },
    true,
  );

  // Don't fight the user while putting the view back.
  for (const type of ["wheel", "touchstart", "keydown"]) {
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

  requestAnimationFrame(frame);
})();
