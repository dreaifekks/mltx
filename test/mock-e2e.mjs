// End-to-end check of the extension against a fake x.com, with a real pointer.
// A throwaway Chromium loads the unpacked extension; a local HTTPS server answers as
// x.com (and as a third party) and sends X-Frame-Options: DENY like the real site.
//   npm test                 tests this directory as it is
//   EXT_DIR=dist/chrome npm test   tests a build
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { safariManifest } from "../scripts/safari-manifest.mjs";

const require = createRequire(process.env.PW_FROM || path.join(process.cwd(), "/"));
const { chromium } = require("playwright-core");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xm-e2e-"));
const built = process.env.EXT_DIR ? path.resolve(process.env.EXT_DIR) : new URL("..", import.meta.url).pathname;
// XM_SAFARI=1 acts like Safari in Chromium: frame-rules.json has no effect, so X-Frame-Options
// really refuses X's pages, and the scripts take the route they take on Safari.
const SAFARI = !!process.env.XM_SAFARI;
const ENTRY = SAFARI ? "/robots.txt" : "/i/history";
let ext = built;
if (SAFARI) {
  ext = dir + "/ext";
  fs.mkdirSync(ext);
  for (const name of ["icons", "_locales", "frame-rules.json", "masonry.css", "panel-frame.css", "i18n.js", "common.js", "settings-bridge.js", "masonry.js", "panel-frame.js", "popup.html", "popup.css", "popup.js"]) fs.cpSync(path.join(built, name), path.join(ext, name), { recursive: true });
  fs.cpSync(new URL("../safari-entry.js", import.meta.url).pathname, path.join(ext, "safari-entry.js")); // a Chrome build doesn't have it
  const manifest = safariManifest(JSON.parse(fs.readFileSync(path.join(built, "manifest.json"), "utf8")));
  delete manifest.declarative_net_request;
  fs.writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(manifest));
}
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
class List{constructor(){window.scroller=this;this._viewport=vp;this._rootRef={current:document.getElementById('root')};this._cells=new Map();this.props={cacheKey:'home',list:[{id:'impressionPlaceholder-home-conversation-1001'},{id:'tweet-1000'},{id:'tweet-1001'},...Array.from({length:60},(_,i)=>({id:'tweet-'+i}))],minimumOffscreenToViewportRatio:.5,preferredOffscreenToViewportRatio:2.5};this._h=i=>i.id.startsWith('impressionPlaceholder')?0:i.id.includes('-gap-')?36:i.id.startsWith('feedback')?60:120+(+i.id.slice(6)*37)%160}
_getHeight(i){return this._h(i)}
_scheduleCriticalUpdate(){requestAnimationFrame(()=>this.u())}
u(){const r=this._viewport.getRect().translateBy(-this._rootRef.current.getBoundingClientRect().top);const lo=r.getTop(),hi=r.getBottom();let y=0;const keep=new Set();for(const it of this.props.list){const h=this._h(it);if(y+h>=lo&&y<=hi){keep.add(it.id);if(!this._cells.has(it.id)){const c=document.createElement('div');c.dataset.testid='cellInnerDiv';c.style.cssText='position:absolute;width:100%;transform:translateY('+y+'px)';c.innerHTML=it.id.includes('-gap-')?'<a href="/i/status/'+it.id.split('-gap-')[1]+'" role="link" style="display:block;height:36px">show more replies</a>':'<article data-testid="tweet" style="overflow:hidden;height:'+h+'px"><a class="user" href="/someone">@someone</a> <a href="/x/status/'+it.id.slice(6)+'" role="link"><time>1h</time></a><p data-testid="tweetText">post '+it.id+'</p><button data-testid="like">like</button>'+(+it.id.slice(6)%5===0?'<div role="link" tabindex="0" data-testid="quote"><div><time>2h</time></div><div data-testid="tweetPhoto" style="height:8px;background:#333"></div>quoted</div>':'')+'</article>';const q=c.querySelector('[data-testid="quote"]');if(q){q.__reactFiber$mock={memoizedProps:{},return:{memoizedProps:{link:{pathname:"https://twitter.com/quoted/status/"+(70000+ +it.id.slice(6)),anchorless:true}},return:null}};q.addEventListener("click",()=>{window.__quoteLeft=(window.__quoteLeft||0)+1})}this._rootRef.current.append(c);this._cells.set(it.id,{getElement:()=>c})}}y+=h}for(const[id,c]of this._cells)if(!keep.has(id)){c.getElement().remove();this._cells.delete(id)}this._rootRef.current.style.minHeight=y+'px'}}
window.__listDelay=setTimeout(()=>{const l=new List();l.u()},400);
addEventListener('scroll',()=>window.scroller&&window.scroller._scheduleCriticalUpdate());
window.__xPops=0;addEventListener('popstate',()=>window.__xPops++);
</script>`);
const inner = (name) => page(`<div id="app">${rail}<main><div><div><div data-testid="primaryColumn"><div id="content" style="height:3000px">${name}</div></div></div></div><div data-testid="sidebarColumn">right</div></main></div><script>window.__topOk=(()=>{try{return window.top!==window}catch{return true}})();window.__loadId=Math.random();
const content=document.getElementById("content");content.prepend(document.createElement("div"));const root=document.createElement("div");content.append(root);
const S={_rootRef:{current:root},_cells:new Map(),_getHeight(){return 100},_getHeightForItemId(){return 100},_getRenderCandidates(){return {}},_scheduleCriticalUpdate(){},props:{list:[]}};window.scroller=S;
const cellFor=(item,html)=>{const c=document.createElement("div");c.dataset.testid="cellInnerDiv";c.innerHTML=html;S._cells.set(item,{getElement:()=>c});return c};
const go=(href)=>{history.pushState(null,"",href);render()};
const render=()=>{root.innerHTML="";S._cells.clear();S.props={list:[]};const m=/status\\/(\\d+)/.exec(location.pathname);
if(!m){if(location.pathname!=="/someone"){const a=document.createElement("article");a.dataset.testid="tweet";a.innerHTML='<a href="/z/status/5003" role="link"><time>1h</time></a><p data-testid="tweetText">in the panel</p>';content.append(a)}return}
const id=+m[1];const inThread=id>=5000&&id<6000;
const isArticle=id===5600;
const focal=cellFor("tweet-"+id,'<article data-testid="tweet" style="position:relative;z-index:0;height:'+(window.__focalHeight||300)+'px">post '+id+(isArticle?'<div id="head" style="position:relative;z-index:2;height:60px">header</div><div style="position:relative;z-index:0"><div role="group" id="compact" style="max-width:300px"><button data-testid="reply">reply</button></div></div>':'')+'<div style="position:relative;z-index:0"><div role="group" id="postbar"'+(isArticle?' style="max-width:none"':'')+'><button data-testid="reply">reply</button><button aria-haspopup="menu">share</button></div></div><div><div><button aria-haspopup="menu" id="sort">相关</button></div></div></article><div><div data-testid="tweetTextarea_0">box</div></div>');
root.append(focal);
const replies=inThread?[5900,5901,5902]:[];
const replyCells=replies.map((n)=>{const c=cellFor("conversationthread-"+n+"-tweet-"+n,'<article data-testid="tweet" style="height:120px"><a href="/x/status/'+n+'" role="link"><time>1h</time></a><p data-testid="tweetText">'+(n===5901?"reply with mutedword":"reply "+n)+'</p></article>');c.querySelector("article").addEventListener("click",()=>go("/x/status/"+n));root.append(c);return c});
const after=["tweet-"+id,...replies.map((n)=>"conversationthread-"+n+"-tweet-"+n)].map((i)=>({id:i}));
S.props={list:after};
const above=id===5500?[5400]:inThread&&id!==5001?[5001,5002,5003,5004].filter((n)=>n<id):id>=5900&&id<6000?[5001,5002,5003]:[];
if(!above.length)return;
const path=location.pathname;
setTimeout(()=>{if(location.pathname!==path)return;
above.map((n)=>{const c=cellFor("tweet-"+n,'<article data-testid="tweet" style="height:'+(n===5001?700:240)+'px"><a href="/x/status/'+n+'" role="link"><time>1h</time></a><p data-testid="tweetText">above '+n+' mutedword</p></article>');c.querySelector("article").addEventListener("click",()=>go("/x/status/"+n));return c}).reverse().forEach((c)=>root.prepend(c));
S.props={list:[...above.map((n)=>({id:"tweet-"+n})),...after]};
},window.__chainDelay===undefined?120:window.__chainDelay)};
render();addEventListener("popstate",render);
</script>`);
const third = `<!doctype html><title>third</title><iframe id="f" src="https://x.com/notifications"></iframe><iframe id="g" src="https://x.com/robots.txt?xm-panel=%2Fnotifications"></iframe>`;

const hits = [];
let entryFails = false;
const server = https.createServer({ key: fs.readFileSync(dir + "/k.pem"), cert: fs.readFileSync(dir + "/c.pem") }, (req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  const url = req.url.split("?")[0];
  if (host !== "x.com") return res.writeHead(200, { "content-type": "text/html" }).end(third);
  hits.push(url);
  if (url === "/i/history" && entryFails) return res.writeHead(503, { "content-type": "text/html" }).end("<!doctype html><h1 id=down>down</h1>");
  if (url === "/favicon.ico") return res.writeHead(204).end();
  if (url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain;charset=utf-8" }).end("User-agent: *\nDisallow: /");
  if (url === "/sw.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(SW);
  res.writeHead(200, { "content-type": "text/html", "x-frame-options": "DENY", ...(url === "/i/history" ? { "content-security-policy": "object-src 'none'; script-src-attr 'none'; img-src \"x\" *" } : {}) });
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
  locale: "zh-CN", // the checks below read the hints in Chinese, what auto gives here
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
check(SAFARI ? "the panel shows X's page through the written entry, despite X-Frame-Options: DENY" : "x.com can frame itself despite X-Frame-Options: DENY", !!f, p.frames().map((x) => x.url()));
if (SAFARI) {
  const csp = await f.evaluate(() => {
    const el = document.createElement("div");
    el.setAttribute("onclick", "window.__attrRan = true");
    el.click();
    return { content: document.head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content, attrRan: !!window.__attrRan };
  });
  check("the written page keeps the policy its response came with, and it applies", csp.content === `object-src 'none'; script-src-attr 'none'; img-src "x" *` && !csp.attrRan, csp);
}
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
const bad = await p.evaluate(async (entry) => { const f = document.createElement("iframe"); f.src = entry + "?xm-panel=" + encodeURIComponent("/\\\\evil.example/p"); document.body.append(f); await new Promise((r) => setTimeout(r, 400)); const out = { path: f.contentWindow.location.pathname, host: f.contentWindow.location.host, shim: f.contentWindow.history.back.toString().includes("go(-1)") }; f.remove(); return out; }, ENTRY);
check("a hostile address is ignored and the page still starts", bad.host === "x.com" && bad.shim, bad);
await railLink("Notifications").click();
await p.waitForTimeout(200);
check("clicking the active icon closes it", !(await panelState()).open);
if (SAFARI) {
  const framedTheme = (scheme) => p.evaluate(async ({ scheme, entry }) => {
    document.documentElement.style.colorScheme = scheme;
    const f = document.createElement("iframe");
    f.src = entry + "?xm-panel=" + encodeURIComponent("/themed");
    document.body.append(f);
    await new Promise((r) => setTimeout(r, 500));
    const w = f.contentWindow, d = f.contentDocument;
    d.cookie = "xm_probe=1; path=/";
    const out = { dark: w.matchMedia("(prefers-color-scheme: dark)").matches, light: w.matchMedia("( prefers-color-scheme: light )").matches, other: w.matchMedia("(min-width: 1px)").matches, cookie: d.cookie, topCookie: document.cookie, bg: d.documentElement.style.backgroundColor, topBg: getComputedStyle(document.body).backgroundColor };
    f.remove();
    document.documentElement.style.colorScheme = "";
    return out;
  }, { scheme, entry: ENTRY });
  const again = await f.evaluate((source) => { const back = history.back; (0, eval)(source); return back === history.back; }, fs.readFileSync(path.join(ext, "panel-frame.js"), "utf8"));
  check("injected again into the same window, as Safari does, the frame isn't set up twice", again);
  const dark = await framedTheme("dark");
  check("a written page takes the feed's dark theme", dark.dark && !dark.light && dark.other && dark.cookie.includes("night_mode=2") && dark.bg === dark.topBg && !dark.topCookie.includes("night_mode"), dark);
  const light = await framedTheme("light");
  check("and its light theme", !light.dark && light.light && light.cookie.includes("night_mode=0"), light);
  const written = await p.evaluate(async (entry) => {
    document.documentElement.style.colorScheme = "dark";
    const f = document.createElement("iframe");
    f.src = entry + "?xm-panel=" + encodeURIComponent("/themed");
    document.body.append(f);
    await new Promise((r) => setTimeout(r, 500));
    const d = f.contentDocument;
    d.cookie = "night_mode=2; path=/";
    await new Promise((r) => setTimeout(r, 150));
    const repeated = document.cookie;
    d.cookie = "night_mode=0; path=/";
    await new Promise((r) => setTimeout(r, 150)); // another frame's write reaches this one a little later
    const out = { repeated, changed: document.cookie, frame: d.cookie, dark: f.contentWindow.matchMedia("(prefers-color-scheme: dark)").matches };
    f.remove();
    document.cookie = "night_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.documentElement.style.colorScheme = "";
    return out;
  }, ENTRY);
  check("X repeating the theme doesn't pin it, a real change is kept and ends the following", !written.repeated.includes("night_mode") && written.changed.includes("night_mode=0") && written.frame.includes("night_mode=0") && !written.frame.includes("night_mode=2") && !written.dark, written);
  const cleared = await p.evaluate(async (entry) => {
    document.cookie = "night_mode=2; path=/";
    document.documentElement.style.colorScheme = "dark";
    const f = document.createElement("iframe");
    f.src = entry + "?xm-panel=" + encodeURIComponent("/themed");
    document.body.append(f);
    await new Promise((r) => setTimeout(r, 500));
    const d = f.contentDocument;
    d.cookie = "night_mode=2; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    await new Promise((r) => setTimeout(r, 150));
    const out = { top: document.cookie, frame: d.cookie };
    // what X does when it moves the cookie to the parent domain
    d.cookie = "night_mode=; Max-Age=0; Path=/";
    d.cookie = "night_mode=2; Max-Age=31536000; Path=/";
    await new Promise((r) => setTimeout(r, 150));
    out.moved = document.cookie;
    out.dark = f.contentWindow.matchMedia("(prefers-color-scheme: dark)").matches;
    f.remove();
    document.documentElement.style.colorScheme = "";
    return out;
  }, ENTRY);
  check("clearing the theme, even with the same value, really clears it and the page keeps the feed's", !cleared.top.includes("night_mode") && cleared.frame.includes("night_mode=2"), cleared);
  check("X moving the cookie doesn't pin the theme", !cleared.moved.includes("night_mode") && cleared.dark, cleared);
  check("the frame's own cookies still reach the site", dark.cookie.includes("xm_probe=1") && dark.topCookie.includes("xm_probe=1"), dark.topCookie);
}
if (SAFARI) {
  entryFails = true;
  const failedFrom = hits.length;
  await railLink("Bookmarks").click();
  await p.waitForTimeout(5200);
  const failed = await p.evaluate(() => { const d = document.querySelector("#xm-panel iframe[data-xm-shown]").contentDocument; return { down: !!d.getElementById("down"), panel: d.documentElement.hasAttribute("data-xm-panel"), entry: d.documentElement.hasAttribute("data-xm-entry") }; });
  check("an entry that keeps failing is tried three times and isn't written in", !failed.down && !failed.panel && !failed.entry && hits.slice(failedFrom).filter((u) => u === "/i/history").length === 3, failed);
  await railLink("Bookmarks").click(); // closes
  entryFails = false;
  await railLink("Bookmarks").click();
  await p.waitForTimeout(800);
  const back = frameOf("/i/bookmarks");
  check("opening it again starts over and shows the page", !!back && (await back.evaluate(() => document.documentElement.hasAttribute("data-xm-panel"))), p.frames().map((x) => x.url()));
  await railLink("Bookmarks").click();
}

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

// ---- what isn't a post stays out of the feed --------------------------------------
const filtered = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  const tweet = (id, content = { promotedMetadata: null }) => ({ id, data: { type: "tweet", content } });
  const junk = [
    { id: "promoted-tweet-9100-5535a724dee09493", data: { type: "tweet", content: { promotedMetadata: { advertiser: "a" } } } },
    { id: "tweet-9101", data: { type: "tweet", content: { promotedMetadata: { advertiser: "a" } } } },
    { id: "header-who-to-follow-1234567890123", data: { type: "ui_moduleHeader" } },
    { id: "who-to-follow-1234567890123-user-1", data: { type: "user", content: {} } },
    { id: "footer-who-to-follow-1234567890123", data: { type: "ui_moduleFooter" } },
    { id: "$divider-bottom-who-to-follow-1234567890123" },
    { id: "trends-1234567890123-trend-1", data: { type: "trend", content: {} } },
    { id: "something-new-1234567890123", data: { type: "someFutureModule", content: {} } },
  ];
  const incoming = [...S.props.list, ...junk.slice(0, 4), tweet("tweet-9102"), ...junk.slice(4), { id: "feedback-9" }, tweet("tweet-9103")];
  S.props = { ...S.props, list: incoming };
  S._scheduleCriticalUpdate();
  const b = document.documentElement;
  const mounted = new Set();
  for (let i = 0; i < 40; i++) {
    window.scrollTo(0, b.scrollHeight);
    await sleep(100);
    for (const id of S._cells.keys()) mounted.add(id);
    if (S._cells.get("tweet-9103")?.getElement()?.hasAttribute("data-xm-placed")) break;
  }
  await sleep(200);
  const ids = S.props.list.map((i) => i.id);
  const out = { inList: junk.filter((j) => ids.includes(j.id)).map((j) => j.id), mounted: junk.filter((j) => mounted.has(j.id)).map((j) => j.id), kept: ids.includes("tweet-9102") && ids.includes("tweet-9103") && ids.includes("feedback-9"), placed: !!S._cells.get("tweet-9103")?.getElement()?.hasAttribute("data-xm-placed") };
  window.scrollTo(0, 0); await sleep(300);
  return out;
});
check("ads and X's modules stay out of the list and are never mounted", filtered.inList.length === 0 && filtered.mounted.length === 0, filtered);
check("posts and untyped items around them stay and get placed", filtered.kept && filtered.placed, filtered);

// ---- a conversation's "show more replies" row -------------------------------------
const gapRow = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.scroller;
  const tweet = (id) => ({ id, data: { type: "tweet", content: { promotedMetadata: null } } });
  const gapId = "home-conversation-8103-gap-8101";
  S.props = { ...S.props, list: [...S.props.list, { id: "impressionPlaceholder-home-conversation-8103", data: { type: "ui_moduleImpressionPlaceholder", content: {} } }, tweet("tweet-8101"), { id: gapId, data: { type: "ui_conversationModuleGap", content: { allTweetIds: ["8101", "8102", "8103"], focalTweetId: "8101" } } }, tweet("tweet-8103")] };
  S._scheduleCriticalUpdate();
  const b = document.documentElement;
  const cell = (id) => S._cells.get(id)?.getElement();
  for (let i = 0; i < 40; i++) { window.scrollTo(0, b.scrollHeight); await sleep(100); if (cell("tweet-8103")?.hasAttribute("data-xm-placed")) break; }
  await sleep(200);
  const at = (id) => { const c = cell(id); const [x, y] = (c ? c.style.translate : "").split(" ").map(parseFloat); return { x, y, h: c && c.offsetHeight, join: c && c.getAttribute("data-xm-join") }; };
  return { head: at("tweet-8101"), gap: at(gapId), tail: at("tweet-8103") };
});
check("the row sits inside its conversation's card, not in a block of its own", gapRow.head.join === "next" && gapRow.gap.join === "prev next" && gapRow.tail.join === "prev" && gapRow.head.x === gapRow.gap.x && gapRow.gap.x === gapRow.tail.x && gapRow.gap.y === gapRow.head.y + gapRow.head.h && gapRow.tail.y === gapRow.gap.y + gapRow.gap.h, gapRow);
await p.locator('[data-xm-board] a[href="/i/status/8101"]').click();
await p.waitForTimeout(400);
const gapOpened = await p.evaluate(() => ({ open: document.documentElement.hasAttribute("data-xm-post-open"), path: location.pathname, frame: document.querySelector("#xm-post iframe")?.contentWindow.location.pathname }));
check("clicking the row opens the post window and stays on the feed", gapOpened.open && gapOpened.path === "/home" && gapOpened.frame === "/i/status/8101", gapOpened);
await p.keyboard.press("Escape");
await p.evaluate(async () => { window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300)); });
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
check("the post is on the left with actions and reply box pinned below, replies on the right", pn.on && pn.focal[0] === 0 && pn.focal[1] === 0 && pn.focal[2] === split && pn.actions[0] === 0 && pn.composer[0] === 0 && pn.bottoms[0] === pn.actions[1] && pn.bottoms[1] === pn.composer[1] && pn.bottoms[2] === pn.h && pn.pc[0] === split, pn);
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
{
  const left = () => postFrameOf().evaluate(() => {
    const q = (s) => document.querySelector(s);
    const f = q("[data-xm-focal]"), a = q("[data-xm-actions]"), c = q("[data-xm-composer]");
    return { focalTop: Math.round(f.getBoundingClientRect().top), focalBottom: Math.round(f.getBoundingClientRect().bottom), scrollTop: f.scrollTop, overflow: getComputedStyle(f).overflowY, articleOverflow: getComputedStyle(f.querySelector("article")).overflowY, actionsTop: Math.round(a.getBoundingClientRect().top), composerTop: Math.round(c.getBoundingClientRect().top), page: scrollY };
  });
  await postFrameOf().evaluate(() => { document.querySelector("[data-xm-focal] article").style.height = "2000px"; window.scrollTo(0, 0); });
  await p.waitForTimeout(200);
  const atTop = await left();
  await p.mouse.move(400, 300);
  await p.mouse.wheel(0, 300);
  await p.waitForTimeout(300);
  const moved = await left();
  check("nothing around the bars clips, which Safari wouldn't draw", atTop.overflow === "visible" && atTop.articleOverflow === "visible", atTop);
  check("the wheel moves a long post under the bars, the replies stay", moved.focalTop === atTop.focalTop - 300 && moved.scrollTop === 0 && moved.actionsTop === atTop.actionsTop && moved.composerTop === atTop.composerTop && moved.page === 0, { atTop, moved });
  const slow = await postFrameOf().evaluate(() => {
    const article = document.querySelector("[data-xm-focal] article");
    const steps = [0.3, 0.3, 0.3, 0.3].map((deltaY) => !article.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true })));
    return { steps, offset: -document.querySelector("[data-xm-focal]").getBoundingClientRect().top };
  });
  check("slow trackpad fractions add up and stay with the post", slow.steps.every(Boolean) && Math.abs(slow.offset - 301.2) < 0.05, slow);
  const overSort = await postFrameOf().evaluate(() => {
    const before = document.querySelector("[data-xm-focal]").getBoundingClientRect().top;
    const taken = !document.querySelector("[data-xm-sort]").dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    return { taken, same: before === document.querySelector("[data-xm-focal]").getBoundingClientRect().top };
  });
  check("the wheel over the sort row goes to the replies, not the post", !overSort.taken && overSort.same, overSort);
  await p.mouse.wheel(0, 99999);
  await p.waitForTimeout(300);
  const end = await left();
  check("it stops with the post's end above the bars", end.focalBottom === end.actionsTop && end.page === 0, end);
  await p.mouse.wheel(0, 300);
  await p.waitForTimeout(300);
  const beyond = await left();
  check("past the end the wheel goes to the replies", beyond.focalBottom === end.focalBottom && beyond.page > 0, beyond);

  await postFrameOf().evaluate(() => { document.querySelector("[data-xm-focal] article").style.height = "300px"; document.querySelector("[data-xm-focal]").scrollTop = 0; window.scrollTo(0, 0); });
  await p.waitForTimeout(200);
  const short = await left();
  check("a post that got shorter comes back into its pane", short.focalTop === 0, short);
}

// ---- the conversation down to a reply, on the left ---------------------------------------
{
  const pane = () => postFrameOf().evaluate(() => {
    const cells = [...document.querySelectorAll("[data-xm-chain]")].map((c) => { const r = c.getBoundingClientRect(); return { text: c.textContent.slice(2, 12), top: Math.round(r.top), bottom: Math.round(r.bottom), left: r.left, width: Math.round(r.width) }; });
    const f = document.querySelector("[data-xm-focal]");
    const r = f && f.getBoundingClientRect();
    const a = document.querySelector("[data-xm-actions]").getBoundingClientRect();
    const reply = [...document.querySelectorAll('[data-testid="cellInnerDiv"]')].find((c) => !c.hasAttribute("data-xm-chain") && !c.hasAttribute("data-xm-focal"));
    const rr = reply && reply.getBoundingClientRect();
    return { cells, focal: f && f.textContent.slice(0, 9), focalTop: r && r.top, focalBottom: r && r.bottom, actionsTop: Math.round(a.top), split: Math.round(a.right), reply: rr && Math.round(rr.left), replyTop: rr && Math.round(rr.top), mid: document.documentElement.hasAttribute("data-xm-has-chain"), page: scrollY, path: location.pathname };
  });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(150);
  // a reply opens with what it answers above it, and stays in the middle as that arrives
  await p.evaluate(() => { const c = document.querySelector("[data-xm-placed] article"); const a = c.querySelector('a[role="link"]'); a.setAttribute("href", "/x/status/5004"); a.querySelector("time").click(); });
  await p.waitForTimeout(60);
  await loadingCleared();
  await p.waitForTimeout(350);
  let c = await pane();
  check("a timestamp opens the post in the window, not on its own", (await postState()).open && (await p.evaluate(() => location.pathname)) === "/home", c.path);
  check("a reply shows everything above it down to itself, root first, on the left", c.mid && c.cells.map((x) => x.text).join() === "above 5001,above 5002,above 5003" && c.cells.every((x, i) => x.left === 0 && x.width === c.split && (!i || x.top === c.cells[i - 1].bottom)) && c.focal.startsWith("post 5004") && Math.abs(c.focalTop - c.cells[2].bottom) <= 1, c);
  check("the clicked post is in full view, once what it answers has arrived", Math.abs(c.focalBottom - c.actionsTop) <= 1, c);
  check("its replies are on the right, from the top", c.reply >= c.split && c.replyTop < 100, c);
  check("a long post above shows in full", c.cells[0].bottom - c.cells[0].top === 700, c.cells);

  // the wheel takes the pane up through the conversation
  await p.mouse.move(400, 300);
  await p.mouse.wheel(0, -120);
  await p.waitForTimeout(150);
  const up = await pane();
  check("the wheel moves the conversation and the post together, the replies stay", Math.abs(up.focalTop - c.focalTop - 120) < 1 && up.cells[0].top === c.cells[0].top + 120 && up.page === 0 && up.actionsTop === c.actionsTop, up);
  const stack = await postFrameOf().evaluate(() => { const a = document.querySelector("[data-xm-actions]").getBoundingClientRect(); const hit = document.elementFromPoint(100, a.top + 5); return { onBar: !!hit.closest("[data-xm-actions]") }; });
  check("what slides down stays under the bars", stack.onBar, stack);

  // clicking a reply in the window: the same layout, one further down
  await postFrameOf().evaluate(() => { window.__chainDelay = 0; });
  await postFrameOf().locator('[data-testid="cellInnerDiv"]:not([data-xm-chain]):not([data-xm-focal]) p').first().click();
  await p.waitForTimeout(250);
  c = await pane();
  check("clicking a reply in the window shows it in full under the whole conversation", c.path === "/x/status/5900" && c.focal.startsWith("post 5900") && c.cells.length === 4 && Math.abs(c.focalBottom - c.actionsTop) <= 1, c);

  // the browser's buttons work on the window
  const tabState = () => p.evaluate(() => ({ path: location.pathname, pops: window.__xPops, post: document.documentElement.hasAttribute("data-xm-post-open"), panel: document.documentElement.hasAttribute("data-xm-panel-open"), frame: document.querySelector("#xm-post iframe").contentWindow.location.pathname, len: history.length }));
  const press = async (way) => { await (way < 0 ? p.goBack({ waitUntil: "commit" }) : p.goForward({ waitUntil: "commit" })); await p.waitForTimeout(250); };
  const popsBefore = (await tabState()).pops;
  await press(-1);
  let tab = await tabState();
  check("back goes to the previous post in the window, the feed doesn't notice", tab.post && tab.path === "/home" && tab.frame === "/x/status/5004" && tab.pops === popsBefore, tab);
  await press(1);
  tab = await tabState();
  check("forward comes back to the reply", tab.post && tab.path === "/home" && tab.frame === "/x/status/5900" && tab.pops === popsBefore, tab);
  await press(1);
  tab = await tabState();
  check("forward with nothing ahead does nothing", tab.post && tab.frame === "/x/status/5900" && tab.pops === popsBefore, tab);
  await press(-1);
  await press(-1);
  tab = await tabState();
  check("back past the first post closes the window", !tab.post && tab.path === "/home" && tab.pops === popsBefore, tab);
  await p.evaluate(() => { const a = document.querySelector('[data-xm-placed] article a[role="link"]'); a.setAttribute("href", "/x/status/5002"); a.querySelector("time").click(); });
  await p.waitForTimeout(300);
  tab = await tabState();
  check("opening another post starts a new past: no way back into the last one", tab.post && tab.frame === "/x/status/5002" && !(await postFrameOf().evaluate(() => window.__xmFrameHistory.canGo(-1))), tab);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(250);
  tab = await tabState();
  check("closing it takes the tab's history back to the feed's own entry", !tab.post && tab.pops === popsBefore && (await p.evaluate(() => !history.state || !history.state.xmGuard)), tab);
  await p.evaluate(() => { const a = document.querySelector('[data-xm-placed] article a[role="link"]'); a.setAttribute("href", "/x/status/5900"); a.querySelector("time").click(); });
  await p.waitForTimeout(350);
  await postFrameOf().evaluate(() => { window.__chainDelay = 0; });
  // clicking up the conversation
  await p.mouse.move(400, 300);
  await p.mouse.wheel(0, -9999);
  await p.waitForTimeout(150);
  await postFrameOf().locator("[data-xm-chain] p").nth(1).click();
  await p.waitForTimeout(250);
  c = await pane();
  check("clicking a post above moves up to it, and the old one's cell goes back to the list", c.path === "/x/status/5002" && c.focal.startsWith("post 5002") && c.cells.length === 1, c);
  const released = await postFrameOf().evaluate(() => [...document.querySelectorAll('[data-testid="cellInnerDiv"]')].filter((e) => e.style.getPropertyValue("top") && !e.hasAttribute("data-xm-chain") && !e.hasAttribute("data-xm-focal")).length);
  check("no cell keeps a position from the pane", released === 0, released);

  // with room for all of it, nothing moves up, and no space is left above it
  await postFrameOf().evaluate(() => { history.replaceState(null, "", "/x/status/5500"); dispatchEvent(new PopStateEvent("popstate", { state: null })); });
  await p.waitForTimeout(200);
  c = await pane();
  check("with room for it all, the conversation starts at the top of the pane", c.cells.length === 1 && c.cells[0].top === 12 && Math.abs(c.focalTop - c.cells[0].bottom) <= 1, c);

  // an article has a second bar under its title
  await postFrameOf().evaluate(() => { history.replaceState(null, "", "/x/status/5600"); dispatchEvent(new PopStateEvent("popstate", { state: null })); });
  await p.waitForTimeout(250);
  const article = await postFrameOf().evaluate(() => {
    const bar = document.querySelector("[data-xm-actions]");
    const compact = document.getElementById("compact");
    const sort = document.querySelector("[data-xm-sort]");
    return { pinned: bar && bar.id, width: bar.offsetWidth, focalWidth: document.querySelector("[data-xm-focal]").offsetWidth, compact: getComputedStyle(compact).display, sort: !!sort && !!sort.querySelector("#sort"), sortLeft: sort && Math.round(sort.getBoundingClientRect().left) };
  });
  check("an article pins its own bar across the pane, hides the other, and its sort row heads the replies", article.pinned === "postbar" && article.width === article.focalWidth && article.compact === "none" && article.sort && article.sortLeft === c.split, article);
  const edge = await postFrameOf().evaluate(() => {
    const focal = document.querySelector("[data-xm-focal]");
    const before = focal.getBoundingClientRect().top;
    const x = focal.offsetWidth - 20;
    const taken = !document.querySelector("[data-xm-chain] article").dispatchEvent(new WheelEvent("wheel", { deltaY: -40, bubbles: true, cancelable: true, clientX: x, clientY: 100 }));
    return { taken, moved: focal.getBoundingClientRect().top - before };
  });
  check("the wheel works across the whole left pane, right up to its edge", edge.taken && Math.abs(edge.moved - 40) < 1, edge);
  const covered = await postFrameOf().evaluate(() => {
    const bar = document.querySelector("[data-xm-actions]").getBoundingClientRect();
    const head = document.getElementById("head");
    const delta = bar.top + 10 - head.getBoundingClientRect().top;
    document.querySelector("[data-xm-chain] article").dispatchEvent(new WheelEvent("wheel", { deltaY: -delta, bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
    const r = head.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 100, bar.top + 12);
    return { headTop: r.top, barTop: bar.top, onBar: !!hit.closest("[data-xm-actions]"), onHead: hit === head };
  });
  check("the post's header slides under the bar, not over it", covered.headTop < covered.barTop + 12 && covered.onBar && !covered.onHead, covered);

  // a post with nothing above stays at the top, as before
  await postFrameOf().evaluate(() => { history.replaceState(null, "", "/x/status/42"); dispatchEvent(new PopStateEvent("popstate", { state: null })); });
  await p.waitForTimeout(200);
  c = await pane();
  check("a post with nothing above it starts at the top of the pane", c.cells.length === 0 && !c.mid && c.focalTop === 0, c);
  await postFrameOf().evaluate(() => { delete window.__chainDelay; });

  // a post in the side panel opens in the same window, over it
  await p.keyboard.press("Escape");
  await p.waitForTimeout(150);
  await railLink("Profile").click();
  await p.waitForTimeout(500);
  await frameOf("/inkks").locator('article p[data-testid="tweetText"]').click();
  await p.waitForTimeout(500);
  const over = await p.evaluate(() => ({ post: document.documentElement.hasAttribute("data-xm-post-open"), panel: document.documentElement.hasAttribute("data-xm-panel-open"), frame: document.querySelector("#xm-post iframe").contentWindow.location.pathname }));
  check("a post clicked in the side panel opens in the post window, with its conversation", over.post && over.panel && over.frame === "/z/status/5003", over);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(150);
  const underneath = await panelState();
  check("Esc goes back to the side panel, then to the feed", underneath.open && !(await postState()).open, underneath);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(250);
  check("and then the feed", !(await panelState()).open);

  // the browser's buttons work on the side panel too
  await railLink("Profile").click();
  await p.waitForTimeout(350);
  const pops0 = await p.evaluate(() => window.__xPops);
  const framePage = () => frameOf("/inkks") || frameOf("/x/status/9");
  await framePage().evaluate(() => { history.pushState(null, "", "/x/status/9"); });
  await p.goBack({ waitUntil: "commit" });
  await p.waitForTimeout(250);
  check("back goes through the side panel's own pages", !!frameOf("/inkks") && (await panelState()).open && (await p.evaluate(() => location.pathname)) === "/home", p.frames().map((x) => x.url()));
  await p.goForward({ waitUntil: "commit" });
  await p.waitForTimeout(250);
  check("forward too", !!frameOf("/x/status/9") && (await panelState()).open, p.frames().map((x) => x.url()));
  await p.goBack({ waitUntil: "commit" });
  await p.waitForTimeout(250);
  await p.goBack({ waitUntil: "commit" });
  await p.waitForTimeout(250);
  const closedByBack = await panelState();
  check("back past its first page closes it, on the feed", !closedByBack.open && closedByBack.path === "/home" && (await p.evaluate(() => window.__xPops)) === pops0, closedByBack);
  await p.goForward({ waitUntil: "commit" }).catch(() => {});
  await p.waitForTimeout(250);
  const forwardAfter = await panelState();
  check("forward afterwards stays on the feed", !forwardAfter.open && forwardAfter.path === "/home", forwardAfter);

  // a quoted post is the window's too
  const quote = p.locator('[data-xm-placed] [data-testid="quote"]').first();
  await quote.scrollIntoViewIfNeeded();
  await quote.locator("time").click();
  await p.waitForTimeout(350);
  const quoted = await p.evaluate(() => ({ open: document.documentElement.hasAttribute("data-xm-post-open"), path: location.pathname, frame: document.querySelector("#xm-post iframe").dataset.xmHref, left: window.__quoteLeft || 0 }));
  check("clicking a quoted post opens it in the post window, and X doesn't go there", quoted.open && quoted.path === "/home" && /^\/quoted\/status\/7\d+$/.test(quoted.frame) && quoted.left === 0, quoted);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(150);
  await quote.locator('[data-testid="tweetPhoto"]').click();
  await p.waitForTimeout(150);
  const photo = await p.evaluate(() => ({ open: document.documentElement.hasAttribute("data-xm-post-open"), left: window.__quoteLeft || 0 }));
  check("a photo in a quoted post is still X's to open", !photo.open && photo.left === 1, photo);
  await p.locator('[data-xm-placed] [data-testid="tweetText"]').nth(3).click();
  await p.waitForTimeout(300);
}
await p.keyboard.press("Escape");
await p.waitForTimeout(200);
check("Esc closes it", !(await postState()).open);
// a post window whose page never arrived loads again, even for the same post
await p.evaluate(() => document.querySelector("#xm-post iframe").contentDocument.documentElement.removeAttribute("data-xm-panel"));
const lostFrom = hits.length;
await p.locator('[data-xm-placed] [data-testid="tweetText"]').nth(3).click();
await p.waitForTimeout(700);
const lostBack = await p.evaluate(() => document.querySelector("#xm-post iframe").contentDocument.documentElement.hasAttribute("data-xm-panel"));
check("reopening the same post after its page was lost loads it again", lostBack && hits.slice(lostFrom).includes("/i/history"), { lostBack, hits: hits.slice(lostFrom) });
await p.keyboard.press("Escape");
await p.waitForTimeout(200);
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
const flow = () => p.evaluate(() => { const b = document.querySelector("[data-xm-board]"); const cards = [...document.querySelectorAll("[data-xm-placed]")].map((c) => { const [x, y] = c.style.translate.split(" ").map(parseFloat); return { x, y, h: c.offsetHeight, w: c.offsetWidth }; }); return { attr: document.documentElement.getAttribute("data-xm-flow"), pos: getComputedStyle(b).position, sl: b.scrollLeft, sw: b.scrollWidth, cw: b.clientWidth, ch: b.clientHeight, docY: window.scrollY, doc: document.documentElement.scrollHeight, cells: b.children.length, cards, list: window.scroller.props.list.length, title: document.querySelector("#xm-flow-btn").title }; });
let fl = await flow();
const colXs = [...new Set(fl.cards.map((c) => c.x))].sort((a, b) => a - b);
const fits = fl.cards.every((c) => c.y + c.h <= fl.ch);
const overlaps = (() => { const byX = {}; for (const c of fl.cards) (byX[c.x] = byX[c.x] || []).push(c); return Object.values(byX).some((a) => a.sort((m, n) => m.y - n.y).some((c, i) => i && c.y < a[i - 1].y + a[i - 1].h)); })();
check("clicking it doesn't reach X's Grok button", (await p.evaluate(() => window.__grokClicks || 0)) === 0);
check("switching lays cards out in screen-high columns, scrolling sideways", fl.attr === "h" && fl.pos === "fixed" && colXs.length >= 2 && fits && !overlaps && fl.sw > fl.cw && fl.title === "切换到纵向流", { attr: fl.attr, pos: fl.pos, colXs, fits, overlaps, sw: fl.sw, cw: fl.cw, doc: fl.doc });
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
check("switching back gives the vertical masonry", fl.attr === null && fl.pos !== "fixed" && backXs.size === 4 && fl.sl === 0 && fl.docY > 0, { attr: fl.attr, pos: fl.pos, cols: backXs.size, docY: fl.docY });
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

// ---- settings ----------------------------------------------------------------------------
{
  await p.goto("https://x.com/home");
  await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
  await p.waitForTimeout(300);
  // An unpacked extension's id is made from its path.
  const realExt = fs.realpathSync(ext);
  const extId = createHash("sha256").update(realExt).digest("hex").slice(0, 32).replace(/./g, (h) => String.fromCharCode(97 + parseInt(h, 16)));
  // Chrome only promises the order inside one entry. Across entries, panel-frame.js has run
  // before common.js on real pages, which left frames on the entry page in one column.
  const needs = { "__xmCommon": "common.js", "__xmI18n": "i18n.js" };
  const unordered = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8")).content_scripts.flatMap((e) =>
    e.js.flatMap((name, i) => Object.entries(needs).filter(([global, file]) => name !== file && fs.readFileSync(path.join(ext, name), "utf8").includes(`window.${global}`) && !e.js.slice(0, i).includes(file)).map(([, file]) => `${name} needs ${file}`)),
  );
  check("every script lists what it needs ahead of it in its own entry", unordered.length === 0, unordered);

  if (!SAFARI) {
    const scripts = JSON.parse(fs.readFileSync(path.join(built, "manifest.json"), "utf8")).content_scripts.flatMap((e) => e.js);
    const written = scripts.filter((name) => fs.readFileSync(path.join(built, name), "utf8").includes("document.write"));
    check("this build loads no script that writes a fetched page", !scripts.includes("safari-entry.js") && written.length === 0, { scripts, written });
  }
  const popup = await ctx.newPage();
  popup.on("pageerror", (e) => errors.push("popup: " + e));
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForTimeout(200);
  const stored = () => popup.evaluate(async () => (await chrome.storage.local.get("settings")).settings);
  const on = (name, value) => popup.locator(`input[name="${name}"][value="${value}"]`).check({ force: true });
  const shown = await popup.evaluate(() => ({ flow: document.querySelector('input[name="flow"]:checked')?.value, theme: document.querySelector('input[name="theme"]:checked')?.value, panel: document.querySelector('input[name="panel"]:checked')?.value, w: document.body.offsetWidth }));
  check("the popup opens with the defaults", shown.flow === "v" && shown.theme === "auto" && shown.panel === "sheet" && shown.w === 320, shown);

  // language: follows the browser until one is chosen, and the page's hints go along at once
  const popupWords = () => popup.evaluate(() => ({ lang: document.documentElement.lang, box: document.querySelector("#lang").value, mute: document.querySelector('[data-i18n="mute"]').textContent, tip: document.querySelector("#mute").placeholder, option: document.querySelector('#cols option[value="0"]').textContent, blank: [...document.querySelectorAll("[data-i18n]")].filter((e) => !e.textContent).map((e) => e.dataset.i18n) }));
  const hints = () => p.evaluate(() => ({ nav: document.querySelector("#xm-nav-btn").dataset.tip, flow: document.querySelector("#xm-flow-btn").title, tabs: document.querySelector("#xm-tabs-btn").getAttribute("aria-label") }));
  const picked = await popup.evaluate(() => ({ zhTW: __xmI18n.resolve("auto", ["zh-TW"]), jaJP: __xmI18n.resolve("auto", ["ja-JP", "en"]), en: __xmI18n.resolve("auto", ["en-GB"]), second: __xmI18n.resolve("auto", ["de", "ja"]), none: __xmI18n.resolve("auto", ["de", "fr"]), chosen: __xmI18n.resolve("ja", ["zh-CN"]) }));
  check("auto takes the first browser language it has, else English, and a choice wins", picked.zhTW === "zh" && picked.jaJP === "ja" && picked.en === "en" && picked.second === "ja" && picked.none === "en" && picked.chosen === "ja", picked);
  const zhWords = await popupWords();
  check("on a Chinese browser the popup starts in Chinese, on the auto setting", zhWords.lang === "zh" && zhWords.box === "auto" && zhWords.mute === "屏蔽词" && zhWords.option === "自动" && zhWords.blank.length === 0, zhWords);
  await popup.locator("#lang").selectOption("en");
  await p.waitForTimeout(800);
  const enWords = await popupWords();
  const enHints = await hints();
  check("choosing English changes the popup", enWords.lang === "en" && enWords.mute === "Muted words" && enWords.tip.startsWith("One per line") && enWords.option === "Auto" && (await stored()).lang === "en", enWords);
  check("and the page's hints, without a reload", enHints.nav === "Expand sidebar" && enHints.flow === "Switch to sideways flow" && enHints.tabs === "Timelines", enHints);
  await popup.locator("#lang").selectOption("ja");
  await p.waitForTimeout(800);
  const jaWords = await popupWords();
  const jaHints = await hints();
  check("Japanese too", jaWords.lang === "ja" && jaWords.mute === "ミュートワード" && jaHints.nav === "サイドバーを開く" && jaHints.flow === "横スクロールに切り替え", { jaWords, jaHints });
  await popup.locator("#lang").selectOption("auto");
  await p.waitForTimeout(800);
  const backHints = await hints();
  check("back to auto follows the browser again", backHints.nav === "展开侧边栏" && (await popupWords()).mute === "屏蔽词" && (await stored()).lang === "auto", backHints);
  await p.bringToFront();

  // default flow: live, and what a reload goes back to
  await on("flow", "h");
  await p.waitForTimeout(300);
  check("choosing the sideways default changes an open feed", (await p.evaluate(() => document.documentElement.getAttribute("data-xm-flow"))) === "h");
  await p.reload();
  await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
  await p.waitForTimeout(200);
  check("and a new load starts that way", await p.evaluate(() => window.__onAtHead !== undefined && document.documentElement.getAttribute("data-xm-flow") === "h"));
  await p.locator("#xm-flow-btn").click();
  await p.waitForTimeout(300);
  check("the page's switch still flips it", (await p.evaluate(() => document.documentElement.getAttribute("data-xm-flow"))) === null);
  await p.reload();
  await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
  check("but a reload goes back to the default", (await p.evaluate(() => document.documentElement.getAttribute("data-xm-flow"))) === "h");
  await on("flow", "v");
  await p.waitForTimeout(400);

  // muted words: in the feed, then out again
  const victim = await p.evaluate(() => { const c = [...document.querySelectorAll("[data-xm-placed]")].filter((e) => e.querySelector("article") && !e.hasAttribute("data-xm-join"))[2]; c.id = "victim"; return c.querySelector('[data-testid="tweetText"]').textContent; });
  const seenMuted = () => p.evaluate(() => { const c = document.getElementById("victim"); return c ? { hidden: c.hasAttribute("data-xm-muted"), display: getComputedStyle(c).display, h: c.offsetHeight } : null; });
  await popup.locator("#mute").fill(victim.toUpperCase() + "，unrelated\n ");
  await p.waitForTimeout(1600);
  const muted = await seenMuted();
  check("a muted word hides the post whatever its case, and the column closes up", muted && muted.hidden && muted.display === "none" && muted.h === 0, muted);
  const sameSpot = await p.evaluate(() => { const cards = [...document.querySelectorAll("[data-xm-placed]")].filter((e) => e.offsetHeight > 0).map((e) => { const [x, y] = e.style.translate.split(" ").map(parseFloat); return { x, y, h: e.offsetHeight }; }); const byX = {}; for (const c of cards) (byX[c.x] = byX[c.x] || []).push(c); return Object.values(byX).every((col) => col.sort((a, b) => a.y - b.y).every((c, i) => !i || c.y - (col[i - 1].y + col[i - 1].h) <= 12)); });
  check("no gap is left where it was", sameSpot);
  const words = (await stored()).mute;
  check("words can be split by newlines and commas", words.length === 2 && words[1] === "unrelated", words);
  await popup.locator("#mute").fill("");
  await p.waitForTimeout(1600);
  const unmuted = await seenMuted();
  check("clearing the word brings it back", unmuted && !unmuted.hidden && unmuted.h > 0, unmuted);
  // a card muted while out of the mounted range also comes back
  await popup.locator("#mute").fill("post tweet-");
  await p.waitForTimeout(1500);
  const allGone = await p.evaluate(() => [...document.querySelectorAll("[data-xm-board] > div")].filter((c) => c.offsetHeight > 0 && c.querySelector("article")).length);
  await popup.locator("#mute").fill("");
  await p.waitForTimeout(1800);
  const allBack = await p.evaluate(() => [...document.querySelectorAll("[data-xm-placed]")].filter((c) => c.offsetHeight > 0).length);
  check("muting nearly everything and then nothing fills the feed again", allGone === 0 && allBack > 4, { allGone, allBack });

  // muted words in the post window: replies go, the conversation above doesn't
  await on("flow", "v");
  await popup.locator("#mute").fill("mutedword");
  await p.waitForTimeout(800);
  await p.evaluate(() => { const a = document.querySelector('[data-xm-placed] article a[role="link"]'); a.setAttribute("href", "/x/status/5003"); a.querySelector("time").click(); });
  await p.waitForTimeout(800);
  const inWindow = await postFrameOf().evaluate(() => { const cells = [...document.querySelectorAll('[data-testid="cellInnerDiv"]')]; return { chain: cells.filter((c) => c.hasAttribute("data-xm-chain") && c.offsetHeight > 0).length, reply: cells.filter((c) => c.textContent.includes("reply with")).map((c) => c.offsetHeight), other: cells.filter((c) => c.textContent.includes("reply 5900")).map((c) => c.offsetHeight) }; });
  check("in the post window a muted reply goes, what the post answers stays", inWindow.chain === 2 && inWindow.reply[0] === 0 && inWindow.other[0] === 120, inWindow);
  await p.keyboard.press("Escape");
  await popup.locator("#mute").fill("");
  await p.waitForTimeout(800);

  // theme: X only reads it starting up, so pages reload, and the real cookie stays
  const themeOf = (page) => page.evaluate(() => ({ attr: document.documentElement.getAttribute("data-xm-theme"), dark: matchMedia("(prefers-color-scheme: dark)").matches, light: matchMedia("(prefers-color-scheme: light)").matches, cookie: document.cookie, bg: getComputedStyle(document.body).backgroundColor, id: window.__xmLoadMark }));
  await p.evaluate(() => { window.__xmLoadMark = 1; });
  await on("theme", "light");
  await p.waitForTimeout(800);
  await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
  let th = await themeOf(p);
  check("choosing white reloads the page and shows it white", th.id === undefined && th.attr === "light" && th.light && !th.dark && th.cookie.includes("night_mode=0") && th.bg === "rgb(255, 255, 255)", th);
  const realCookie = await ctx.cookies("https://x.com");
  check("without touching the real cookie", !realCookie.some((c) => c.name === "night_mode"), realCookie.map((c) => c.name));
  const pinCheck = await p.evaluate(() => { document.cookie = "night_mode=0; path=/"; document.cookie = "night_mode=; Max-Age=0; path=/"; document.cookie = "night_mode=0; Max-Age=999; path=/"; return document.cookie; });
  const stillNone = await ctx.cookies("https://x.com");
  check("and X writing back what it read doesn't pin it", pinCheck.includes("night_mode=0") && !stillNone.some((c) => c.name === "night_mode"), stillNone.map((c) => c.name));
  await railLink("Notifications").click();
  await p.waitForTimeout(700);
  const frameTheme = await themeOf(frameOf("/notifications"));
  check("the side panel has the same theme", frameTheme.attr === "light" && frameTheme.light && frameTheme.bg === "rgb(255, 255, 255)", frameTheme);
  await p.keyboard.press("Escape");
  await on("theme", "dark");
  await p.waitForTimeout(800);
  await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
  th = await themeOf(p);
  check("and black", th.attr === "dark" && th.dark && th.cookie.includes("night_mode=2"), th);
  await on("theme", "auto");
  await p.waitForTimeout(800);
  await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
  th = await themeOf(p);
  check("following X again leaves no trace", th.attr === null && !th.cookie.includes("night_mode"), th);

  // the rail's links
  await on("panel", "same");
  await p.waitForTimeout(250);
  await railLink("Notifications").click();
  await p.waitForTimeout(500);
  const jumped = await p.evaluate(() => ({ path: location.pathname, panel: document.documentElement.hasAttribute("data-xm-panel-open") }));
  check("set to jump, a rail link leaves the feed like X's own", jumped.path === "/notifications" && !jumped.panel, jumped);
  await p.goto("https://x.com/home");
  await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
  await on("panel", "tab");
  await p.waitForTimeout(250);
  const before = ctx.pages().length;
  await railLink("Bookmarks").click();
  await p.waitForTimeout(500);
  const opened = ctx.pages().slice(before);
  const tabState = { added: opened.length, url: opened[0] && opened[0].url(), path: await p.evaluate(() => location.pathname), panel: await p.evaluate(() => document.documentElement.hasAttribute("data-xm-panel-open")) };
  check("set to a new tab, it opens there and the feed stays", tabState.added === 1 && tabState.url === "https://x.com/i/bookmarks" && tabState.path === "/home" && !tabState.panel, tabState);
  for (const extra of opened) await extra.close();
  await railLink("Bookmarks").click({ noWaitAfter: true }).catch(() => {});
  await p.waitForTimeout(300);
  for (const extra of ctx.pages().slice(before)) await extra.close();
  await on("panel", "sheet");
  await p.waitForTimeout(250);
  await railLink("Bookmarks").click();
  await p.waitForTimeout(400);
  check("and back to the side panel", (await panelState()).open);
  await on("panel", "same");
  await p.waitForTimeout(250);
  check("changing away closes an open one", !(await panelState()).open);
  await on("panel", "sheet");

  // how long a hidden page keeps its state
  await railLink("Notifications").click();
  await p.waitForTimeout(500);
  await frameOf("/notifications").evaluate(() => { window.__keptMark = 1; });
  await p.mouse.click(1400, 400);
  await p.waitForTimeout(200);
  await railLink("Notifications").click();
  await p.waitForTimeout(250);
  check("by default a hidden page comes back as it was", (await frameOf("/notifications").evaluate(() => window.__keptMark)) === 1);
  await p.mouse.click(1400, 400);
  await p.waitForTimeout(200);
  await popup.locator("#panelKeep").selectOption("5");
  await p.waitForTimeout(250);
  await railLink("Notifications").click();
  await p.waitForTimeout(250);
  check("with a time set, it still does inside that time", (await frameOf("/notifications").evaluate(() => window.__keptMark)) === 1);
  await p.mouse.click(1400, 400);
  await p.waitForTimeout(200);
  await p.evaluate(() => { for (const f of document.querySelectorAll("#xm-panel iframe")) f.__xmHiddenAt -= 6 * 60000; });
  await railLink("Notifications").click();
  await p.waitForTimeout(700);
  const fresh = await frameOf("/notifications").evaluate(() => ({ mark: window.__keptMark, panel: document.documentElement.hasAttribute("data-xm-panel") }));
  check("past it, the page starts over", fresh.mark === undefined && fresh.panel, fresh);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  await p.evaluate(() => { const a = document.querySelector('[data-xm-placed] article a[role="link"]'); a.setAttribute("href", "/x/status/42"); a.querySelector("time").click(); });
  await p.waitForTimeout(600);
  await postFrameOf().evaluate(() => { window.__keptMark = 1; });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  const reopenPost = () => p.evaluate(() => document.querySelector('[data-xm-placed] article a[role="link"][href="/x/status/42"] time').click());
  await reopenPost();
  await p.waitForTimeout(300);
  check("the same post reopened inside the time is as it was", (await postFrameOf().evaluate(() => window.__keptMark)) === 1);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  await p.evaluate(() => { const now = Date.now; Date.now = () => now() + 6 * 60000; });
  await reopenPost();
  await p.waitForTimeout(800);
  const freshPost = await postFrameOf().evaluate(() => ({ mark: window.__keptMark, path: location.pathname }));
  check("and past it, the post window loads again", freshPost.mark === undefined && freshPost.path === "/x/status/42", freshPost);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  await popup.locator("#panelKeep").selectOption("0");
  await p.goto("https://x.com/home");
  await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });

  // columns: the popup and Alt keys say the same thing
  await popup.locator("#cols").selectOption("2");
  await p.waitForTimeout(400);
  const colCount = () => p.evaluate(() => new Set([...document.querySelectorAll("[data-xm-placed]")].map((c) => c.style.translate.split(" ")[0])).size);
  check("the column count applies at once", (await colCount()) === 2, await colCount());
  await p.bringToFront();
  await p.keyboard.press("Alt+Equal");
  await p.waitForTimeout(400);
  check("Alt + = goes through to the setting", (await colCount()) === 3 && (await stored()).cols === 3, (await stored()).cols);
  await p.keyboard.press("Alt+Digit0");
  await p.waitForTimeout(300);

  // what the old keys had stored becomes the default, once
  await popup.evaluate(() => chrome.storage.local.remove("settings"));
  await p.evaluate(() => { localStorage.removeItem("xm-settings"); localStorage.setItem("xm-flow", "h"); localStorage.setItem("xm-cols", "5"); });
  await p.reload();
  await p.waitForSelector("[data-xm-placed]", { timeout: 5000 });
  await p.waitForTimeout(300);
  const seeded = await p.evaluate(() => ({ flow: document.documentElement.getAttribute("data-xm-flow"), oldFlow: localStorage.getItem("xm-flow"), oldCols: localStorage.getItem("xm-cols") }));
  const seededStore = await stored();
  check("what the old switch had stored becomes the default", seeded.flow === "h" && !seeded.oldFlow && !seeded.oldCols && seededStore.flow === "h" && seededStore.cols === 5, { seeded, seededStore });
  await popup.evaluate(() => chrome.storage.local.set({ settings: {} }));
  await popup.close();
  await p.waitForTimeout(300);
}

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
const framed = q.frames().find((x) => new URL(x.url()).pathname === "/notifications") || q.frames().find((x) => x !== q.mainFrame() && !x.url().includes("robots"));
const frameUrl = framed ? framed.url() : null;
check("a third-party page still can't frame x.com", frameUrl !== "https://x.com/notifications", { frameUrl, served: hits.length - before3 });

const robots = q.frames().find((x) => x.url().includes("robots.txt"));
const robotsText = robots ? await robots.evaluate(() => document.body.textContent) : null;
check("a third-party page framing the Safari entry gets robots.txt, not X's page", /User-agent/.test(robotsText || "") && !hits.slice(before3).includes("/i/history"), { robotsText, served: hits.slice(before3) });

check("no page errors", errors.length === 0, errors.slice(0, 3));
await ctx.close();
server.close();
fs.rmSync(dir, { recursive: true, force: true });
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED of ${results.length}` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
