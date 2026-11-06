# Chrome 应用商店申请参考（mltx 0.4.1）

按开发者后台的标签页顺序排列。代码块里的内容可以直接粘贴，其他是填写说明。这份文件不会打进扩展包。

## 提交前

- [x] 在前台确认帖子浮窗和左栏面板不再显示“历史”页。
- [ ] 把 `PRIVACY.md` 推到 `master`，否则隐私政策链接打不开。

## 上传包

上传 `mltx-0.4.1-chrome.zip`。发布后从 v0.4.1 的 GitHub Release 下载，发布前可以用 `packages/` 里的同名文件。

不要提交 0.4.0，它的侧边面板和帖子浮窗可能显示错误页面。也不要手动压缩 `dist/chrome`，Chrome 加载后会在里面生成 `_metadata`，商店会拒收。

## 商品详情（Store listing）

- **语言：** 默认语言是英文，再添加简体中文和日文。摘要会从 `_locales` 自动读取，三种语言的描述分别粘贴下面的内容。
- **类别：** 选 Social Networking。如果没有这一项，选 Functionality & UI。
- **主页和支持链接：** `https://github.com/dreaifekks/mltx`
- **图片：** 都在 `store/upload/`，都是 PNG。截图和宣传图没有透明通道，图标的透明是允许的。

| 后台栏位 | 文件 | 尺寸 |
|---|---|---|
| 商店图标（Store icon），三种语言共用 | `icon-128.png` | 128x128 |
| 截图（Screenshots），每种语言 2 张 | `<语言>/screenshot-1-masonry-1280x800.png`、`<语言>/screenshot-2-settings-1280x800.png` | 1280x800 |
| 小型宣传图（Small promo tile），必填 | `<语言>/promo-small-440x280.png` | 440x280 |
| 顶部宣传图（Marquee promo tile），可选 | 没有 | 1400x560 |

`<语言>` 是 `zh`、`en`、`ja`。瀑布流截图三种语言共用一张，里面 X 的数字是中文界面的写法，比如「6.7万」。横向流、帖子浮窗和侧边面板的截图还没有，要补拍的话注意遮挡别人的帖子和你的账号信息。

### 描述：英文

```
Turns the x.com home timeline into a window-filling masonry, so a wide screen shows more
posts at once.

· Masonry: the column count follows the window, up to 4, or set it by hand. A sideways flow
  is available too.
· Post window: a post opens in a floating window, with the conversation on the left and the
  replies on the right. Your place in the timeline is kept.
· Side panels: the sidebar's links open in a panel over the feed, and come back as you left
  them.
· Muted words: hide posts by their text, author or link card.
· A cleaner feed: removes ads, Who to follow, trends and other non-post modules, and the
  post box on the timeline.
· Theme: follow X, or stay black or white.
· Language: English, Chinese or Japanese, following your browser until you choose.

Everything happens in your browser. mltx has no servers and neither collects nor sends data.

mltx depends on X's page structure. If a change at X stops it from attaching, the page falls
back to X's normal layout. mltx is an independent project, not affiliated with or endorsed
by X Corp.
```

### 描述：简体中文

```
把 x.com 首页时间线改成铺满窗口的多列瀑布流，宽屏上一次能看到更多帖子。

· 瀑布流：列数随窗口自动调整，最多 4 列，也可以手动设置。也支持横向滚动的流向。
· 帖子浮窗：点帖子在浮窗里打开，左边是对话，右边是回复，时间线的位置不会丢。
· 侧边面板：左栏链接在时间线上方的面板里打开，再点图标可以回到之前的状态。
· 屏蔽词：隐藏正文、作者或链接卡片包含这些词的帖子。
· 清爽的时间线：去掉广告、推荐关注、趋势等非帖子模块，以及时间线上的发帖框。
· 主题：跟随 X，或者固定为黑色或白色。
· 语言：中文、英文或日文，默认跟随浏览器，也可以手动选择。

所有处理都在你的浏览器里完成。mltx 没有服务器，不收集也不发送任何数据。

mltx 依赖 X 的页面结构。如果 X 改版导致无法接管，页面会自动退回 X 原本的布局。
mltx 是独立项目，与 X Corp. 没有关联，也未获得其认可。
```

