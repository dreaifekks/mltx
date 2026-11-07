// Only in the Safari build (scripts/safari-manifest.mjs), right after common.js and ahead of
// the scripts that read what it sets. Other browsers take the route frame-rules.json opens.
(() => {
  const X_ENTRY = "/i/history";
  const WRITTEN_ENTRY = "/robots.txt";
  const replace = History.prototype.replaceState;

  window.__xmPanelEntry = WRITTEN_ENTRY; // PANEL_ENTRY in masonry.js, ENTRY in panel-frame.js

  // Called by panel-frame.js in a frame, with what it shares. True if this frame is taken.
  window.__xmWriteEntry = ({ target, sameSiteAddress, framedByThisSite, startFrame }) => {
    if (location.pathname !== WRITTEN_ENTRY || !target || !framedByThisSite()) return false;
    writeEntryPage();
    return true;

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

    // The page belongs to the feed behind it, so it gets the feed's theme, and until X writes
    // another it stays that way. With a theme set in the settings, common.js has it already.
    // Returns the feed's background, or nothing if the feed has no theme yet.
    function followFeedTheme() {
      const feed = window.top.document;
      const scheme = feed.documentElement.style.colorScheme;
      if (scheme !== "dark" && scheme !== "light") return "";
      if (window.__xmCommon.settings().theme === "auto") window.__xmCommon.pretendTheme(scheme, true);
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
  };
})();
