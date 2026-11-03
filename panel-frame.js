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
  const behind = []; // entries before the current one

  history.pushState = (state, title, url) => {
    behind.push({ state: history.state, url: location.href });
    replace.call(history, state, title, url);
  };

  const go = (delta) => {
    if (!(delta < 0) || behind.length === 0) return;
    let entry;
    for (let i = 0; i < -delta && behind.length; i++) entry = behind.pop();
    replace.call(history, entry.state, "", entry.url);
    setTimeout(() => dispatchEvent(new PopStateEvent("popstate", { state: entry.state })));
  };

  history.go = go;
  history.back = () => go(-1);
  history.forward = () => {};
}
