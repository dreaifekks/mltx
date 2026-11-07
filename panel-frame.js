// Runs in every x.com frame, in the page's own world. Inside the side panel's iframe
// it marks the page so panel-frame.css can drop X's rail and right column.
//
// It also keeps the panel out of the tab's history. A frame's navigation lands in the
// same back/forward list as the feed, so a hidden panel would swallow the back button.
// Here the frame's router gets a private stack instead: its own back arrow still works,
// and masonry.js points the browser's buttons at this stack while the frame is showing.
if (window !== window.top) {
  const replace = History.prototype.replaceState;

  // The panel loads every page through a route X's service worker leaves alone, and
  // the address changes to the real page here, before X reads it. See PANEL_ENTRY in
  // masonry.js.
  const X_ENTRY = "/i/history";
  const ENTRY = window.__xmPanelEntry || X_ENTRY; // PANEL_ENTRY in masonry.js
  const target = new URLSearchParams(location.search).get("xm-panel");

  // Null unless it's an address on this site.
  const sameSiteAddress = (href) => {
    try {
      const url = new URL(href, location.origin);
      return url.origin === location.origin ? url.pathname + url.search + url.hash : null;
    } catch {
      return null;
    }
  };

  // Every frame above this one is x.com. X-Frame-Options keeps other sites from framing
  // X's pages, and robots.txt doesn't send it, so another site could frame the entry.
  const framedByThisSite = () => {
    try {
      for (let w = window; w !== window.top; w = w.parent) {
        if (w.parent.location.origin !== location.origin) return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  // Only Safari's build has this: it writes X's page in, and starts the frame itself.
  if (!window.__xmWriteEntry?.({ target, sameSiteAddress, framedByThisSite, startFrame })) startFrame();

  function startFrame() {
    // Safari injects this file again when a written page gets its document element, into
    // the same window. One set of history shims and one post view, or they fight.
    if (window.__xmFrameStarted) return;
    window.__xmFrameStarted = true;

    document.documentElement.setAttribute("data-xm-panel", "");
    // A written page has a new document element, without what common.js put on the old one.
    const theme = window.__xmCommon.settings().theme;
    if (theme !== "auto") document.documentElement.setAttribute("data-xm-theme", theme);

    const history = window.history;

    if (location.pathname === X_ENTRY && target) {
      const address = sameSiteAddress(target);
      if (address) replace.call(history, null, "", address); // otherwise stay on the entry page
    }
    const behind = []; // entries before the current one
    const ahead = []; // and after it, nearest last

    history.pushState = (state, title, url) => {
      const entry = { state: history.state, url: location.href };
      replace.call(history, state, title, url); // throws on a bad state or URL, like the original
      behind.push(entry);
      ahead.length = 0;
    };

    // Asynchronous as a whole, like a real traversal, so several in a row stay in order
    // and the event always matches the current location.
    const go = (delta = 0) => {
      const n = Math.trunc(Number(delta)) || 0;
      // A plain reload would hit the service worker again.
      if (n === 0) return location.replace(`${ENTRY}?xm-panel=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
      setTimeout(() => {
        const from = n < 0 ? behind : ahead;
        const to = n < 0 ? ahead : behind;
        if (Math.abs(n) > from.length) return;
        for (let i = Math.abs(n); i > 0; i--) {
          to.push({ state: history.state, url: location.href });
          const entry = from.pop();
          replace.call(history, entry.state, "", entry.url);
        }
        dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
      });
    };

    history.go = go;
    history.back = () => go(-1);
    history.forward = () => go(1);

    // For the browser's own buttons, by way of masonry.js.
    window.__xmFrameHistory = {
      canGo: (delta) => (delta < 0 ? behind : ahead).length > 0,
      go,
      forget() {
        behind.length = 0;
        ahead.length = 0;
      },
    };

    // Esc closes the panel or post view, unless X has a dialog of its own open in here.
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) {
        window.top.postMessage({ xm: "close" }, location.origin);
      }
    });

    if (window.name === "xm-post") {
      startPostView();
    } else if (window.parent === window.top && framedByThisSite()) {
      // A post clicked in the side panel opens in the post window, over this page.
      addEventListener(
        "click",
        (e) => {
          if (!e.target.closest || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          const href = window.__xmCommon.clickedPost(e.target, "");
          if (!href) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          window.top.postMessage({ xm: "open-post", href }, location.origin);
        },
        true,
      );
    }
  }
}

// ---- post view -----------------------------------------------------------------------
//
// X's post page splits into two panes. On the left is the conversation down to the post:
// everything above it in X's list, root first, then the post itself, with the action bar
// and reply box pinned below. On the right the sort button heads the replies and scrolls
// away with them. X's list has the conversation, the post and the replies in that order,
// and the post, action bar, reply box and sort button all live in one cell. So the cells
// on the left and those parts are placed with position: fixed, and everything else stays
// in X's list, in the page's own scroll.
//
// Three things keep the list working around that. The left pane's cells count as zero
// height, so the replies start at the top of the right pane. They stay mounted however far
// the replies scroll. And the pane has no scrolling of its own: the wheel moves its cells,
// sliding them under the bars, because Safari leaves a fixed element undrawn when an
// ancestor clips or scrolls. If X renames any of this the page stays X's normal one column.
function startPostView() {
  const STATUS = /^\/[^/]+\/status\/(\d+)/;
  const CHAIN_TOP = 12; // px above the first post of a conversation
  const PENDING_MS = 3000; // how long to hide a page in between posts if the post doesn't come
  const root = document.documentElement;
  const lists = [];
  let latest = window.scroller;
  if (latest) lists.push(latest);
  let focalId = null; // the post currently taken out of the list's flow
  let chainIds = []; // what's above it in the list, root first
  let pinned = new Set(); // the same, as a lookup
  let chainCells = new Map(); // id -> mounted cell
  let wanted = null; // the post the address asks for
  let readyFor = null;
  let pendingTimer = 0;

  Object.defineProperty(window, "scroller", {
    configurable: true,
    get: () => latest,
    set(v) {
      latest = v;
      if (v && !lists.includes(v)) {
        lists.push(v);
        if (lists.length > 6) lists.shift();
      }
    },
  });

  const liveList = () => {
    for (let i = lists.length - 1; i >= 0; i--) {
      const el = lists[i]._rootRef && lists[i]._rootRef.current;
      if (el && el.isConnected && el.closest('[data-testid="primaryColumn"]')) return lists[i];
    }
    return null;
  };

  const cellOf = (S, id) => {
    const comp = S._cells.get(id);
    return comp && comp.getElement ? comp.getElement() : null;
  };

  // Read when X works out what to mount, so nothing above the post gets a turn in the flow.
  function readChain(S) {
    const list = S.props && S.props.list;
    const at = focalId && Array.isArray(list) ? list.findIndex((item) => item.id === focalId) : -1;
    const next = at > 0 ? list.slice(0, at).map((item) => item.id) : [];
    if (next.length === chainIds.length && next.every((id, i) => id === chainIds[i])) return;
    chainIds = next;
    pinned = new Set(next);
  }

  function patch(S) {
    if (S.__xmPatched) return true;
    if (!S._getHeight || !S._getHeightForItemId || !S._getRenderCandidates || !S._cells) return false;
    S.__xmPatched = true;
    const height = S._getHeight;
    const heightById = S._getHeightForItemId;
    const candidates = S._getRenderCandidates;
    const inLeftPane = (id) => id === focalId || pinned.has(id);
    S._getHeight = (item) => (inLeftPane(item.id) ? 0 : height(item));
    S._getHeightForItemId = (id) => (inLeftPane(id) ? 0 : heightById(id));
    S._getRenderCandidates = (anchor, rect) => {
      readChain(S);
      const out = candidates(anchor, rect);
      // Just these items, on top of the replies' own window: widening the window to reach
      // them would mount every reply in between.
      const extra = out.allItemsWithPositions.filter((x, i) => inLeftPane(x.itemId) && (i < out.slice.start || i >= out.slice.end));
      if (extra.length) out.newRenderedItems = [...extra, ...out.newRenderedItems];
      return out;
    };
    // Before the browser paints a new cell, so it never shows up among the replies.
    const el = S._rootRef && S._rootRef.current;
    if (el) new MutationObserver(tick).observe(el, { childList: true });
    return true;
  }

  // ---- the left pane ---------------------------------------------------------

  let postOffset = 0; // how far the pane's content has moved up
  let hold = null; // { id, at }: keep this post at this height in the pane. None: show the focal post.
  let tops = new Map(); // id -> top in the pane's content
  let bounds = { low: 0, high: 0 };

  const placeAt = (cell, top) => {
    const value = `${top}px`;
    if (cell.style.getPropertyValue("top") !== value) cell.style.setProperty("top", value, "important");
  };

  function placeLeft() {
    if (marked[0]) placeAt(marked[0], tops.get(focalId) - postOffset);
    for (const [id, cell] of chainCells) if (tops.has(id)) placeAt(cell, tops.get(id) - postOffset);
  }

  // Stacks the pane, then decides where it stands: from the top of the conversation, moved
  // up only as far as it takes to see the whole clicked post, or its start if it's taller
  // than the pane. Once the wheel has moved it, whatever loads above leaves what's in view
  // where it is.
  function layoutLeft() {
    const [focal, actions, box] = marked;
    if (!focal || !actions) return;
    const pane = innerHeight - actions.offsetHeight - (box ? box.offsetHeight : 0);
    const hasChain = chainCells.size > 0;
    const nextTops = new Map();
    let y = hasChain ? CHAIN_TOP : 0;
    for (const id of chainIds) {
      const cell = chainCells.get(id);
      if (!cell) continue;
      nextTops.set(id, y);
      y += cell.offsetHeight;
    }
    nextTops.set(focalId, y);
    tops = nextTops;

    const height = focal.offsetHeight;
    const end = Math.max(0, y + height - pane);
    bounds = { low: 0, high: end };
    const wantedAt = hold && tops.has(hold.id) ? tops.get(hold.id) - hold.at : Math.min(y, end);
    postOffset = Math.min(bounds.high, Math.max(bounds.low, wantedAt));
    placeLeft();
  }

  // False if the pane is already as far as it goes that way.
  function movePost(to) {
    // Not rounded: a slow trackpad sends fractions of a pixel, and they have to add up.
    const next = Math.min(bounds.high, Math.max(bounds.low, to));
    if (next === postOffset) return false;
    postOffset = next;
    hold = { id: focalId, at: tops.get(focalId) - next };
    placeLeft();
    return true;
  }

  // As with a scrolling pane, a post with nowhere left to go leaves the wheel to the replies,
  // and so do the bars.
  addEventListener(
    "wheel",
    (e) => {
      const focal = marked[0];
      if (!focal || e.ctrlKey || !e.deltaY || !e.cancelable || !e.target.closest) return;
      if (e.clientX >= focal.offsetWidth) return;
      if (e.target.closest('[data-xm-actions], [data-xm-composer], [data-xm-sort], #layers, [role="dialog"]')) return;
      if (movePost(postOffset + e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1))) e.preventDefault();
    },
    { passive: false },
  );

  function letGoOf(cell) {
    cell.removeAttribute("data-xm-chain");
    cell.style.removeProperty("top");
    heights.unobserve(cell);
  }

  function markChain(S) {
    const next = new Map();
    for (const id of chainIds) {
      const cell = cellOf(S, id);
      if (cell) next.set(id, cell);
    }
    for (const [id, cell] of chainCells) if (next.get(id) !== cell) letGoOf(cell);
    for (const cell of next.values()) {
      if (cell.hasAttribute("data-xm-chain")) continue;
      cell.setAttribute("data-xm-chain", "");
      heights.observe(cell);
    }
    chainCells = next;
    if (root.hasAttribute("data-xm-has-chain") !== chainIds.length > 0) root.toggleAttribute("data-xm-has-chain", chainIds.length > 0);
  }

  const MAX_SORT_ROW = 80;
  const MARKS = ["data-xm-focal", "data-xm-actions", "data-xm-composer", "data-xm-sort"];
  let marked = [null, null, null, null];
  let spareBars = [];

  // Keeps the pane's parts together as they change, like the reply box growing as you type,
  // without waiting for the next tick.
  const heights = new ResizeObserver(() => {
    updateHeights();
    layoutLeft();
  });

  function updateHeights() {
    const [, actions, box, sort] = marked;
    if (!actions) return;
    const boxHeight = box ? box.offsetHeight : 0;
    setVar("--xm-actions-height", `${actions.offsetHeight}px`);
    setVar("--xm-composer-height", `${boxHeight}px`);
    setVar("--xm-left-bottom", `${actions.offsetHeight + boxHeight}px`);
    setVar("--xm-right-top", `${sort ? sort.offsetHeight : 0}px`);
  }

  function setMarks(next) {
    next.forEach((el, i) => {
      if (marked[i] === el) return;
      if (marked[i]) {
        marked[i].removeAttribute(MARKS[i]);
        if (MARKS[i] === "data-xm-sort") marked[i].style.translate = "";
        if (MARKS[i] === "data-xm-focal") marked[i].style.removeProperty("top");
        heights.unobserve(marked[i]);
      }
      if (el) {
        el.setAttribute(MARKS[i], "");
        heights.observe(el);
      }
    });
    marked = next;
  }

  // With the post's bar pinned, another one would only say the same thing twice.
  function setSpareBars(next) {
    for (const bar of spareBars) if (!next.includes(bar)) bar.removeAttribute("data-xm-spare-bar");
    for (const bar of next) if (!bar.hasAttribute("data-xm-spare-bar")) bar.setAttribute("data-xm-spare-bar", "");
    spareBars = next;
  }

  function setVar(name, value) {
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }

  // Between posts, the page in between has nothing to show, and X's plain layout of the
  // new one would only flash by.
  function setPending(on) {
    clearTimeout(pendingTimer);
    root.toggleAttribute("data-xm-post-pending", on);
    if (on) pendingTimer = setTimeout(() => root.removeAttribute("data-xm-post-pending"), PENDING_MS);
  }

  // Back to X's plain page: its route has no post, or the post isn't laid out as expected.
  function standDown(S) {
    setMarks([null, null, null, null]);
    setSpareBars([]);
    root.removeAttribute("data-xm-post");
    postOffset = 0;
    hold = null;
    const hadAny = focalId || chainIds.length;
    focalId = null;
    readChain({});
    markChain(S || { _cells: new Map() });
    if (hadAny && S) S._scheduleCriticalUpdate();
  }

  // The sort button's row: the menu button after the action bar, in its own wrapper.
  function findSortRow(article, actions) {
    const buttons = [...article.querySelectorAll('button[aria-haspopup="menu"]')];
    const button = buttons.find((b) => !actions.contains(b) && actions.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING && !b.closest('[role="link"]'));
    if (!button) return null;
    let row = button;
    while (row.parentElement && !row.parentElement.contains(actions) && !row.parentElement.querySelector("time")) row = row.parentElement;
    // Only ever a thin row of controls. Anything more stays with the post.
    if (row.offsetHeight > MAX_SORT_ROW || row.querySelector('[data-testid="tweetText"], [data-testid="tweet"], article, img, video, [role="group"]')) return null;
    return row;
  }

  // Fixed, it has to be moved by hand to scroll away with the replies.
  function followScroll() {
    const row = marked[3];
    if (row) row.style.translate = `0 ${-window.scrollY}px`;
  }
  addEventListener("scroll", followScroll, { passive: true });

  function windowClosed() {
    try {
      return !window.top.document.documentElement.hasAttribute("data-xm-post-open");
    } catch {
      return false;
    }
  }

  function tick() {
    if (windowClosed()) return;
    const match = STATUS.exec(location.pathname);
    const S = liveList();
    if (!match) {
      setPending(false);
      wanted = null; // coming back to the same post has to count as new
      return standDown(S && patch(S) ? S : null);
    }

    const id = `tweet-${match[1]}`;
    if (id !== wanted) {
      wanted = id;
      readyFor = null;
      standDown(S && patch(S) ? S : null);
      setPending(true);
    }
    if (!S || !patch(S)) return standDown(null);
    const cell = cellOf(S, id);
    // An article has a second, narrower bar under its title. The post's own is the last.
    const bars = cell ? [...cell.querySelectorAll('[role="group"]')].filter((g) => g.querySelector('[data-testid="reply"]') && !g.closest('[role="link"]')) : [];
    const actions = bars.pop();
    if (!actions) {
      // Keep asking X to mount it, but as a normal cell until it's there.
      return standDown(S);
    }

    // The reply box's outermost wrapper that isn't also around the post.
    let box = cell.querySelector('[data-testid="tweetTextarea_0"]');
    while (box && box.parentElement !== cell && !box.parentElement.querySelector("article")) box = box.parentElement;
    if (box === cell) box = null;

    const before = chainIds.length;
    if (focalId !== id) {
      focalId = id;
      S._scheduleCriticalUpdate();
    }
    readChain(S);
    if (chainIds.length !== before) S._scheduleCriticalUpdate(); // so X mounts them now
    markChain(S);
    const article = cell.querySelector("article");
    const sort = article && findSortRow(article, actions);
    setMarks([cell, actions, box, sort]);
    setSpareBars(bars);
    if (!root.hasAttribute("data-xm-post")) root.setAttribute("data-xm-post", "");
    followScroll();
    updateHeights();
    layoutLeft();
    setVar("--xm-canvas", getComputedStyle(document.body).backgroundColor);
    if (root.hasAttribute("data-xm-post-pending")) setPending(false);

    if (readyFor !== id && cell.offsetHeight > 0) {
      readyFor = id;
      window.top.postMessage({ xm: "post-ready", id: match[1] }, location.origin);
    }
  }

  // A click in the window changes the post right away, before X renders the new page.
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const out = original.apply(this, args);
      tick();
      return out;
    };
  }
  addEventListener("popstate", tick);

  setInterval(tick, 80);
}
