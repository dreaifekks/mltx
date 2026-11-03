// End-to-end check of the extension against a fake x.com, with a real pointer.
// A throwaway Chromium loads the unpacked extension; a local HTTPS server answers as
// x.com (and as a third party) and sends X-Frame-Options: DENY like the real site.
//   npm i --ignore-scripts playwright-core   (anywhere on NODE_PATH)
//   node test/mock-e2e.mjs
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const require = createRequire(process.env.PW_FROM || path.join(process.cwd(), "/"));
const { chromium } = require("playwright-core");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xm-e2e-"));
const ext = new URL("..", import.meta.url).pathname;
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", dir + "/k.pem", "-out", dir + "/c.pem", "-days", "1", "-subj", "/CN=x.com"], { stdio: "ignore" });

const NAV = [["/home", "Home", "主页"], ["/notifications", "Notifications", "通知"], ["/i/chat", "Chat", "聊天"], ["/i/bookmarks", "Bookmarks", "书签"], ["/inkks", "Profile", "资料"]];
const page = (body) => `<!doctype html><html lang="zh"><head><style>body{margin:0;background:#000;color:#e7e9ea;font-family:sans-serif}#bar{position:sticky;top:0;z-index:3;will-change:transform;height:53px}#blur{backdrop-filter:blur(12px)}[data-testid=primaryColumn]{width:600px;border-left:1px solid rgb(47,51,54)}main{display:flex;flex:1}#app{display:flex}header{flex:1;display:flex;justify-content:flex-end}header>div{width:275px}header>div>div{position:fixed;width:275px;height:100vh}nav a{display:block;color:inherit}nav a>div{display:flex;padding:12px}</style>
<script>window.__onAtHead=document.documentElement.hasAttribute('data-xm-on');</script></head><body>${body}</body></html>`;
const rail = `<header role="banner"><div><div><div><h1 style="margin:0;width:52px;height:52px"><a href="/home" aria-label="X">X</a></h1><nav>${NAV.map(([h, id, t]) => `<a href="${h}" data-testid="AppTabBar_${id}_Link"><div><div>●</div><div dir="ltr"><span>${t}</span></div></div></a>`).join("")}</nav><a href="/compose/post" data-testid="SideNav_NewTweet_Button">+</a></div></div></div></header>`;
const tabs = ["为你推荐", "正在关注", "科技", "优质蓝V原创博主"];
const home = page(`<div id="app">${rail}<main><div><div><div data-testid="primaryColumn"><div>
<div id="bar"><div id="blur"><div><div><nav role="navigation"><div style="display:flex"><div data-testid="ScrollSnap-SwipeableList"><div role="tablist" data-testid="ScrollSnap-List" style="display:flex">${tabs.map((t, i) => `<div role="presentation"><a role="tab" aria-selected="${!i}" href="#"><div><div dir="ltr">${t}</div></div></a></div>`).join("")}</div></div></div></nav></div></div></div></div>
<div></div><div id="composer"><div data-testid="tweetTextarea_0">有什么新鲜事</div></div><div style="height:1px"></div>
<div id="tl"><section role="region"><div><div id="root" style="position:relative"></div></div></section></div>
</div></div></div></div><div data-testid="sidebarColumn">right</div></main></div>
<script>
class Rect{constructor(t,h){this._t=t;this._h=h}getTop(){return this._t}getBottom(){return this._t+this._h}getHeight(){return this._h}translateBy(d){return new Rect(this._t+d,this._h)}}
const vp={getRect(){return new Rect(0,innerHeight)},scrollTo(x,y){window.scrollTo(x,y)},scrollBy(){},scrollY(){return window.scrollY}};
class List{constructor(){window.scroller=this;this._viewport=vp;this._rootRef={current:document.getElementById('root')};this._cells=new Map();this.props={cacheKey:'home',list:Array.from({length:60},(_,i)=>({id:'tweet-'+i})),minimumOffscreenToViewportRatio:.5,preferredOffscreenToViewportRatio:2.5};this._h=i=>120+(+i.id.slice(6)*37)%160}
_getHeight(i){return this._h(i)}
_scheduleCriticalUpdate(){requestAnimationFrame(()=>this.u())}
u(){const r=this._viewport.getRect().translateBy(-this._rootRef.current.getBoundingClientRect().top);const lo=r.getTop(),hi=r.getBottom();let y=0;const keep=new Set();for(const it of this.props.list){const h=this._h(it);if(y+h>=lo&&y<=hi){keep.add(it.id);if(!this._cells.has(it.id)){const c=document.createElement('div');c.dataset.testid='cellInnerDiv';c.style.cssText='position:absolute;width:100%;transform:translateY('+y+'px)';c.innerHTML='<article style="height:'+h+'px"><a href="/x/status/1">'+it.id+'</a></article>';this._rootRef.current.append(c);this._cells.set(it.id,{getElement:()=>c})}}y+=h}for(const[id,c]of this._cells)if(!keep.has(id)){c.getElement().remove();this._cells.delete(id)}this._rootRef.current.style.minHeight=y+'px'}}
window.__listDelay=setTimeout(()=>{const l=new List();l.u()},400);
addEventListener('scroll',()=>window.scroller&&window.scroller._scheduleCriticalUpdate());
</script>`);
const inner = (name) => page(`<div id="app">${rail}<main><div><div><div data-testid="primaryColumn"><div id="content" style="height:3000px">${name}</div></div></div></div><div data-testid="sidebarColumn">right</div></main></div><script>window.__topOk=(()=>{try{return window.top!==window}catch{return true}})();window.__loadId=Math.random();</script>`);
const third = `<!doctype html><title>third</title><iframe id="f" src="https://x.com/notifications"></iframe>`;

