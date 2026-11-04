// End-to-end check of the extension against a fake x.com, with a real pointer.
// A throwaway Chromium loads the unpacked extension; a local HTTPS server answers as
// x.com (and as a third party) and sends X-Frame-Options: DENY like the real site.
//   npm test                 tests this directory as it is
//   EXT_DIR=dist/chrome npm test   tests a build
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const require = createRequire(process.env.PW_FROM || path.join(process.cwd(), "/"));
const { chromium } = require("playwright-core");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xm-e2e-"));
const ext = process.env.EXT_DIR ? path.resolve(process.env.EXT_DIR) : new URL("..", import.meta.url).pathname;
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", dir + "/k.pem", "-out", dir + "/c.pem", "-days", "1", "-subj", "/CN=x.com"], { stdio: "ignore" });

const NAV = [["/home", "Home", "主页"], ["/notifications", "Notifications", "通知"], ["/i/chat", "Chat", "聊天"], ["/i/bookmarks", "Bookmarks", "书签"], ["/inkks", "Profile", "资料"]];
// Like X's: these navigations get a cached page saying DENY, without reaching the network.
const SW = `self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",(e)=>e.waitUntil(clients.claim()));self.addEventListener("fetch",(e)=>{const u=new URL(e.request.url);if(e.request.mode==="navigate"&&["/notifications","/inkks"].includes(u.pathname)&&!u.search.includes("no-sw"))e.respondWith(new Response("<h1>shell</h1>",{headers:{"content-type":"text/html","x-frame-options":"DENY"}}))});`;
const page = (body) => `<!doctype html><html lang="zh"><head><style>body{margin:0;background:#000;color:#e7e9ea;font-family:sans-serif}#bar{position:sticky;top:0;z-index:3;will-change:transform;height:53px}#blur{backdrop-filter:blur(12px)}[data-testid=primaryColumn]{width:600px;border-left:1px solid rgb(47,51,54)}main{display:flex;flex:1}#app{display:flex}header{flex:1;display:flex;justify-content:flex-end;position:relative;z-index:3}header>div{width:275px}header>div>div{position:fixed;width:275px;height:100vh}nav a{display:block;color:inherit}nav a>div{display:flex;padding:12px}</style>
<script>window.__onAtHead=document.documentElement.hasAttribute('data-xm-on');</script></head><body>${body}</body></html>`;
const rail = `<header role="banner"><div><div><div><h1 style="margin:0;width:52px;height:52px"><a href="/home" aria-label="X">X</a></h1><nav>${NAV.map(([h, id, t]) => `<a href="${h}" data-testid="AppTabBar_${id}_Link"><div><div>●</div><div dir="ltr"><span>${t}</span></div></div></a>`).join("")}</nav><a href="/compose/post" data-testid="SideNav_NewTweet_Button">+</a></div></div></div></header>`;
const tabs = ["为你推荐", "正在关注", "科技", "优质蓝V原创博主"];
const home = page(`<div id="app">${rail}<main><div><div><div data-testid="primaryColumn"><div>
<div id="bar"><div id="blur"><div><div><nav role="navigation"><div style="display:flex"><div data-testid="ScrollSnap-SwipeableList"><div role="tablist" data-testid="ScrollSnap-List" style="display:flex">${tabs.map((t, i) => `<div role="presentation"><a role="tab" aria-selected="${!i}" href="#"><div><div dir="ltr">${t}</div></div></a></div>`).join("")}</div></div></div></nav></div></div></div></div>
<div></div><div id="composer"><div data-testid="tweetTextarea_0">有什么新鲜事</div></div><div style="height:1px"></div>
<div id="tl"><section role="region"><div><div id="root" style="position:relative"></div></div></section></div>
</div></div></div></div><div data-testid="sidebarColumn">right</div></main></div>
<div data-testid="GrokDrawer" onclick="window.__grokClicks=(window.__grokClicks||0)+1" style="position:fixed;right:20px;bottom:87px"><button style="width:55px;height:55px;border-radius:16px;background:rgba(0,0,0,.65);border:1px solid rgb(75,78,82);box-sizing:border-box">G</button></div>
<div data-testid="chat-drawer-root" style="position:fixed;right:20px;bottom:20px"><button style="width:55px;height:55px;border-radius:16px;background:rgba(0,0,0,.65);border:1px solid rgb(75,78,82);box-sizing:border-box">C</button></div>
<script>
class Rect{constructor(t,h){this._t=t;this._h=h}getTop(){return this._t}getBottom(){return this._t+this._h}getHeight(){return this._h}translateBy(d){return new Rect(this._t+d,this._h)}}
const vp={getRect(){return new Rect(0,innerHeight)},scrollTo(x,y){window.scrollTo(x,y)},scrollBy(){},scrollY(){return window.scrollY}};
class List{constructor(){window.scroller=this;this._viewport=vp;this._rootRef={current:document.getElementById('root')};this._cells=new Map();this.props={cacheKey:'home',list:[{id:'impressionPlaceholder-home-conversation-1001'},{id:'tweet-1000'},{id:'tweet-1001'},...Array.from({length:60},(_,i)=>({id:'tweet-'+i}))],minimumOffscreenToViewportRatio:.5,preferredOffscreenToViewportRatio:2.5};this._h=i=>i.id.startsWith('impressionPlaceholder')?0:i.id.startsWith('feedback')?60:120+(+i.id.slice(6)*37)%160}
_getHeight(i){return this._h(i)}
_scheduleCriticalUpdate(){requestAnimationFrame(()=>this.u())}
u(){const r=this._viewport.getRect().translateBy(-this._rootRef.current.getBoundingClientRect().top);const lo=r.getTop(),hi=r.getBottom();let y=0;const keep=new Set();for(const it of this.props.list){const h=this._h(it);if(y+h>=lo&&y<=hi){keep.add(it.id);if(!this._cells.has(it.id)){const c=document.createElement('div');c.dataset.testid='cellInnerDiv';c.style.cssText='position:absolute;width:100%;transform:translateY('+y+'px)';c.innerHTML='<article data-testid="tweet" style="overflow:hidden;height:'+h+'px"><a class="user" href="/someone">@someone</a> <a href="/x/status/'+it.id.slice(6)+'"><time>1h</time></a><p data-testid="tweetText">post '+it.id+'</p><button data-testid="like">like</button></article>';this._rootRef.current.append(c);this._cells.set(it.id,{getElement:()=>c})}}y+=h}for(const[id,c]of this._cells)if(!keep.has(id)){c.getElement().remove();this._cells.delete(id)}this._rootRef.current.style.minHeight=y+'px'}}
window.__listDelay=setTimeout(()=>{const l=new List();l.u()},400);
addEventListener('scroll',()=>window.scroller&&window.scroller._scheduleCriticalUpdate());
</script>`);
const inner = (name) => page(`<div id="app">${rail}<main><div><div><div data-testid="primaryColumn"><div id="content" style="height:3000px">${name}</div></div></div></div><div data-testid="sidebarColumn">right</div></main></div><script>window.__topOk=(()=>{try{return window.top!==window}catch{return true}})();window.__loadId=Math.random();
const content=document.getElementById("content");content.prepend(document.createElement("div"));const root=document.createElement("div");content.append(root);
const S={_rootRef:{current:root},_cells:new Map(),_getHeight(){return 100},_getHeightForItemId(){return 100},_getRenderCandidates(){return {}},_scheduleCriticalUpdate(){},props:{}};window.scroller=S;
const render=()=>{root.innerHTML="";S._cells.clear();const m=/status\\/(\\d+)/.exec(location.pathname);if(!m)return;const c=document.createElement("div");c.dataset.testid="cellInnerDiv";c.innerHTML='<article data-testid="tweet" style="height:300px">post '+m[1]+'<div role="group"><button data-testid="reply">reply</button><button aria-haspopup="menu">share</button></div><div><div><button aria-haspopup="menu" id="sort">相关</button></div></div></article><div><div data-testid="tweetTextarea_0">box</div></div>';root.append(c);S._cells.set("tweet-"+m[1],{getElement:()=>c})};render();addEventListener("popstate",render);
</script>`);
const third = `<!doctype html><title>third</title><iframe id="f" src="https://x.com/notifications"></iframe>`;

