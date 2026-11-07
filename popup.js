// The settings behind the toolbar icon. Everything saves as it changes; settings-bridge.js
// passes it on to open x.com pages.
const ext = globalThis.browser ?? globalThis.chrome;
const MUTE_SAVE_DELAY = 500; // ms, so half a word doesn't blank the feed while typing

const muteBox = document.getElementById("mute");
const colsBox = document.getElementById("cols");
const keepBox = document.getElementById("panelKeep");
const langBox = document.getElementById("lang");
const note = document.getElementById("note");

let settings = {};
let muteTimer = 0;

const parseMute = (text) => {
  const seen = new Set();
  return text
    .split(/[\n,，、]+/)
    .map((w) => w.trim())
    .filter((w) => {
      const key = w.toLowerCase();
      if (!w || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

function save(patch) {
  settings = { ...settings, ...patch };
  ext.storage.local.set({ settings });
}

function showTheme(theme) {
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

// Only an edit waiting to be saved. An untouched box says nothing about the words stored.
function flushMute() {
  if (!muteTimer) return;
  clearTimeout(muteTimer);
  muteTimer = 0;
  const mute = parseMute(muteBox.value);
  if (JSON.stringify(mute) !== JSON.stringify(settings.mute || [])) save({ mute });
}

function showLanguage(setting) {
  const lang = globalThis.__xmI18n.resolve(setting);
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = globalThis.__xmI18n.t(lang, el.dataset.i18n);
  muteBox.placeholder = globalThis.__xmI18n.t(lang, "mutePlaceholder");
}

function fill() {
  muteBox.value = (settings.mute || []).join("\n");
  colsBox.value = String(settings.cols || 0);
  keepBox.value = String(settings.panelKeep || 0);
  langBox.value = settings.lang || "auto";
  showLanguage(langBox.value);
  const chosen = { flow: settings.flow || "v", theme: settings.theme || "auto", panel: settings.panel || "sheet" };
  for (const [name, value] of Object.entries(chosen)) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }
  showTheme(chosen.theme);
}

muteBox.addEventListener("input", () => {
  clearTimeout(muteTimer);
  muteTimer = setTimeout(flushMute, MUTE_SAVE_DELAY);
});
muteBox.addEventListener("blur", flushMute);
addEventListener("pagehide", flushMute);

colsBox.addEventListener("change", () => save({ cols: Number(colsBox.value) }));
keepBox.addEventListener("change", () => save({ panelKeep: Number(keepBox.value) }));
langBox.addEventListener("change", () => {
  save({ lang: langBox.value });
  showLanguage(langBox.value);
});

for (const input of document.querySelectorAll('input[type="radio"]')) {
  input.addEventListener("change", () => {
    save({ [input.name]: input.value });
    if (input.name === "theme") {
      showTheme(input.value);
      note.hidden = false;
    }
  });
}

showLanguage("auto"); // until the stored setting arrives
ext.storage.local.get("settings").then((stored) => {
  settings = stored.settings || {};
  fill();
});

// Changed from the page while this is open, by Alt + - and =.
ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings || !changes.settings.newValue) return;
  settings = { ...changes.settings.newValue, mute: settings.mute };
  colsBox.value = String(settings.cols || 0);
});
