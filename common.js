// Runs first in every x.com frame, in the page's own world: the settings, what follows from
// them in this frame (theme, muted words), and what a click on a post means.
//
// Settings live in the extension's storage, which this world can't reach. settings-bridge.js
// copies them into localStorage, so they're there synchronously at document_start, and
// fires an event when they change.
(() => {
  // The manifest lists this file ahead of each script that needs it, because only the order
  // within one entry is promised. So the top frame gets it twice, and Safari injects again
  // when a written page gets its element.
  if (window.__xmCommon) return;

  const KEY = "xm-settings";
  const CHANGED = "xm-settings"; // bridge -> page: read them again
  const WRITTEN = "xm-settings-write"; // page -> bridge: store them
  const MUTE_SCAN_MS = 120;
  const FLOWS = ["v", "h"];
  const THEMES = ["auto", "dark", "light"];
  const PANELS = ["sheet", "same", "tab"];
  const LANGS = ["auto", "zh", "en", "ja"]; // auto follows the browser, see i18n.js
  const PANEL_KEEPS = [0, 1, 5, 15, 30, 60]; // minutes; 0 is for as long as it's kept alive
  const NIGHT_MODE = { dark: "2", light: "0" }; // X's values for lights out and default
  const CELL = '[data-testid="cellInnerDiv"]';
  const MUTE_TEXT = '[data-testid="tweetText"], [data-testid="User-Name"], [data-testid="card.wrapper"]';

  const root = document.documentElement;

  function normalize(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    const cols = Number(s.cols);
    const panelKeep = Number(s.panelKeep);
    return {
      flow: FLOWS.includes(s.flow) ? s.flow : "v",
      theme: THEMES.includes(s.theme) ? s.theme : "auto",
      lang: LANGS.includes(s.lang) ? s.lang : "auto",
      panel: PANELS.includes(s.panel) ? s.panel : "sheet",
      panelKeep: PANEL_KEEPS.includes(panelKeep) ? panelKeep : 0,
      cols: Number.isInteger(cols) && cols >= 1 && cols <= 8 ? cols : 0,
      mute: Array.isArray(s.mute) ? s.mute.filter((w) => typeof w === "string" && w.trim()).map((w) => w.trim().toLowerCase()) : [],
    };
  }

  function read() {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) return normalize(JSON.parse(stored));
      // Before the first settings: what the old flow switch and column keys had stored.
      return normalize({ flow: localStorage.getItem("xm-flow"), cols: localStorage.getItem("xm-cols") });
    } catch {
      return normalize(null);
    }
  }

  let settings = read();
  let muteVersion = 0;
  const listeners = [];

  addEventListener(CHANGED, () => {
    const before = settings;
    settings = read();
    if (JSON.stringify(before.mute) !== JSON.stringify(settings.mute)) muteVersion++;
    // X only reads its theme while starting up. Frames go along with the page around them.
    if (before.theme !== settings.theme && window === window.top) return location.reload();
    for (const fn of listeners) fn(settings, before);
  });

  // ---- theme -----------------------------------------------------------------------------

  // X takes its theme from the night_mode cookie, or failing that the system's setting, so
  // this page is shown both saying `scheme`. The real cookie stays as it was. X moves the
  // cookie to the parent domain by clearing it and writing back what it read, which would
  // pin the theme for someone following the system's setting, so a repeat is dropped and a
  // clear goes through. With `yields`, a different value written is the user's own choice
  // and ends the pretending; otherwise it's kept for later and the setting still wins.
  function pretendTheme(scheme, yields) {
    let following = true;
    const shown = NIGHT_MODE[scheme];

    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        const real = cookie.get.call(document);
        if (!following) return real;
        return [...real.split("; ").filter((c) => c && !c.startsWith("night_mode=")), `night_mode=${shown}`].join("; ");
      },
      set(value) {
        const written = /^\s*night_mode=([^;]*)(.*)$/.exec(value);
        if (following && written) {
          const clears = !written[1] || /;\s*max-age=\s*(0|-)/i.test(written[2]) || Date.parse(/;\s*expires=([^;]*)/i.exec(written[2])?.[1]) <= Date.now();
          if (!clears) {
            if (written[1] === shown) return;
            if (yields) following = false;
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
  }

  if (settings.theme !== "auto") {
    pretendTheme(settings.theme, false);
    root.setAttribute("data-xm-theme", settings.theme); // panel-frame.css, until X paints
  }

  // ---- muted words -----------------------------------------------------------------------

  // Hidden by panel-frame.css, which leaves it no height: X's lists and the board both treat
  // that as a card that isn't there. Decided once per version: a card's text doesn't change.
  function checkCell(cell) {
    if (cell.__xmMuteVersion === muteVersion) return;
    if (!settings.mute.length) {
      if (muteVersion === 0) return;
      cell.__xmMuteVersion = muteVersion;
      cell.removeAttribute("data-xm-muted");
      return;
    }
    if (!cell.querySelector("article")) return; // nothing to go by yet
    cell.__xmMuteVersion = muteVersion;
    const text = [...cell.querySelectorAll(MUTE_TEXT)].map((e) => e.textContent).join("\n").toLowerCase();
    cell.toggleAttribute("data-xm-muted", settings.mute.some((w) => text.includes(w)));
  }

  setInterval(() => {
    if (document.hidden || (!settings.mute.length && muteVersion === 0)) return;
    for (const cell of document.querySelectorAll(CELL)) checkCell(cell);
  }, MUTE_SCAN_MS);

  // ---- clicks on posts -------------------------------------------------------------------

  // Parts of a card that do something of their own when clicked.
  const CARD_CONTROLS = 'button, input, textarea, video, [role="button"], [role="menuitem"], [role="slider"], [role="radio"], [role="checkbox"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid^="card."], [data-testid="cardPoll"]';
  const SHOW_MORE = '[data-testid="tweet-text-show-more-link"]';
  const POST_PATH = /^\/[^/]+\/status\/\d+\/?$/;

  // A post's address on this site, or null if the link goes anywhere else: a photo, a
  // profile, another site.
  function postPath(href) {
    try {
      const url = new URL(href, location.origin);
      return /^(?:.+\.)?(?:x|twitter)\.com$/.test(url.hostname) && POST_PATH.test(url.pathname) ? url.pathname : null;
    } catch {
      return null;
    }
  }

  // A quoted post is a div that navigates from its click handler, with no address in the
  // page. React's props for it have one, as a full twitter.com URL.
  function quotedPost(quote) {
    const key = Object.keys(quote).find((k) => k.startsWith("__reactFiber$"));
    let fiber = key && quote[key];
    for (let depth = 0; fiber && depth < 8; depth++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (!props || typeof props !== "object") continue;
      const link = props.link && typeof props.link === "object" ? props.link.pathname : props.link || props.href;
      const path = typeof link === "string" ? postPath(link) : null;
      if (path) return path;
    }
    return null;
  }

  // Which post a click on a page of X's should open, if any, in the same terms X would go
  // there. Buttons, profile links, hashtags and photos keep doing what they do. `scope` is a
  // selector for where cards count.
  function clickedPost(target, scope) {
    const article = target.closest(`${scope} article[data-testid="tweet"]`);
    if (!article) {
      // A conversation's "show more replies" row links to the post page.
      const row = target.closest(`${scope} a[href^="/i/status/"]`);
      return row ? row.getAttribute("href") : null;
    }
    const time = article.querySelector('a[href*="/status/"] time');
    const own = time && time.closest("a");
    if (!own) return null;
    const link = target.closest("a[href]");
    if (link && link !== own) return postPath(link.href);
    if (!target.closest(SHOW_MORE) && (target.closest(CARD_CONTROLS) || String(getSelection()))) return null;
    const quote = target.closest('[role="link"]');
    if (quote && quote !== own && quote !== article && article.contains(quote)) {
      return target.closest('[data-testid="tweetPhoto"]') ? null : quotedPost(quote);
    }
    return own.getAttribute("href");
  }

  Object.defineProperty(window, "__xmCommon", {
    value: {
      settings: () => settings,
      onSettings: (fn) => listeners.push(fn),
      update(patch) {
        settings = normalize({ ...settings, ...patch });
        try {
          localStorage.setItem(KEY, JSON.stringify(settings));
          dispatchEvent(new Event(WRITTEN));
        } catch {}
      },
      checkCell,
      clickedPost,
      postPath,
      pretendTheme,
    },
  });
})();