const hits = [];
const server = https.createServer({ key: fs.readFileSync(dir + "/k.pem"), cert: fs.readFileSync(dir + "/c.pem") }, (req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  const url = req.url.split("?")[0];
  if (host !== "x.com") return res.writeHead(200, { "content-type": "text/html" }).end(third);
  hits.push(url);
  if (url === "/favicon.ico") return res.writeHead(204).end();
  if (url === "/sw.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(SW);
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

// Chromium opens a link in a new tab with Cmd on macOS and Ctrl elsewhere.
const NEW_TAB_KEY = process.platform === "darwin" ? "Meta" : "Control";
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

const t0Place = Date.now();
await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
const firstPlacedMs = Date.now() - t0Place;
await p.waitForTimeout(400);
const firstConv = await p.evaluate(() => { const c = (id) => window.scroller._cells.get(id)?.getElement(); const a = c("tweet-1000"), b = c("tweet-1001"); return { a: a && a.style.translate, b: b && b.style.translate, joinA: a && a.getAttribute("data-xm-join"), joinB: b && b.getAttribute("data-xm-join") }; });
check("a conversation at the very top is one card, without a wait", firstPlacedMs < 1500 && firstConv.joinA === "next" && firstConv.joinB === "prev" && firstConv.a.split(" ")[0] === firstConv.b.split(" ")[0], { firstPlacedMs, firstConv });
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
await p.evaluate(async () => { const reg = await navigator.serviceWorker.register("/sw.js"); await new Promise((r) => { const w = reg.installing || reg.waiting; if (!w) return r(); w.addEventListener("statechange", () => w.state === "activated" && r()); }); });
check("a service worker answers the listed routes, as on X", await p.evaluate(async () => { const f = document.createElement("iframe"); f.src = "/notifications"; document.body.append(f); await new Promise((r) => setTimeout(r, 500)); let blocked = false; try { blocked = !f.contentDocument || f.contentDocument.body.textContent === ""; } catch { blocked = true; } f.remove(); return blocked; }));
const panelState = () => p.evaluate(() => { const pe = document.querySelector("#xm-panel"); const r = pe && pe.getBoundingClientRect(); const shown = document.querySelector("#xm-panel iframe[data-xm-shown]"); return { open: document.documentElement.hasAttribute("data-xm-panel-open"), rect: r && [r.left, r.width], frames: pe ? pe.querySelectorAll("iframe").length : 0, src: shown && shown.dataset.xmHref, path: location.pathname, active: !!document.querySelector("nav a[data-xm-active]") }; });
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
const entryHits = hits.filter((u) => u === "/i/history").length;
check("the icon brings the same page back, not a reload", restored.kept === 42 && restored.y === 700 && entryHits === 1, { restored, entryHits });

// a page that reloads itself is refused by the service worker, then re-enters
await f.evaluate(() => location.reload()).catch(() => {});
await p.waitForTimeout(900);
f = frameOf("/notifications");
const recovered = f && (await f.evaluate(() => ({ path: location.pathname, mark: document.documentElement.hasAttribute("data-xm-panel") })).catch(() => null));
check("a page that reloads itself recovers instead of staying refused", !!recovered && recovered.path === "/notifications" && recovered.mark && hits.filter((u) => u === "/i/history").length === 2, { recovered, frames: p.frames().map((x) => x.url()) });
const bad = await p.evaluate(async () => { const f = document.createElement("iframe"); f.src = "/i/history?xm-panel=" + encodeURIComponent("/\\\\evil.example/p"); document.body.append(f); await new Promise((r) => setTimeout(r, 400)); const out = { path: f.contentWindow.location.pathname, host: f.contentWindow.location.host, shim: f.contentWindow.history.back.toString().includes("go(-1)") }; f.remove(); return out; });
check("a hostile address is ignored and the page still starts", bad.host === "x.com" && bad.shim, bad);
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
const chain = await f.evaluate(async () => {
  const seen = [];
  const on = (e) => seen.push([e.state && e.state.n, history.state && history.state.n, location.pathname]);
  addEventListener("popstate", on);
  history.pushState({ n: 1 }, "", "/a");
  history.pushState({ n: 2 }, "", "/b");
  history.pushState({ n: 3 }, "", "/c");
  history.back();
  history.back();
  const sameTask = location.pathname;
  await new Promise((r) => setTimeout(r, 60));
  history.go(-99);
  await new Promise((r) => setTimeout(r, 60));
  const afterFar = location.pathname;
  let threw = false;
  try { history.pushState(() => {}, "", "/bad"); } catch { threw = true; }
  history.back();
  await new Promise((r) => setTimeout(r, 60));
  removeEventListener("popstate", on);
  return { seen, sameTask, afterFar, threw, end: location.pathname };
});
check("repeated back stays consistent, too-far is ignored, a failed push leaves no entry", chain.sameTask === "/c" && JSON.stringify(chain.seen.slice(0, 2)) === JSON.stringify([[2, 2, "/b"], [1, 1, "/a"]]) && chain.afterFar === "/a" && chain.threw && chain.end === "/notifications" && chain.seen.length === 3, chain);
await railLink("Notifications").click();
await p.waitForTimeout(150);

// ---- Cmd-click isn't intercepted ----------------------------------------------------
await railLink("Chat").click();
await p.waitForTimeout(250);
const pagesBefore = ctx.pages().length;
await railLink("Home").click({ modifiers: [NEW_TAB_KEY] });
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

// ---- X swaps a post for a small note ("not interested") ---------------------------------
const swap = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  window.scrollTo(0, 0); await sleep(300);
  const victim = "tweet-1";
  const cell = S._cells.get(victim).getElement();
  const before = cell.style.translate;
  const col = before.split(" ")[0];
  const list = S.props.list.map((i) => (i.id === victim ? { id: "feedback-1" } : i));
  S.props = { ...S.props, list };
  S._scheduleCriticalUpdate(); await sleep(700);
  const note = S._cells.get("feedback-1")?.getElement();
  const out = { before, note: note && note.style.translate, placed: !!note && note.hasAttribute("data-xm-placed") };
  return { ...out, sameSlot: !!note && note.style.translate.split(" ")[0] === col && Math.abs(parseFloat(note.style.translate.split(" ")[1]) - parseFloat(before.split(" ")[1])) < 1 };
});
check("a post swapped for a small note keeps its place, and the column closes up", swap.placed && swap.sameSlot, swap);
const swapMix = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  window.scrollTo(0, 0); await sleep(300);
  const byCol = {};
  for (const [id, c] of S._cells) { const e = c.getElement(); if (id.startsWith("tweet-") && e.hasAttribute("data-xm-placed")) { const [x, y] = e.style.translate.split(" ").map(parseFloat); (byCol[x] = byCol[x] || []).push({ id, y }); } }
  const col = Object.values(byCol).find((a) => a.length >= 4).sort((m, n) => m.y - n.y);
  const [A, B, C, D] = col.map((c) => c.id);
  S.props = { ...S.props, list: S.props.list.filter((i) => i.id !== A).map((i) => (i.id === C ? { id: "feedback-3" } : i)) };
  S._scheduleCriticalUpdate(); await sleep(700);
  const y = (id) => { const c = S._cells.get(id)?.getElement(); return c && c.hasAttribute("data-xm-placed") ? parseFloat(c.style.translate.split(" ")[1]) : null; };
  return { order: [y(B), y("feedback-3"), y(D)] };
});
check("a replacement stays between its neighbours even when others go too", swapMix.order.every((v) => v !== null) && swapMix.order[0] < swapMix.order[1] && swapMix.order[1] < swapMix.order[2], swapMix);
const topBatch = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  window.scrollTo(0, 0); await sleep(300);
  const news = [9001, 9002, 9003, 9004].map((n) => ({ id: "tweet-" + n }));
  S.props = { ...S.props, list: [...news, ...S.props.list] };
  S._scheduleCriticalUpdate(); await sleep(800);
  const at = news.map((n) => S._cells.get(n.id)?.getElement()?.style.translate);
  return { at, cols: new Set(at.map((v) => v && v.split(" ")[0])).size, tops: at.map((v) => v && parseFloat(v.split(" ")[1])) };
});
check("new posts at the top spread across columns, in order", topBatch.cols >= 3 && topBatch.tops.every((t) => t !== null && t < 500), topBatch);
// X moves old posts to the end when more load, so new ones arrive ahead of them
const moved = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  const list = S.props.list;
  const unplaced = list.filter((i) => !S._cells.has(i.id)).slice(-12);
  const placedHead = list.filter((i) => !unplaced.includes(i));
  const fresh = Array.from({ length: 24 }, (_, n) => ({ id: "tweet-" + (7000 + n) }));
  S.props = { ...S.props, list: [...placedHead.slice(0, placedHead.length - 8), ...fresh, ...placedHead.slice(placedHead.length - 8), ...unplaced] };
  S._scheduleCriticalUpdate();
  const doc = document.documentElement;
  const seenFresh = new Set();
  for (let i = 0; i < 60; i++) { window.scrollTo(0, doc.scrollHeight); await sleep(90); for (const f of fresh) if (S._cells.get(f.id)?.getElement()?.hasAttribute("data-xm-placed")) seenFresh.add(f.id); }
  const counts = {};
  for (const [id, c] of S._cells) { const e = c.getElement(); if (e.hasAttribute("data-xm-placed")) { const x = e.style.translate.split(" ")[0]; counts[x] = (counts[x] || 0) + 1; } }
  const placedFresh = fresh.filter((f) => S._cells.get(f.id)?.getElement()?.hasAttribute("data-xm-placed")).length;
  const bottoms = {};
  for (const [id, c] of S._cells) { const e = c.getElement(); if (e.hasAttribute("data-xm-placed")) { const [x, y] = e.style.translate.split(" ").map(parseFloat); bottoms[x] = Math.max(bottoms[x] || 0, y + e.offsetHeight); } }
  const vals = Object.values(bottoms);
  window.scrollTo(0, 0); await sleep(400);
  return { counts, spread: Math.max(...vals) - Math.min(...vals), cols: vals.length, freshPlaced: seenFresh.size };
});
check("new posts landing ahead of moved ones still balance the columns", moved.cols === 4 && moved.spread < 700, moved);
check("and none of them gets left behind", moved.freshPlaced === 24, moved.freshPlaced);
const twoInGap = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  window.scrollTo(0, 0); await sleep(300);
  const byCol = {};
  for (const [id, c] of S._cells) { const e = c.getElement(); if (id.startsWith("tweet-") && e.hasAttribute("data-xm-placed") && !e.getAttribute("data-xm-join")) { const [x, y] = e.style.translate.split(" ").map(parseFloat); (byCol[x] = byCol[x] || []).push({ id, y }); } }
  const col = Object.values(byCol).find((a) => a.length >= 4).sort((m, n) => m.y - n.y);
  const [A, B, C, D] = col.map((c) => c.id);
  S.props = { ...S.props, list: S.props.list.map((i) => (i.id === B ? { id: "feedback-5" } : i.id === C ? { id: "feedback-6" } : i)) };
  S._scheduleCriticalUpdate(); await sleep(700);
  const y = (id) => { const c = S._cells.get(id)?.getElement(); return c && c.hasAttribute("data-xm-placed") ? parseFloat(c.style.translate.split(" ")[1]) : null; };
  return { ys: [y(A), y("feedback-5"), y("feedback-6"), y(D)] };
});
check("two replacements in one gap keep their order", twoInGap.ys.every((v) => v !== null) && twoInGap.ys[0] < twoInGap.ys[1] && twoInGap.ys[1] < twoInGap.ys[2] && twoInGap.ys[2] < twoInGap.ys[3], twoInGap);
const crossed = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  const conv1 = [{ id: "impressionPlaceholder-home-conversation-6003" }, { id: "tweet-6001" }, { id: "impressionPlaceholder-home-conversation-6005" }, { id: "tweet-6004" }, { id: "tweet-6005" }, { id: "tweet-6003" }];
  S.props = { ...S.props, list: [...S.props.list, ...conv1] };
  S._scheduleCriticalUpdate();
  const doc = document.documentElement;
  for (let i = 0; i < 40; i++) { window.scrollTo(0, doc.scrollHeight); await sleep(90); if (S._cells.get("tweet-6003")?.getElement()?.hasAttribute("data-xm-placed")) break; }
  await sleep(200);
  const j = (id) => { const c = S._cells.get(id)?.getElement(); return c ? c.getAttribute("data-xm-join") : "unmounted"; };
  const out = { a: j("tweet-6001"), inner1: j("tweet-6004"), inner2: j("tweet-6005"), tail: j("tweet-6003") };
  window.scrollTo(0, 0); await sleep(300);
  return out;
});
check("a conversation's range doesn't swallow another one", !crossed.a && !crossed.tail && crossed.inner1 === "next" && crossed.inner2 === "prev", crossed);
const noTail = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  const after = S.props.list.findIndex((i) => i.id === "tweet-5");
  S.props = { ...S.props, list: [...S.props.list, { id: "impressionPlaceholder-home-conversation-77777" }, { id: "tweet-8001" }, { id: "tweet-8002" }] };
  S._scheduleCriticalUpdate();
  const b = document.documentElement;
  for (let i = 0; i < 30; i++) { window.scrollTo(0, b.scrollHeight); await sleep(100); const c = S._cells.get("tweet-8002")?.getElement(); if (c && c.hasAttribute("data-xm-placed")) break; }
  await sleep(200);
  const j = (id) => { const c = S._cells.get(id)?.getElement(); return c ? c.getAttribute("data-xm-join") : "unmounted"; };
  const out = { a: j("tweet-8001"), b: j("tweet-8002"), after };
  window.scrollTo(0, 0); await sleep(300);
  return out;
});
check("a conversation marker naming a post that isn't there joins nothing", !noTail.a && !noTail.b, noTail);
const swapDeep = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  const target = Math.min(1500, document.documentElement.scrollHeight - innerHeight - 50);
  window.scrollTo(0, target); await sleep(900);
  const vis = [...S._cells.entries()].map(([id, c]) => [id, c.getElement()]).filter(([id, e]) => id.startsWith("tweet-") && e.hasAttribute("data-xm-placed") && e.getBoundingClientRect().top > 100 && e.getBoundingClientRect().bottom < innerHeight);
  if (!vis.length) return { before: "", note: "", placed: false, debug: { y: window.scrollY, target, doc: document.documentElement.scrollHeight, cells: S._cells.size, ids: [...S._cells.keys()].slice(0, 6), placed: document.querySelectorAll("[data-xm-placed]").length, rects: [...S._cells.values()].slice(0, 4).map((c) => { const e = c.getElement(); const r = e.getBoundingClientRect(); return [e.hasAttribute("data-xm-placed"), Math.round(r.top), Math.round(r.height), e.style.translate]; }), list: S.props.list.length } };
  const [victim, cell] = vis[1] || vis[0];
  const before = cell.style.translate;
  S.props = { ...S.props, list: S.props.list.map((i) => (i.id === victim ? { id: "feedback-2" } : i)) };
  S._scheduleCriticalUpdate(); await sleep(800);
  const note = S._cells.get("feedback-2")?.getElement();
  window.scrollTo(0, 0); await sleep(300);
  return { before, note: note && note.style.translate, placed: !!note && note.hasAttribute("data-xm-placed") };
});
check("further down the feed too", swapDeep.placed && !!swapDeep.note && swapDeep.note.split(" ")[0] === swapDeep.before.split(" ")[0] && Math.abs(parseFloat(swapDeep.note.split(" ")[1]) - parseFloat(swapDeep.before.split(" ")[1])) < 1, swapDeep);