const hits = [];
const server = https.createServer({ key: fs.readFileSync(dir + "/k.pem"), cert: fs.readFileSync(dir + "/c.pem") }, (req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  const url = req.url.split("?")[0];
  if (host !== "x.com") return res.writeHead(200, { "content-type": "text/html" }).end(third);
  hits.push(url);
  if (url === "/favicon.ico") return res.writeHead(204).end();
  res.writeHead(200, { "content-type": "text/html", "x-frame-options": "DENY" });
  res.end(url === "/home" ? home : inner(url));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === "" ? "" : "  " + JSON.stringify(detail)}`);
};

const ctx = await chromium.launchPersistentContext(dir + "/p", {
  headless: true,
  channel: "chromium",
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--host-resolver-rules=MAP x.com 127.0.0.1:${port},MAP third.test 127.0.0.1:${port}`, "--ignore-certificate-errors"],
});
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.waitForTimeout(800); // let the extension's rules register
await p.goto("https://x.com/home", { waitUntil: "commit" });

// ---- first paint: read styles while the list is still "loading" -----------------
await p.waitForFunction(() => document.getElementById("composer"));
const early = await p.evaluate(() => {
  const cs = (s, k) => getComputedStyle(document.querySelector(s))[k];
  return { onAtHead: window.__onAtHead, list: !!window.scroller, composer: cs("#composer", "display"), bar: cs("#bar", "visibility"), barH: document.getElementById("bar").offsetHeight, side: cs('[data-testid="sidebarColumn"]', "display"), region: cs('section[role="region"]', "visibility"), rail: document.querySelector("header").offsetWidth };
});
check("layout attribute is on before the head finishes parsing", early.onAtHead === true);
check("before the list exists, nothing of X's single column shows", !early.list && early.composer === "none" && early.bar === "hidden" && early.barH === 0 && early.side === "none" && early.region === "hidden" && early.rail === 72, early);

