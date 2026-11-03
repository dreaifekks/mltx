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
}