// ---- post window ---------------------------------------------------------------------
const postState = () => p.evaluate(() => { const e = document.documentElement; const pe = document.querySelector("#xm-post"); const r = pe && pe.getBoundingClientRect(); const sc = document.querySelector("#xm-post-scrim"); const f = pe && pe.querySelector("iframe"); return { open: e.hasAttribute("data-xm-post-open"), visible: !!pe && getComputedStyle(pe).visibility === "visible", rect: r && [r.left, r.top, r.width, r.height].map(Math.round), blur: sc ? getComputedStyle(sc).backdropFilter : null, path: location.pathname, y: window.scrollY, frameName: f && f.name, frameHref: f && f.dataset.xmHref }; });
const panelBlur = await p.evaluate(() => getComputedStyle(document.querySelector("#xm-panel-scrim")).backdropFilter);
check("the panel blurs the feed behind it", panelBlur.includes("blur"), panelBlur);
const card = p.locator('[data-xm-placed] [data-testid="tweetText"]').first();
await card.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
const cardY = await p.evaluate(() => window.scrollY);
await card.click();
await p.waitForTimeout(500);
let ps = await postState();
const statusHref = ps.frameHref;
check("clicking a card opens the post window over a blurred feed, feed stays", ps.open && ps.visible && ps.path === "/home" && ps.y === cardY && ps.blur.includes("blur") && /^\/x\/status\/\d+$/.test(ps.frameHref) && ps.frameName === "xm-post", ps);
await p.mouse.click(20, 860);
await p.waitForTimeout(250);
ps = await postState();
check("clicking outside closes it, the feed where it was", !ps.open && !ps.visible && ps.y === cardY && ps.path === "/home", ps);
const entryBefore = hits.filter((u) => u === "/i/history").length;
await p.locator('[data-xm-placed] [data-testid="tweetText"]').nth(2).click();
await p.waitForTimeout(400);
ps = await postState();
const framePath = await p.frames().find((x) => x.name() === "xm-post").evaluate(() => location.pathname);
check("the next post reuses the window, without loading a page", ps.open && ps.frameHref !== statusHref && framePath === ps.frameHref && hits.filter((u) => u === "/i/history").length === entryBefore, { ps, framePath, entryBefore });

