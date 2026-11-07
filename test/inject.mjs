// Bundles i18n.js + common.js + masonry.js + masonry.css into one expression, for trying a change in an
// already open x.com tab from the console or `opencli browser <session> eval`.
import fs from "node:fs";
const dir = new URL("..", import.meta.url).pathname;
const css = fs.readFileSync(dir + "masonry.css", "utf8");
const js = fs.readFileSync(dir + "i18n.js", "utf8") + ";" + fs.readFileSync(dir + "common.js", "utf8") + ";" + fs.readFileSync(dir + "masonry.js", "utf8");
process.stdout.write(`(()=>{const s=document.createElement('style');s.id='xm-css';s.textContent=${JSON.stringify(css)};document.documentElement.appendChild(s);${js};return {injected:!!window.__xMasonry}})()`);