### 描述：日文

```
x.com のホームタイムラインをウィンドウいっぱいのマソンリーレイアウトにし、ワイド画面で一度により多くの投稿を表示します。

・マソンリー：列数はウィンドウに合わせて最大 4 列まで自動で調整され、手動でも設定できます。横スクロールにも対応しています。
・投稿ウィンドウ：投稿をフローティングウィンドウで開き、左に会話、右に返信を表示します。タイムラインの位置は保たれます。
・サイドパネル：サイドバーのリンクをフィードの上のパネルで開き、もう一度開くと前の状態に戻ります。
・ミュートワード：本文、投稿者、リンクカードに含まれる語で投稿を非表示にします。
・すっきりしたフィード：広告、おすすめユーザー、トレンドなど投稿以外のモジュールと、タイムライン上の投稿欄を取り除きます。
・テーマ：X に合わせるか、黒または白に固定できます。
・言語：日本語、英語、中国語に対応し、選択するまではブラウザの言語に従います。

処理はすべてブラウザ内で行われます。mltx にサーバーはなく、データの収集も送信も行いません。

mltx は X のページ構造に依存しています。X の変更により動作できなくなった場合、ページは X 本来のレイアウトに戻ります。
mltx は独立したプロジェクトであり、X Corp. とは提携しておらず、承認も受けていません。
```

## 隐私（Privacy）

### 单一用途（Single purpose）

```
Re-lays out the x.com home timeline as a multi-column masonry and adjusts how X's pages
are displayed around it. It only acts on x.com.
```

### 权限理由（Permission justification）

**declarativeNetRequestWithHostAccess**

```
The side panels and post window show X's own pages in iframes on x.com, and X sends
X-Frame-Options on them. One static rule in frame-rules.json removes that header, only for
sub_frame requests to x.com initiated by x.com. Third-party sites still cannot frame x.com.
```

**storage**

```
Stores the user's settings locally: muted words, default flow, theme, side panel behaviour,
side panel refresh time, column count and language. Nothing is synced or sent anywhere.
```

**Host permission `https://x.com/*`**

```
The extension's content scripts need to run on x.com to re-lay out the timeline, and the
frame rule above needs host access to x.com. It requests no other site.
```

### 远程代码（Remote code）

选 **No, I am not using remote code**。所有 JavaScript 都在包内，Chrome 包也不再含 Safari 的页面写入代码。

### 数据使用（Data usage）

数据类型只勾 **Website content**，其他不勾。mltx 会在本地读取帖子文字来匹配屏蔽词，而 Chrome 的政策把纯本地处理也算作处理用户数据。

下面三项声明全部勾选：

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### 隐私政策链接（Privacy policy）

```
https://github.com/dreaifekks/mltx/blob/master/PRIVACY.md
```


## 测试说明（Test instructions）

不需要提供专门的测试账号，审核员用任意 X 账号登录就能测。

```
Testing needs a signed-in x.com account, because the home timeline requires login. Any
account works; nothing is tied to a particular one.

1. Sign in at https://x.com/home in a window at least 900px wide. The timeline becomes
   a multi-column masonry.
2. Click a post. It opens in a floating window. Click outside it or press Esc to close.
3. Click a sidebar link such as Search. It opens in a panel over the feed.
4. Click the toolbar icon to open the settings. Add a muted word and matching posts disappear.

Note for review: frame-rules.json removes X-Frame-Options only for x.com frames initiated by
x.com. This is what lets steps 2 and 3 show X's own pages. A third-party page still cannot
frame x.com.
```