// ---- two panes, ready signal, and leaving the post inside the window ------------------
const postFrameOf = () => p.frames().find((x) => x.name() === "xm-post");
const loadingCleared = async () => { const t0 = Date.now(); while ((await p.evaluate(() => document.documentElement.hasAttribute("data-xm-post-loading"))) && Date.now() - t0 < 6000) await p.waitForTimeout(20); return Date.now() - t0; };
const panes = () => postFrameOf().evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width)]; }; return { on: document.documentElement.hasAttribute("data-xm-post"), w: innerWidth, focal: r("[data-xm-focal]"), actions: r("[data-xm-actions]"), composer: r("[data-xm-composer]"), pc: r('[data-testid="primaryColumn"]'), sort: r("[data-xm-sort]"), sortHasButton: !!document.querySelector("[data-xm-sort] #sort"), bottoms: ["[data-xm-focal]", "[data-xm-actions]", "[data-xm-composer]"].map((s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().bottom) : null; }), h: innerHeight, path: location.pathname }; });
await p.waitForTimeout(300);
let pn = await panes();
const split = Math.round(pn.w * 0.666);
check("the post scrolls on the left with actions and reply box pinned below, replies on the right", pn.on && pn.focal[0] === 0 && pn.focal[1] === 0 && pn.focal[2] === split && pn.actions[0] === 0 && pn.composer[0] === 0 && pn.bottoms[0] === pn.actions[1] && pn.bottoms[1] === pn.composer[1] && pn.bottoms[2] === pn.h && pn.pc[0] === split, pn);
check("the sort button heads the right pane", pn.sortHasButton && pn.sort && pn.sort[0] === split && pn.sort[1] === 0, pn.sort);
const sortFollows = await postFrameOf().evaluate(async () => { document.querySelector('[data-testid="primaryColumn"]').style.minHeight = "3000px"; window.scrollTo(0, 200); await new Promise((r) => setTimeout(r, 200)); const top = Math.round(document.querySelector("[data-xm-sort]").getBoundingClientRect().top); window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 150)); document.querySelector('[data-testid="primaryColumn"]').style.minHeight = ""; return { top, back: Math.round(document.querySelector("[data-xm-sort]").getBoundingClientRect().top) }; });
check("the sort button scrolls away with the replies", sortFollows.top === -200 && sortFollows.back === 0, sortFollows);
const sortRelease = await postFrameOf().evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const row = document.querySelector("[data-xm-sort]");
  row.style.translate = "0px -50px";
  const group = document.querySelector("[data-xm-actions]");
  const parent = group.parentElement;
  const next = group.nextSibling;
  group.remove(); // the post no longer looks as expected, so the layout stands down
  await sleep(250);
  const out = { on: document.documentElement.hasAttribute("data-xm-post"), marked: row.hasAttribute("data-xm-sort"), translate: row.style.translate };
  parent.insertBefore(group, next);
  await sleep(250);
  return out;
});
check("standing down leaves the sort row as it was", !sortRelease.on && !sortRelease.marked && sortRelease.translate === "", sortRelease);
await p.keyboard.press("Escape");
await p.waitForTimeout(150);
await p.locator('[data-xm-placed] [data-testid="tweetText"]').nth(3).click();
const readyMs = await loadingCleared();
check("the window is ready as soon as the post is, not on the timeout", readyMs < 1500, readyMs);
const hrefShown = (await postState()).frameHref;
await postFrameOf().evaluate(() => { history.replaceState(null, "", "/someone"); dispatchEvent(new PopStateEvent("popstate", { state: null })); });
await p.waitForTimeout(250);
pn = await panes();
check("leaving the post inside the window goes back to X's plain page", !pn.on && pn.focal === null && pn.path === "/someone", pn);
await p.keyboard.press("Escape");
await p.waitForTimeout(150);
await p.locator('[data-xm-placed] [data-testid="tweetText"]').nth(3).click();
const again = await loadingCleared();
pn = await panes();
check("reopening that post shows the post, not where the window had wandered", pn.on && pn.path === hrefShown && again < 1500, { pn, again });
await p.keyboard.press("Escape");
await p.waitForTimeout(200);
check("Esc closes it", !(await postState()).open);
const newTabsBefore = ctx.pages().length;
await p.locator('[data-xm-placed] [data-testid="tweetText"]').first().click({ modifiers: [NEW_TAB_KEY] });
await p.waitForTimeout(200);
check("Cmd-click doesn't open the window", !(await postState()).open);
for (const extra of ctx.pages().slice(newTabsBefore)) await extra.close();
await p.locator('[data-xm-placed] [data-testid="like"]').first().click();
await p.waitForTimeout(150);
check("buttons on a card don't open it", !(await postState()).open);