await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
await p.waitForTimeout(400);
check("board is ready and the region shows", await p.evaluate(() => document.documentElement.hasAttribute("data-xm-ready") && getComputedStyle(document.querySelector('section[role="region"]')).visibility === "visible"));
const nCols = await p.evaluate(() => new Set([...document.querySelectorAll("[data-xm-placed]")].map((c) => c.style.translate.split(" ")[0])).size);
check("cards are in columns", nCols === 4, nCols);

// ---- tab list ---------------------------------------------------------------------
const btn = await p.locator("#xm-tabs-btn").boundingBox();
await p.mouse.move(btn.x + 22, btn.y + 22);
await p.waitForTimeout(100);
const fly = await p.evaluate(() => { const b = document.querySelector("[data-xm-tabs]").getBoundingClientRect(); const t = [...document.querySelectorAll("[data-xm-tabs] [role=tab]")].map((e) => e.getBoundingClientRect().height); return { open: document.documentElement.hasAttribute("data-xm-tabs-open"), left: b.left, top: b.top, w: b.width, h: b.height, tabH: t }; });
check("hovering the icon opens a compact list beside the rail", fly.open && fly.left === 76 && fly.w <= 240 && fly.tabH.every((h) => h <= 36), fly);
const tab = await p.locator("[data-xm-tabs] [role=tab]").nth(1).boundingBox();
await p.mouse.move(tab.x + 10, tab.y + 10, { steps: 4 });
await p.waitForTimeout(400);
check("moving onto the list keeps it open", await p.evaluate(() => document.documentElement.hasAttribute("data-xm-tabs-open")));
await p.mouse.move(1000, 500, { steps: 4 });
await p.waitForTimeout(450);
check("moving away closes it", await p.evaluate(() => !document.documentElement.hasAttribute("data-xm-tabs-open")));

// ---- logo: expand / collapse ------------------------------------------------------
const logo = await p.locator("#xm-nav-btn").boundingBox();
const h1 = await p.locator("header h1").boundingBox();
check("the toggle sits exactly on the logo", Math.abs(logo.x - h1.x) < 1 && Math.abs(logo.y - h1.y) < 1 && logo.width === h1.width, { logo, h1 });
const before = await p.evaluate(() => getComputedStyle(document.querySelector("#xm-nav-btn")).opacity);
await p.mouse.move(logo.x + 20, logo.y + 20);
await p.waitForTimeout(100);
const hov = await p.evaluate(() => { const b = document.querySelector("#xm-nav-btn"); return { o: getComputedStyle(b).opacity, tip: b.dataset.tip, after: getComputedStyle(b, "::after").content }; });
check("the logo shows the chevron and a hint on hover", before === "0" && hov.o === "1" && hov.tip === "展开侧边栏" && hov.after.includes("展开"), hov);
await p.mouse.click(logo.x + 20, logo.y + 20);
await p.waitForTimeout(300);
const openNav = await p.evaluate(() => ({ attr: document.documentElement.getAttribute("data-xm-nav"), rail: document.querySelector("header").offsetWidth, path: location.pathname, tip: document.querySelector("#xm-nav-btn").dataset.tip }));
check("clicking it expands the sidebar and doesn't navigate", openNav.attr === "open" && openNav.rail === 260 && openNav.path === "/home" && openNav.tip === "收起侧边栏", openNav);
await p.mouse.click(logo.x + 20, logo.y + 20);
await p.waitForTimeout(300);
check("clicking again collapses it", await p.evaluate(() => document.querySelector("header").offsetWidth === 72 && !localStorage.getItem("xm-nav")));

// ---- side panel -------------------------------------------------------------------
const panelState = () => p.evaluate(() => { const pe = document.querySelector("#xm-panel"); const r = pe && pe.getBoundingClientRect(); const shown = document.querySelector("#xm-panel iframe[data-xm-shown]"); return { open: document.documentElement.hasAttribute("data-xm-panel-open"), rect: r && [r.left, r.width], frames: pe ? pe.querySelectorAll("iframe").length : 0, src: shown && shown.getAttribute("src"), path: location.pathname, active: !!document.querySelector("nav a[data-xm-active]") }; });
const frameOf = (href) => p.frames().find((f) => new URL(f.url()).pathname === href);
const railLink = (t) => p.locator(`[data-testid="AppTabBar_${t}_Link"]`);

