# mltx privacy policy

Last updated: 2026-11-05

mltx is a browser extension that changes how x.com looks in your browser. It has no
servers, no accounts, no analytics and no ads. The developer receives none of your data.

## What it reads

While you use x.com, mltx reads the page in your browser to lay it out. It reads the text,
author and link card of posts to compare them with your muted words. This happens on your
device, and the result only decides whether a post is shown.

## What it stores

Your settings are the muted words, default flow, theme, side panel behaviour, side panel
refresh time, column count and language. They are stored in two places on your device:

- **The extension's local storage.** Only the extension can read it.
- **x.com's `localStorage`, under `xm-settings`.** The sidebar's open state is there too,
  under `xm-nav`. mltx puts them there so the page can apply them while it loads. Because
  this storage belongs to x.com, X's own scripts on that site are able to read it, muted
  words included.

Removing the extension deletes its local storage. The `x.com` entries stay until you clear
that site's data in your browser.

## What it sends

The extension sends nothing to the developer or to any third party. Side panels and the
post window show X's own pages in frames, so your browser requests those pages from X just
as it does when you open them yourself. X's privacy policy covers those requests.

## What it changes

On x.com pages framed by x.com, mltx removes the `X-Frame-Options` response header so the
side panels and post window can load. It does not do this for any other site or any other
kind of request. If you choose a black or white theme, the page is shown a `night_mode`
cookie and a colour scheme preference that match it. The real cookie stays as it was.

## Chrome Web Store limited use

The use of information received from Google APIs will adhere to the Chrome Web Store User
Data Policy, including the Limited Use requirements. mltx does not sell user data, transfer
it to anyone, use it for advertising, or use it for anything other than the features
described here.

## Contact

Questions go to the issues page: <https://github.com/dreaifekks/mltx/issues>

---

# mltx 隐私政策

最后更新：2026-11-05

mltx 是一个只改变 x.com 在你浏览器里显示方式的扩展。它没有服务器、账号、统计或广告，开发者
收不到你的任何数据。

**读取的内容。** 为了排版，mltx 会在你的浏览器里读取 x.com 页面，并读取帖子的正文、作者和
链接卡片，与你设置的屏蔽词比较。这些都在你的设备上完成，结果只决定帖子是否显示。

**保存的内容。** 设置包括屏蔽词、默认流向、主题、侧边面板行为、面板刷新时间、列数和语言，都保存在
你的设备上。一份在扩展自己的存储里，只有扩展能读取。另一份在 x.com 的 `localStorage` 里
（`xm-settings`，侧栏展开状态在 `xm-nav`），这样页面加载时就能用上。这部分存储属于 x.com，
所以 X 自己的脚本能够读到，包括屏蔽词。卸载扩展会删除扩展存储，x.com 上的条目要在浏览器里
清除该网站数据才会消失。

**发送的内容。** 扩展不向开发者或任何第三方发送数据。侧边面板和帖子浮窗在 frame 中显示 X
自己的页面，这些请求由浏览器发给 X，与你直接打开这些页面相同，受 X 的隐私政策约束。

**改动的内容。** 仅对被 x.com 嵌入的 x.com 页面，mltx 会移除 `X-Frame-Options` 响应头，让
面板和浮窗能够加载，其他网站和其他类型的请求不受影响。选择黑色或白色主题时，页面看到的是与
主题一致的 `night_mode` cookie 和配色偏好，真实 cookie 不变。

**Chrome 网上应用店有限使用声明。** 对从 Google API 获得的信息的使用将遵守 Chrome Web Store
User Data Policy，包括其中的 Limited Use 要求。mltx 不出售、不转让用户数据，也不把它用于广告
或这里说明的功能以外的用途。

**联系方式。** 问题请提交到 <https://github.com/dreaifekks/mltx/issues>
