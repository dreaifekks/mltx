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
// X's post page splits into two panes. On the left the post scrolls on its own, with the
// action bar and reply box pinned below it. On the right the sort button heads the
// replies and scrolls away with them. The post, action bar, reply box and sort button
// all live in one list cell, so that cell becomes the left pane and the others are placed
// with position: fixed. Everything else stays in X's list, in the page's own scroll.
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
  let focalId = null; // the post currently taken out of the list's flow
  let wanted = null; // the post the address asks for
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
      // Just this one item, on top of the replies' own window: widening the window to
      // reach it would mount every reply in between.
      const at = out.allItemsWithPositions.findIndex((x) => x.itemId === focalId);
      if (at >= 0 && (at < out.slice.start || at >= out.slice.end)) {
        out.newRenderedItems = [out.allItemsWithPositions[at], ...out.newRenderedItems];
      }
      return out;
    };
    return true;
  }

  const MARKS = ["data-xm-focal", "data-xm-actions", "data-xm-composer", "data-xm-sort"];
  let marked = [null, null, null, null];

  function setMarks(next) {
    next.forEach((el, i) => {
      if (marked[i] === el) return;
      if (marked[i]) marked[i].removeAttribute(MARKS[i]);
      if (el) el.setAttribute(MARKS[i], "");
    });
    marked = next;
  }

  function setVar(name, value) {
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }

  // Back to X's plain page: its route has no post, or the post isn't laid out as expected.
  function standDown(S) {
    setMarks([null, null, null, null]);
    root.removeAttribute("data-xm-post");
    if (focalId) {
      focalId = null;
      if (S) S._scheduleCriticalUpdate();
    }
  }

  // The sort button's row: the menu button after the action bar, in its own wrapper.
  function findSortRow(article, actions) {
    const buttons = [...article.querySelectorAll('button[aria-haspopup="menu"]')];
    const button = buttons.find((b) => !actions.contains(b) && actions.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!button) return null;
    let row = button;
    while (row.parentElement && !row.parentElement.contains(actions) && !row.parentElement.querySelector("time")) row = row.parentElement;
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
    if (!S || !patch(S)) return standDown(null);
    if (!match) {
      wanted = null; // coming back to the same post has to count as new
      return standDown(S);
    }

    const id = `tweet-${match[1]}`;
    if (id !== wanted) {
      wanted = id;
      readyFor = null;
      standDown(S);
    }
    const comp = S._cells.get(id);
    const cell = comp && comp.getElement && comp.getElement();
    const actions = cell && [...cell.querySelectorAll('[role="group"]')].find((g) => g.querySelector('[data-testid="reply"]'));
    if (!actions) {
      // Keep asking X to mount it, but as a normal cell until it's there.
      return standDown(S);
    }

    // The reply box's outermost wrapper that isn't also around the post.
    let box = cell.querySelector('[data-testid="tweetTextarea_0"]');
    while (box && box.parentElement !== cell && !box.parentElement.querySelector("article")) box = box.parentElement;
    if (box === cell) box = null;

    if (focalId !== id) {
      focalId = id;
      S._scheduleCriticalUpdate();
    }
    const article = cell.querySelector("article");
    const sort = article && findSortRow(article, actions);
    setMarks([cell, actions, box, sort]);
    if (!root.hasAttribute("data-xm-post")) root.setAttribute("data-xm-post", "");
    followScroll();
    const boxHeight = box ? box.offsetHeight : 0;
    setVar("--xm-composer-height", `${boxHeight}px`);
    setVar("--xm-left-bottom", `${actions.offsetHeight + boxHeight}px`);
    setVar("--xm-right-top", `${sort ? sort.offsetHeight : 0}px`);
    setVar("--xm-canvas", getComputedStyle(document.body).backgroundColor);

    if (readyFor !== id && cell.offsetHeight > 0) {
      readyFor = id;
      window.top.postMessage({ xm: "post-ready", id: match[1] }, location.origin);
    }
  }

  setInterval(tick, 80);
}