await p.evaluate(() => window.scrollTo(0, 900));
await p.waitForTimeout(300);
const yBefore = await p.evaluate(() => window.scrollY);
await railLink("Notifications").click();
await p.waitForTimeout(800);
let s = await panelState();
check("a rail link opens the panel and the page stays on /home", s.open && s.path === "/home" && s.src === "/notifications" && s.rect[0] === 72 && s.rect[1] === 700 && s.active, s);
let f = frameOf("/notifications");
const inFrame = f && (await f.evaluate(() => ({ mark: document.documentElement.hasAttribute("data-xm-panel"), header: getComputedStyle(document.querySelector("header")).display, side: getComputedStyle(document.querySelector('[data-testid="sidebarColumn"]')).display, inFrame: window.__topOk, masonry: window.__xMasonry === undefined })));
check("x.com can frame itself despite X-Frame-Options: DENY", !!f, p.frames().map((x) => x.url()));
check("the framed page drops X's rail and right column, and runs no masonry", inFrame && inFrame.mark && inFrame.header === "none" && inFrame.side === "none" && inFrame.masonry, inFrame);
await f.evaluate(() => { window.scrollTo(0, 700); window.__kept = 42; });

await p.mouse.click(1400, 400);
await p.waitForTimeout(300);
s = await panelState();
check("clicking outside the panel goes back to the feed, scroll kept", !s.open && !s.active && (await p.evaluate(() => window.scrollY)) === yBefore, { s, yBefore });
await railLink("Notifications").click();
await p.waitForTimeout(300);
f = frameOf("/notifications");
const restored = await f.evaluate(() => ({ kept: window.__kept, y: window.scrollY }));
const notifHits = hits.filter((u) => u === "/notifications").length;
check("the icon brings the same page back, not a reload", restored.kept === 42 && restored.y === 700 && notifHits === 1, { restored, notifHits });
await railLink("Notifications").click();
await p.waitForTimeout(200);
check("clicking the active icon closes it", !(await panelState()).open);

// ---- the panel stays out of the tab's history --------------------------------------
await railLink("Notifications").click();
await p.waitForTimeout(250);
const lenBefore = await p.evaluate(() => history.length);
f = frameOf("/notifications");
await f.evaluate(() => { window.__pops = []; addEventListener("popstate", (e) => window.__pops.push(e.state)); history.pushState({ page: "detail" }, "", "/x/status/9"); });
const lenAfter = await p.evaluate(() => history.length);
check("navigating inside the panel adds nothing to the tab's history", lenAfter === lenBefore && f.url().endsWith("/x/status/9"), { lenBefore, lenAfter, url: f.url() });
await f.evaluate(() => history.back());
await p.waitForTimeout(150);
const backed = await f.evaluate(() => ({ path: location.pathname, pops: window.__pops.length }));
check("the panel's own back still works", backed.path === "/notifications" && backed.pops === 1 && (await p.evaluate(() => location.pathname)) === "/home", backed);
await railLink("Notifications").click();
await p.waitForTimeout(150);

// ---- Cmd-click isn't intercepted ----------------------------------------------------
await railLink("Chat").click();
await p.waitForTimeout(250);
const pagesBefore = ctx.pages().length;
await railLink("Home").click({ modifiers: ["Meta"] });
await p.waitForTimeout(400);
const cmd = { pages: ctx.pages().length - pagesBefore, open: (await panelState()).open };
check("Cmd-click on Home opens a new tab and leaves the panel", cmd.pages === 1 && cmd.open, cmd);
for (const extra of ctx.pages().slice(pagesBefore)) await extra.close();
await railLink("Chat").click();
await p.waitForTimeout(150);