// ---- sideways flow --------------------------------------------------------------------
const flowBtnBox = await p.locator("#xm-flow-btn").boundingBox();
const grokBox = await p.locator('[data-testid="GrokDrawer"] button:not(#xm-flow-btn)').boundingBox();
const flowStyle = await p.evaluate(() => { const c = getComputedStyle(document.querySelector("#xm-flow-btn")); return { bg: c.backgroundColor, r: c.borderRadius, title: document.querySelector("#xm-flow-btn").title }; });
const flowHome = await p.evaluate(() => document.querySelector("#xm-flow-btn").parentElement.getAttribute("data-testid"));
check("the switch lives in X's own floating button container", flowHome === "GrokDrawer", flowHome);
check("the switch sits above Grok's button, same size and style", flowBtnBox.x === grokBox.x && flowBtnBox.width === grokBox.width && Math.round(flowBtnBox.y + flowBtnBox.height + 12) === Math.round(grokBox.y) && flowStyle.bg === "rgba(0, 0, 0, 0.65)" && flowStyle.r === "16px" && flowStyle.title === "切换到横向流", { flowBtnBox, grokBox, flowStyle });
await p.locator("#xm-flow-btn").click();
await p.waitForTimeout(700);
const flow = () => p.evaluate(() => { const b = document.querySelector("[data-xm-board]"); const cards = [...document.querySelectorAll("[data-xm-placed]")].map((c) => { const [x, y] = c.style.translate.split(" ").map(parseFloat); return { x, y, h: c.offsetHeight, w: c.offsetWidth }; }); return { attr: document.documentElement.getAttribute("data-xm-flow"), pos: getComputedStyle(b).position, sl: b.scrollLeft, sw: b.scrollWidth, cw: b.clientWidth, ch: b.clientHeight, docY: window.scrollY, doc: document.documentElement.scrollHeight, cells: b.children.length, cards, list: window.scroller.props.list.length, stored: localStorage.getItem("xm-flow"), title: document.querySelector("#xm-flow-btn").title }; });
let fl = await flow();
const colXs = [...new Set(fl.cards.map((c) => c.x))].sort((a, b) => a - b);
const fits = fl.cards.every((c) => c.y + c.h <= fl.ch);
const overlaps = (() => { const byX = {}; for (const c of fl.cards) (byX[c.x] = byX[c.x] || []).push(c); return Object.values(byX).some((a) => a.sort((m, n) => m.y - n.y).some((c, i) => i && c.y < a[i - 1].y + a[i - 1].h)); })();
check("clicking it doesn't reach X's Grok button", (await p.evaluate(() => window.__grokClicks || 0)) === 0);
check("switching lays cards out in screen-high columns, scrolling sideways", fl.attr === "h" && fl.pos === "fixed" && colXs.length >= 2 && fits && !overlaps && fl.sw > fl.cw && fl.stored === "h" && fl.title === "切换到纵向流", { attr: fl.attr, pos: fl.pos, colXs, fits, overlaps, sw: fl.sw, cw: fl.cw, doc: fl.doc });
const box = await p.locator("[data-xm-board]").boundingBox();
await p.mouse.move(box.x + 400, 400);
await p.mouse.wheel(0, 600);
await p.waitForTimeout(350);
fl = await flow();
const afterY = fl.sl;
check("a vertical wheel moves the list sideways, the page doesn't scroll", afterY > 500 && fl.docY === 0, { afterY, docY: fl.docY });
await p.waitForTimeout(300);
await p.mouse.wheel(500, 0);
await p.waitForTimeout(350);
fl = await flow();
check("a sideways wheel scrolls it natively", fl.sl > afterY + 400, { before: afterY, now: fl.sl });
// a sideways swipe that opens with a stray vertical event must not run backwards
await p.waitForTimeout(300);
const startWobble = fl.sl;
await p.mouse.wheel(0, -1);
await p.mouse.wheel(1, -2);
for (let i = 0; i < 12; i++) { await p.mouse.wheel(25, -3); await p.waitForTimeout(16); }
await p.waitForTimeout(250);
fl = await flow();
check("a sideways swipe opening with a vertical wobble goes the way it was swiped", fl.sl > startWobble + 250, { before: startWobble, now: fl.sl });
// and a mostly vertical gesture doesn't flip when it wobbles sideways
await p.waitForTimeout(300);
const startV = fl.sl;
await p.mouse.wheel(0, -1);
for (let i = 0; i < 12; i++) { await p.mouse.wheel(i % 2 ? 2 : -2, -25); await p.waitForTimeout(16); }
await p.waitForTimeout(250);
fl = await flow();
check("a vertical gesture stays vertical through a sideways wobble", fl.sl < startV - 200, { before: startV, now: fl.sl });
// a pixel of sideways noise first doesn't leave a vertical swipe with nothing to move
await p.waitForTimeout(300);
await p.mouse.wheel(600, 0);
await p.waitForTimeout(300);
fl = await flow();
const startNoise = fl.sl;
await p.waitForTimeout(250);
await p.mouse.wheel(1, 0);
for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 40); await p.waitForTimeout(16); }
await p.waitForTimeout(250);
fl = await flow();
check("a vertical swipe opening with sideways noise still moves the list", fl.sl > startNoise + 250, { before: startNoise, now: fl.sl });
// small slow steps add up instead of vanishing
await p.waitForTimeout(300);
const startSlow = fl.sl;
for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 4); await p.waitForTimeout(220); }
await p.waitForTimeout(150);
fl = await flow();
check("small slow wheel steps still move it", fl.sl > startSlow + 5, { before: startSlow, now: fl.sl });
const overRail = fl.sl;
await p.waitForTimeout(300);
await p.mouse.move(30, 400);
await p.mouse.wheel(0, 400);
await p.waitForTimeout(350);
fl = await flow();
check("the wheel also works over the rail", fl.sl > overRail + 300, { before: overRail, now: fl.sl });
for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(220); }
await p.waitForTimeout(400);
fl = await flow();
check("scrolling on mounts and unmounts, and keeps loading the width", fl.sl > 3000 && fl.cells < fl.list && fl.cards.some((c) => c.x >= fl.sl - 600), { sl: fl.sl, cells: fl.cells, list: fl.list });
// a height change sending cards to other columns leaves the first card in view in place
await p.evaluate(() => { const b = document.querySelector("[data-xm-board]"); b.scrollLeft = Math.round(b.scrollLeft / 379) * 379; });
await p.waitForTimeout(400);
const held = await p.evaluate(() => { const b = document.querySelector("[data-xm-board]"); const cards = [...document.querySelectorAll("[data-xm-placed]")]; const view = b.getBoundingClientRect().left + 12; const first = cards.filter((c) => Math.abs(c.getBoundingClientRect().left - view) < 3).sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0]; const earlier = cards.filter((c) => c.getBoundingClientRect().right < view).sort((x, y) => y.getBoundingClientRect().left - x.getBoundingClientRect().left || x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0]; first.id = "held"; earlier.querySelector("article").style.height = "860px"; return { left: Math.round(first.getBoundingClientRect().left), hadEarlier: !!earlier }; });
await p.waitForTimeout(700);
const heldAfter = await p.evaluate(() => { const e = document.getElementById("held"); return e ? Math.round(e.getBoundingClientRect().left) : null; });
check("a card growing earlier on leaves the first card in view where it is", held.hadEarlier && heldAfter !== null && Math.abs(heldAfter - held.left) <= 2, { held, heldAfter });

