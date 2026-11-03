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
<div data-testid="GrokDrawer" style="position:fixed;right:20px;bottom:87px"><button style="width:55px;height:55px;border-radius:16px;background:rgba(0,0,0,.65);border:1px solid rgb(75,78,82);box-sizing:border-box">G</button></div>
<div data-testid="chat-drawer-root" style="position:fixed;right:20px;bottom:20px"><button style="width:55px;height:55px;border-radius:16px;background:rgba(0,0,0,.65);border:1px solid rgb(75,78,82);box-sizing:border-box">C</button></div>
<script>
class Rect{constructor(t,h){this._t=t;this._h=h}getTop(){return this._t}getBottom(){return this._t+this._h}getHeight(){return this._h}translateBy(d){return new Rect(this._t+d,this._h)}}
const vp={getRect(){return new Rect(0,innerHeight)},scrollTo(x,y){window.scrollTo(x,y)},scrollBy(){},scrollY(){return window.scrollY}};
class List{constructor(){window.scroller=this;this._viewport=vp;this._rootRef={current:document.getElementById('root')};this._cells=new Map();this.props={cacheKey:'home',list:Array.from({length:60},(_,i)=>({id:'tweet-'+i})),minimumOffscreenToViewportRatio:.5,preferredOffscreenToViewportRatio:2.5};this._h=i=>120+(+i.id.slice(6)*37)%160}
_getHeight(i){return this._h(i)}
_scheduleCriticalUpdate(){requestAnimationFrame(()=>this.u())}
u(){const r=this._viewport.getRect().translateBy(-this._rootRef.current.getBoundingClientRect().top);const lo=r.getTop(),hi=r.getBottom();let y=0;const keep=new Set();for(const it of this.props.list){const h=this._h(it);if(y+h>=lo&&y<=hi){keep.add(it.id);if(!this._cells.has(it.id)){const c=document.createElement('div');c.dataset.testid='cellInnerDiv';c.style.cssText='position:absolute;width:100%;transform:translateY('+y+'px)';c.innerHTML='<article data-testid="tweet" style="height:'+h+'px"><a class="user" href="/someone">@someone</a> <a href="/x/status/'+it.id.slice(6)+'"><time>1h</time></a><p data-testid="tweetText">post '+it.id+'</p><button data-testid="like">like</button></article>';this._rootRef.current.append(c);this._cells.set(it.id,{getElement:()=>c})}}y+=h}for(const[id,c]of this._cells)if(!keep.has(id)){c.getElement().remove();this._cells.delete(id)}this._rootRef.current.style.minHeight=y+'px'}}
window.__listDelay=setTimeout(()=>{const l=new List();l.u()},400);
addEventListener('scroll',()=>window.scroller&&window.scroller._scheduleCriticalUpdate());
</script>`);
const inner = (name) => page(`<div id="app">${rail}<main><div><div><div data-testid="primaryColumn"><div id="content" style="height:3000px">${name}</div></div></div></div><div data-testid="sidebarColumn">right</div></main></div><script>window.__topOk=(()=>{try{return window.top!==window}catch{return true}})();window.__loadId=Math.random();
const root=document.createElement("div");document.querySelector('[data-testid="primaryColumn"]').append(root);
const S={_rootRef:{current:root},_cells:new Map(),_getHeight(){return 100},_getHeightForItemId(){return 100},_getRenderCandidates(){return {}},_scheduleCriticalUpdate(){},props:{}};window.scroller=S;
const render=()=>{root.innerHTML="";S._cells.clear();const m=/status\\/(\\d+)/.exec(location.pathname);if(!m)return;const c=document.createElement("div");c.dataset.testid="cellInnerDiv";c.innerHTML='<article data-testid="tweet" style="height:300px">post '+m[1]+'<div role="group"><button data-testid="reply">reply</button></div></article><div><div data-testid="tweetTextarea_0">box</div></div>';root.append(c);S._cells.set("tweet-"+m[1],{getElement:()=>c})};render();addEventListener("popstate",render);
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
const panes = () => postFrameOf().evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width)]; }; return { on: document.documentElement.hasAttribute("data-xm-post"), w: innerWidth, focal: r("[data-xm-focal]"), actions: r("[data-xm-actions]"), composer: r("[data-xm-composer]"), pc: r('[data-testid="primaryColumn"]'), path: location.pathname }; });
await p.waitForTimeout(300);
let pn = await panes();
const split = Math.round(pn.w * 0.666);
check("the post sits on the left, actions, reply box and replies on the right", pn.on && pn.focal[0] === 0 && pn.focal[2] === split && pn.actions[0] === split && pn.actions[1] === 0 && pn.composer[0] === split && pn.pc[0] === split, pn);
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
await p.locator('[data-xm-placed] [data-testid="tweetText"]').first().click({ modifiers: ["Meta"] });
await p.waitForTimeout(200);
check("Cmd-click doesn't open the window", !(await postState()).open);
for (const extra of ctx.pages().slice(newTabsBefore)) await extra.close();
await p.locator('[data-xm-placed] [data-testid="like"]').first().click();
await p.waitForTimeout(150);
check("buttons on a card don't open it", !(await postState()).open);

// ---- sideways flow --------------------------------------------------------------------
const flowBtnBox = await p.locator("#xm-flow-btn").boundingBox();
const grokBox = await p.locator('[data-testid="GrokDrawer"] button').boundingBox();
const flowStyle = await p.evaluate(() => { const c = getComputedStyle(document.querySelector("#xm-flow-btn")); return { bg: c.backgroundColor, r: c.borderRadius, title: document.querySelector("#xm-flow-btn").title }; });
check("the switch sits above Grok's button, same size and style", flowBtnBox.x === grokBox.x && flowBtnBox.width === grokBox.width && Math.round(flowBtnBox.y + flowBtnBox.height + 12) === Math.round(grokBox.y) && flowStyle.bg === "rgba(0, 0, 0, 0.65)" && flowStyle.r === "16px" && flowStyle.title === "切换到横向流", { flowBtnBox, grokBox, flowStyle });
await p.locator("#xm-flow-btn").click();
await p.waitForTimeout(700);
const flow = () => p.evaluate(() => { const b = document.querySelector("[data-xm-board]"); const cards = [...document.querySelectorAll("[data-xm-placed]")].map((c) => { const [x, y] = c.style.translate.split(" ").map(parseFloat); return { x, y, h: c.offsetHeight, w: c.offsetWidth }; }); return { attr: document.documentElement.getAttribute("data-xm-flow"), pos: getComputedStyle(b).position, sl: b.scrollLeft, sw: b.scrollWidth, cw: b.clientWidth, ch: b.clientHeight, docY: window.scrollY, doc: document.documentElement.scrollHeight, cells: b.children.length, cards, list: window.scroller.props.list.length, stored: localStorage.getItem("xm-flow"), title: document.querySelector("#xm-flow-btn").title }; });
let fl = await flow();
const colXs = [...new Set(fl.cards.map((c) => c.x))].sort((a, b) => a - b);
const fits = fl.cards.every((c) => c.y + c.h <= fl.ch);
const overlaps = (() => { const byX = {}; for (const c of fl.cards) (byX[c.x] = byX[c.x] || []).push(c); return Object.values(byX).some((a) => a.sort((m, n) => m.y - n.y).some((c, i) => i && c.y < a[i - 1].y + a[i - 1].h)); })();
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
// the post window works from the sideways flow, and leaves the list where it was
const slForPost = (await flow()).sl;
await p.locator('[data-xm-placed] [data-testid="tweetText"]').nth(1).click();
await p.waitForTimeout(350);
const postInFlow = await postState();
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