for (const t of ["Chat", "Bookmarks", "Profile"]) {
  await railLink(t).click();
  await p.waitForTimeout(350);
}
s = await panelState();
check("only the 3 most recent pages stay alive", s.frames === 3 && s.src === "/inkks" && !frameOf("/notifications"), s);
await railLink("Home").click();
await p.waitForTimeout(200);
s = await panelState();
check("Home closes the panel and stays put", !s.open && s.path === "/home", s);

// the tab icon doesn't pop over an open panel when just passed over
await railLink("Chat").click();
await p.waitForTimeout(300);
await p.mouse.move(btn.x + 22, btn.y + 22);
await p.waitForTimeout(150);
check("passing over the tab icon leaves an open panel alone", await p.evaluate(() => document.documentElement.hasAttribute("data-xm-panel-open") && !document.documentElement.hasAttribute("data-xm-tabs-open")));
await p.mouse.click(btn.x + 22, btn.y + 22);
await p.waitForTimeout(150);
check("clicking the tab icon swaps the panel for the list", await p.evaluate(() => !document.documentElement.hasAttribute("data-xm-panel-open") && document.documentElement.hasAttribute("data-xm-tabs-open")));
await p.mouse.move(1000, 500);
await p.waitForTimeout(400);

// the card's own links still navigate normally
await p.locator('[data-testid="SideNav_NewTweet_Button"]').count();
await p.locator("[data-xm-placed] a").first().click();
await p.waitForTimeout(500);
const off = await p.evaluate(() => ({ path: location.pathname, on: document.documentElement.hasAttribute("data-xm-on"), ready: document.documentElement.hasAttribute("data-xm-ready"), panel: document.documentElement.hasAttribute("data-xm-panel-open") }));
check("other pages turn everything off", off.path === "/x/status/1" && !off.on && !off.ready && !off.panel, off);

// ---- errors fall back to X's own page, with nothing left on top ---------------------
await p.goto("https://x.com/home");
await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
await railLink("Notifications").click();
await p.waitForTimeout(300);
await p.evaluate(() => { window.__err = console.error; console.error = () => {}; window.scroller._getHeight = null; });
await p.waitForTimeout(500);
const fb = await p.evaluate(() => { const e = document.documentElement; const pe = document.querySelector("#xm-panel"); return { on: e.hasAttribute("data-xm-on"), open: e.hasAttribute("data-xm-panel-open"), ready: e.hasAttribute("data-xm-ready"), panel: getComputedStyle(pe).visibility, scrim: getComputedStyle(document.querySelector("#xm-panel-scrim")).visibility, frame: getComputedStyle(pe.querySelector("iframe")).visibility, side: getComputedStyle(document.querySelector('[data-testid="sidebarColumn"]')).display, composer: getComputedStyle(document.getElementById("composer")).display, region: getComputedStyle(document.querySelector('section[role="region"]')).visibility, bar: document.getElementById("bar").offsetHeight }; });
check("three errors close the panel and restore X's layout", !fb.on && !fb.open && !fb.ready && fb.panel === "hidden" && fb.scrim === "hidden" && fb.frame === "hidden" && fb.side !== "none" && fb.composer !== "none" && fb.region === "visible" && fb.bar === 53, fb);

// ---- a third party still can't frame x.com ------------------------------------------
const before3 = hits.length;
const q = await ctx.newPage();
await q.goto("https://third.test/");
await q.waitForTimeout(800);
const framed = q.frames().find((x) => x !== q.mainFrame());
const frameUrl = framed ? framed.url() : null;
check("a third-party page still can't frame x.com", frameUrl !== "https://x.com/notifications", { frameUrl, served: hits.length - before3 });

check("no page errors", errors.length === 0, errors.slice(0, 3));
await ctx.close();
server.close();
fs.rmSync(dir, { recursive: true, force: true });
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED of ${results.length}` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