// a conversation too tall for a column, then its head dropped
const splitTest = await p.evaluate(async () => {
  const S = window.scroller; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const orig = S._h; S._h = (i) => (i.id.startsWith("impressionPlaceholder") ? 0 : i.id === "tweet-901" || i.id === "tweet-902" ? 700 : orig(i));
  const mk = (id) => ({ id });
  const conv = [mk("impressionPlaceholder-home-conversation-902"), mk("tweet-901"), mk("tweet-902")];
  const list = S.props.list;
  S.props = { ...S.props, list: [...list, ...conv] };
  S._scheduleCriticalUpdate();
  const b = document.querySelector("[data-xm-board]");
  for (let i = 0; i < 40; i++) { const c = S._cells.get("tweet-902"); if (c && c.getElement().hasAttribute("data-xm-placed")) break; b.scrollLeft = b.scrollWidth; await sleep(120); }
  const cell = () => { const c = S._cells.get("tweet-902"); return c && c.getElement(); };
  const pos = (e) => e && e.style.translate.split(" ").map(parseFloat);
  const a = S._cells.get("tweet-901")?.getElement(), c2 = cell();
  const placedBoth = !!(a && c2 && a.hasAttribute("data-xm-placed") && c2.hasAttribute("data-xm-placed"));
  const ch = b.clientHeight;
  const rect = (e) => e.getBoundingClientRect();
  await sleep(300);
  const together = placedBoth && pos(a)[0] === pos(c2)[0] && c2.getAttribute("data-xm-join") === "prev" && Math.abs(rect(a).bottom - rect(c2).top) < 1 && rect(c2).bottom <= ch + 1 && a.hasAttribute("data-xm-squeezed") && rect(c2).height >= rect(a).height;
  S.props = { ...S.props, list: S.props.list.filter((i) => i.id !== "tweet-901" && !i.id.startsWith("impressionPlaceholder")) };
  // Short enough to share a column with what's before it, where a stale join would show.
  S._h = (i) => (i.id === "tweet-902" ? 60 : orig(i));
  c2.querySelector("article").style.height = "60px";
  S._scheduleCriticalUpdate();
  await sleep(900);
  const after = cell();
  S.props = { ...S.props, list: S.props.list.filter((i) => i.id !== "tweet-902") };
  S._h = orig;
  S._scheduleCriticalUpdate();
  await sleep(300);
  return { placedBoth, together, joinAfter: after ? after.getAttribute("data-xm-join") : "unmounted" };
});
check("a conversation too tall for a column is squeezed, not split, with the reply kept whole", splitTest.placedBoth && splitTest.together, splitTest);
check("a conversation losing its head doesn't glue the reply to another card", !splitTest.joinAfter, splitTest);

