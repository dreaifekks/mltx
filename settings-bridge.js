// Runs in every x.com frame, in the extension's own world, the only one that can reach its
// storage. Copies the settings to localStorage for common.js and tells it when they change.
(() => {
  if (globalThis.__xmBridge) return; // Safari injects again when a written page gets its element
  globalThis.__xmBridge = true;

  const ext = globalThis.browser ?? globalThis.chrome;
  const KEY = "xm-settings";

  // Every frame announces it, even if another frame's bridge has written the same thing
  // first: localStorage is shared, the event isn't.
  function publish(settings) {
    try {
      const text = JSON.stringify(settings);
      if (localStorage.getItem(KEY) !== text) localStorage.setItem(KEY, text);
      dispatchEvent(new Event("xm-settings"));
    } catch {}
  }

  ext.storage.local.get(["settings", "seenVersion"]).then(({ settings, seenVersion }) => {
    if (settings) return publish(settings);
    if (window !== window.top) return;
    // First run: what the old flow switch and column keys had stored becomes the default.
    const oldFlow = localStorage.getItem("xm-flow");
    const oldCols = localStorage.getItem("xm-cols");
    const cols = parseInt(oldCols || "", 10);
    const seed = { flow: oldFlow === "h" ? "h" : "v", cols: cols >= 1 && cols <= 8 ? cols : 0 };
    publish(seed);
    const patch = { settings: seed };
    if (!seenVersion && oldFlow === null && oldCols === null) patch.seenVersion = ext.runtime.getManifest().version;
    ext.storage.local.set(patch);
    localStorage.removeItem("xm-flow");
    localStorage.removeItem("xm-cols");
  });

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings && changes.settings.newValue) publish(changes.settings.newValue);
  });

  // A setting changed from the page itself, by Alt + - and =.
  addEventListener("xm-settings-write", () => {
    try {
      ext.storage.local.set({ settings: JSON.parse(localStorage.getItem(KEY)) });
    } catch {}
  });
})();
