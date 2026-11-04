// Runs in every x.com frame, in the page's own world. Inside the side panel's iframe
// it marks the page so panel-frame.css can drop X's rail and right column.
//
// It also keeps the panel out of the tab's history. A frame's navigation lands in the
// same back/forward list as the feed, so a hidden panel would swallow the back button.
// Here the frame's router gets a private stack instead: its own back arrow still works,
// and the browser's back button belongs to the feed.
if (window !== window.top) {
  const replace = History.prototype.replaceState;

  // The panel loads every page through a route X's service worker leaves alone, and
  // the address changes to the real page here, before X reads it. See PANEL_ENTRY in
  // masonry.js.
  const X_ENTRY = "/i/history";
  const WRITTEN_ENTRY = "/robots.txt";
  const ENTRY = navigator.vendor.startsWith("Apple") ? WRITTEN_ENTRY : X_ENTRY; // PANEL_ENTRY in masonry.js
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

  // Safari keeps X-Frame-Options whatever frame-rules.json says, so X's pages can't load
  // in a frame there. robots.txt can, and fetch isn't subject to the header, so X's page
  // is fetched and written into this document. The header's CSP goes along as a meta tag,
  // so X's nonces still apply and the page keeps its own limits.
  function writeEntryPage(triesLeft = 3) {
    const root = document.documentElement;
    root.setAttribute("data-xm-entry", ""); // loading, so masonry.js leaves it alone
    root.style.display = "none"; // not the text of robots.txt
    fetch(X_ENTRY, { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status);
        return { html: await response.text(), csp: response.headers.get("content-security-policy") };
      })
      .then(writePage, () => {
        if (triesLeft > 1) setTimeout(() => writeEntryPage(triesLeft - 1), 2000);
        else root.removeAttribute("data-xm-entry"); // the next open starts over
      });
  }

  // X takes its theme from the night_mode cookie, or failing that the system's setting.
  // The page belongs to the feed behind it, so both give the feed's theme here. Returns
  // the feed's background, or nothing if the feed has no theme yet.
  function followFeedTheme() {
    const feed = window.top.document;
    const scheme = feed.documentElement.style.colorScheme;
    if (scheme !== "dark" && scheme !== "light") return "";

    // Until X writes another theme, which makes it the user's own choice.
    let following = true;
    const shown = scheme === "dark" ? "2" : "0";

    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        const real = cookie.get.call(document);
        if (!following) return real;
        return [...real.split("; ").filter((c) => c && !c.startsWith("night_mode=")), `night_mode=${shown}`].join("; ");
      },
      // X moves the cookie to the parent domain by clearing it and writing back what it
      // read, which would pin the theme for someone following the system's setting. So a
      // repeat is dropped and a clear goes through, and neither ends the following.
      set(value) {
        const written = /^\s*night_mode=([^;]*)(.*)$/.exec(value);
        if (following && written) {
          const clears = !written[1] || /;\s*max-age=\s*(0|-)/i.test(written[2]) || Date.parse(/;\s*expires=([^;]*)/i.exec(written[2])?.[1]) <= Date.now();
          if (!clears) {
            if (written[1] === shown) return;
            following = false;
          }
        }
        cookie.set.call(document, value);
      },
    });

    const matchMedia = window.matchMedia;
    window.matchMedia = (query) => {
      const list = matchMedia.call(window, query);
      const asked = /^\(\s*prefers-color-scheme:\s*(dark|light)\s*\)$/.exec(String(query).trim());
      if (!asked) return list;
      return new Proxy(list, {
        get(target, key) {
          if (key === "matches" && following) return asked[1] === scheme;
          const value = target[key];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    };

    return window.top.getComputedStyle(feed.body).backgroundColor;
  }

  function writePage({ html, csp }) {
    // The post window may have been pointed at another post in the meantime.
    const pointed = location.pathname === WRITTEN_ENTRY ? sameSiteAddress(target) || X_ENTRY : location.pathname + location.search + location.hash;
    replace.call(history, null, "", pointed);

    const opening = /^[\s\S]*?<html\b[^>]*>/i.exec(html)?.[0] || "";
    const rest = html.slice(opening.length);
    const meta = csp ? `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">` : "";
    const hasHead = /<head\b[^>]*>/i.test(rest);
    const background = followFeedTheme();
    let page = hasHead ? rest.replace(/<head\b[^>]*>/i, (head) => head + meta) : meta + rest;
    if (background) page = page.replace(/(<body\b[^>]*style="background-color:\s*)[^;"]*/i, (_, start) => start + background);

    // Opening a document clears the window's listeners, and the page's first script
    // runs during the write, so the frame is set up between the two.
    document.open();
    document.write(opening || "<!doctype html><html>");
    startFrame();
    if (background) document.documentElement.style.backgroundColor = background;
    document.write(page);
    document.close();
  }

  if (location.pathname === WRITTEN_ENTRY && target && framedByThisSite()) writeEntryPage();
  else startFrame();

  function startFrame() {
    // Safari injects this file again when a written page gets its document element, into
    // the same window. One set of history shims and one post view, or they fight.
    if (window.__xmFrameStarted) return;
    window.__xmFrameStarted = true;

    document.documentElement.setAttribute("data-xm-panel", "");

    const history = window.history;

    if (location.pathname === X_ENTRY && target) {
      const address = sameSiteAddress(target);
      if (address) replace.call(history, null, "", address); // otherwise stay on the entry page
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

  // Safari leaves a fixed element undrawn when an ancestor clips or scrolls, even though
  // it lays it out in the right place. The bars are inside the post, so there the post
  // can't scroll in its pane: it's moved instead, and slides under the bars.
  const movesPost = navigator.vendor.startsWith("Apple");
  if (movesPost) root.setAttribute("data-xm-moves-post", "");
  let postOffset = 0;

  // False if the post is already as far as it goes that way.
  function movePost(to) {
    const [focal, actions, box] = marked;
    if (!focal || !actions) return false;
    const pane = innerHeight - actions.offsetHeight - (box ? box.offsetHeight : 0);
    const next = Math.round(Math.min(Math.max(0, focal.offsetHeight - pane), Math.max(0, to)));
    if (next === postOffset) return false;
    postOffset = next;
    setVar("--xm-post-offset", `${next}px`);
    return true;
  }

  // As with a scrolling pane, a post with nowhere left to go leaves the wheel to the
  // replies, and so do the bars.
  if (movesPost) {
    addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey || !e.deltaY || !e.target.closest) return;
        if (!e.target.closest("[data-xm-focal]") || e.target.closest("[data-xm-actions], [data-xm-composer]")) return;
        if (movePost(postOffset + e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1))) e.preventDefault();
      },
      { passive: false },
    );
  }

  const MAX_SORT_ROW = 80;
  const MARKS = ["data-xm-focal", "data-xm-actions", "data-xm-composer", "data-xm-sort"];
  let marked = [null, null, null, null];

  // Keeps the left pane's bottom edge with the reply box as it grows, without waiting
  // for the next tick.
  const heights = new ResizeObserver(() => updateHeights());

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
        heights.unobserve(marked[i]);
      }
      if (el) {
        el.setAttribute(MARKS[i], "");
        heights.observe(el);
      }
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
    postOffset = 0;
    root.style.removeProperty("--xm-post-offset");
    if (focalId) {
      focalId = null;
      if (S) S._scheduleCriticalUpdate();
    }
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
    updateHeights();
    if (movesPost) movePost(postOffset); // the post or the bars may have changed height
    setVar("--xm-canvas", getComputedStyle(document.body).backgroundColor);

    if (readyFor !== id && cell.offsetHeight > 0) {
      readyFor = id;
      window.top.postMessage({ xm: "post-ready", id: match[1] }, location.origin);
    }
  }

  setInterval(tick, 80);
}
