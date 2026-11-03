// Runs in every x.com frame, in the page's own world. Inside the side panel's iframe
// it marks the page so panel-frame.css can drop X's rail and right column.
//
// It also keeps the panel out of the tab's history. A frame's navigation lands in the
// same back/forward list as the feed, so a hidden panel would swallow the back button.
// Here the frame's router gets a private stack instead: its own back arrow still works,
// and the browser's back button belongs to the feed.
if (window !== window.top) {
  document.documentElement.setAttribute("data-xm-panel", "");

  const history = window.history;
  const replace = History.prototype.replaceState;

  // The panel loads every page through a route X's service worker leaves alone, and
  // the address changes to the real page here, before X reads it. See PANEL_ENTRY in
  // masonry.js.
  const ENTRY = "/i/history"; // PANEL_ENTRY in masonry.js
  const target = new URLSearchParams(location.search).get("xm-panel");
  if (target) {
    try {
      const url = new URL(target, location.origin);
      if (url.origin === location.origin) replace.call(history, null, "", url.pathname + url.search + url.hash);
    } catch {
      // Not a usable address: stay on the entry page.
    }
  }
  const behind = []; // entries before the current one

  history.pushState = (state, title, url) => {
    const entry = { state: history.state, url: location.href };
    replace.call(history, state, title, url); // throws on a bad state or URL, like the original
    behind.push(entry);
  };

  // Asynchronous as a whole, like a real traversal, so several in a row stay in order
  // and the event always matches the current location.
  const go = (delta = 0) => {
    const n = Math.trunc(Number(delta)) || 0;
    // A plain reload would hit the service worker again.
    if (n === 0) return location.replace(`${ENTRY}?xm-panel=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
    setTimeout(() => {
      if (n > 0 || -n > behind.length) return;
      const entry = behind.splice(n)[0];
      replace.call(history, entry.state, "", entry.url);
      dispatchEvent(new PopStateEvent("popstate", { state: entry.state }));
    });
  };

  history.go = go;
  history.back = () => go(-1);
  history.forward = () => {};

  // Esc closes the panel or post view, unless X has a dialog of its own open in here.
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) {
      window.top.postMessage({ xm: "close" }, location.origin);
    }
  });

  if (window.name === "xm-post") startPostView();
}

// ---- post view -----------------------------------------------------------------------
//
// X's post page splits into two panes: the post on the left, and on the right its action
// bar, the reply box and the replies. The post, action bar and reply box all live in one
// list cell, so that cell becomes the fixed left pane, with its own scrolling, and the
// other two pin to the right with position: fixed. Everything else stays in X's list.
//
// Two things keep the list working around that. The cell counts as zero height, so the
// replies start at the top of the right pane. And it stays mounted however far the
// replies scroll. If X renames any of this the page simply stays X's normal one column.
function startPostView() {
  const STATUS = /^\/[^/]+\/status\/(\d+)/;
  const root = document.documentElement;
  const lists = [];
  let latest = window.scroller;
  if (latest) lists.push(latest);
  let focalId = null;
  let readyFor = null;

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

  function patch(S) {
    if (S.__xmPatched) return true;
    if (!S._getHeight || !S._getHeightForItemId || !S._getRenderCandidates || !S._cells) return false;
    S.__xmPatched = true;
    const height = S._getHeight;
    const heightById = S._getHeightForItemId;
    const candidates = S._getRenderCandidates;
    S._getHeight = (item) => (item.id === focalId ? 0 : height(item));
    S._getHeightForItemId = (id) => (id === focalId ? 0 : heightById(id));
    S._getRenderCandidates = (anchor, rect) => {
      const out = candidates(anchor, rect);
      const at = out.allItemsWithPositions.findIndex((x) => x.itemId === focalId);
      if (at >= 0 && (at < out.slice.start || at >= out.slice.end)) {
        out.slice = { start: Math.min(at, out.slice.start), end: Math.max(at + 1, out.slice.end) };
        out.newRenderedItems = out.allItemsWithPositions.slice(out.slice.start, out.slice.end);
      }
      return out;
    };
    return true;
  }

  const mark = (el, name) => {
    if (!el.hasAttribute(name)) el.setAttribute(name, "");
  };

  function clearMarks(cell) {
    for (const name of ["data-xm-focal", "data-xm-actions", "data-xm-composer"]) {
      for (const el of document.querySelectorAll(`[${name}]`)) {
        if (name !== "data-xm-focal" || el !== cell) el.removeAttribute(name);
      }
    }
  }

  function tick() {
    const match = STATUS.exec(location.pathname);
    const S = match && liveList();
    if (!S || !patch(S)) {
      root.removeAttribute("data-xm-post");
      return;
    }
    const id = `tweet-${match[1]}`;
    if (id !== focalId) {
      focalId = id;
      readyFor = null;
      clearMarks(null);
      S._scheduleCriticalUpdate();
    }
    const comp = S._cells.get(id);
    const cell = comp && comp.getElement && comp.getElement();
    if (!cell) return;

    const actions = [...cell.querySelectorAll('[role="group"]')].find((g) => g.querySelector('[data-testid="reply"]'));
    if (!actions) return;
    clearMarks(cell);
    mark(cell, "data-xm-focal");
    mark(actions, "data-xm-actions");

    // The reply box's outermost wrapper that isn't also around the post.
    let box = cell.querySelector('[data-testid="tweetTextarea_0"]');
    while (box && box.parentElement !== cell && !box.parentElement.querySelector("article")) box = box.parentElement;
    if (box && box !== cell) mark(box, "data-xm-composer");

    mark(root, "data-xm-post");
    const top = actions.offsetHeight + (box && box !== cell ? box.offsetHeight : 0);
    root.style.setProperty("--xm-right-top", `${top}px`);
    root.style.setProperty("--xm-actions-height", `${actions.offsetHeight}px`);

    if (readyFor !== id && cell.offsetHeight > 0) {
      readyFor = id;
      window.top.postMessage({ xm: "post-ready" }, location.origin);
    }
  }

  setInterval(tick, 60);
}