// the post window works from the sideways flow, and leaves the list where it was
await p.locator('[data-xm-placed] [data-testid="tweetText"]').nth(1).click();
await p.waitForTimeout(350);
const postInFlow = await postState();
const slForPost = (await flow()).sl; // the click itself may scroll the card into view
await p.mouse.move(1500, 880);
await p.mouse.wheel(0, 500);
await p.waitForTimeout(250);
const slUnderPost = (await flow()).sl;
await p.keyboard.press("Escape");
await p.waitForTimeout(200);
check("the post window opens from the sideways flow; the wheel doesn't move the list under it", postInFlow.open && postInFlow.visible && Math.abs(slUnderPost - slForPost) < 2, { open: postInFlow.open, slForPost, slUnderPost });
// a card taller than its column scrolls inside itself, for the whole gesture
await p.waitForTimeout(300);
const tall = await p.evaluate(() => { const c = [...document.querySelectorAll("[data-xm-placed]")].find((e) => { const r = e.getBoundingClientRect(); return r.left > 100 && r.right < innerWidth; }); c.querySelector("article").style.height = "3000px"; c.id = "tall"; return true; });
await p.waitForTimeout(500);
const tallBox = await p.locator("#tall").boundingBox();
const slBefore = (await flow()).sl;
await p.mouse.move(tallBox.x + 40, tallBox.y + 40);
await p.mouse.wheel(0, 300);
await p.waitForTimeout(150);
const tallState = await p.evaluate(() => { const c = document.getElementById("tall"); return { top: c.scrollTop, h: c.clientHeight, sh: c.scrollHeight, sl: document.querySelector("[data-xm-board]").scrollLeft }; });
check("a card taller than its column scrolls itself", tall && tallState.top > 200 && Math.abs(tallState.sl - slBefore) < 2 && tallState.h <= (await flow()).ch, { tallState, slBefore });
await p.waitForTimeout(250);
await p.locator("#xm-flow-btn").click();
await p.waitForTimeout(600);
fl = await flow();
const backXs = new Set(fl.cards.map((c) => c.x));
check("switching back gives the vertical masonry and clears the setting", fl.attr === null && fl.pos !== "fixed" && backXs.size === 4 && fl.stored === null && fl.sl === 0 && fl.docY > 0, { attr: fl.attr, pos: fl.pos, cols: backXs.size, stored: fl.stored, docY: fl.docY });
// a tab left in the other layout keeps its place when it comes back
const tabTest = await p.evaluate(async () => {
  const S = window.scroller; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.scrollTo(0, 2600); await sleep(500);
  const key = S.props.cacheKey;
  const firstSeen = () => { const v = [...document.querySelectorAll("[data-xm-placed]")].map((c) => ({ c, r: c.getBoundingClientRect() })).filter((o) => o.r.bottom > 0 && o.r.top < innerHeight && o.r.left < innerWidth && o.r.right > 72); return v.length; };
  S.props = { ...S.props, cacheKey: "other" }; await sleep(300);
  document.querySelector("#xm-flow-btn").click(); await sleep(400);
  S.props = { ...S.props, cacheKey: key }; await sleep(700);
  const b = document.querySelector("[data-xm-board]");
  const out = { flow: document.documentElement.getAttribute("data-xm-flow"), sl: Math.round(b.scrollLeft), seen: firstSeen() };
  document.querySelector("#xm-flow-btn").click(); await sleep(500);
  return out;
});
check("a tab left vertical and reopened sideways stays near where it was", tabTest.flow === "h" && tabTest.sl > 500 && tabTest.seen > 0, tabTest);
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(300);

// a card's other links still navigate normally
await p.locator("[data-xm-placed] a.user").first().click();
await p.waitForTimeout(500);
const off = await p.evaluate(() => ({ path: location.pathname, on: document.documentElement.hasAttribute("data-xm-on"), ready: document.documentElement.hasAttribute("data-xm-ready"), panel: document.documentElement.hasAttribute("data-xm-panel-open") }));
check("other pages turn everything off", off.path === "/someone" && !off.on && !off.ready && !off.panel, off);

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
