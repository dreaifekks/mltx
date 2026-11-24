// The words the extension itself shows: the settings and the hints on its buttons. Loaded in
// the popup, and in the page's own world beside masonry.js. chrome.i18n won't do for these:
// that world can't reach it, and it can't follow the language setting. _locales only holds
// what the manifest shows.
globalThis.__xmI18n = (() => {
  const STRINGS = {
    zh: {
      mute: "屏蔽词",
      mutePlaceholder: "每行一个，也可以用逗号分开",
      muteHint: "正文、作者或链接卡片含这些词的帖子不显示，不分大小写。你点开的帖子和它的上文不受影响。",
      flow: "默认流向",
      flowV: "竖向",
      flowH: "横向",
      theme: "主题",
      themeAuto: "跟随 X",
      themeDark: "黑色",
      themeLight: "白色",
      themeNote: "切换主题时，打开的 X 页面会自动刷新。",
      panel: "左栏链接",
      panelSheet: "侧边面板",
      panelSame: "当前页跳转",
      panelTab: "新标签页",
      panelKeep: "侧边面板内容刷新时间",
      keep0: "不刷新",
      keep1: "1 分钟",
      keep5: "5 分钟",
      keep15: "15 分钟",
      keep30: "30 分钟",
      keep60: "1 小时",
      cols: "列数",
      colsAuto: "自动",
      lang: "语言",
      langAuto: "跟随浏览器",
      navExpand: "展开侧边栏",
      navCollapse: "收起侧边栏",
      flowToVertical: "切换到纵向流",
      flowToSideways: "切换到横向流",
      timelines: "时间线",
      whatsNew: "更新内容",
      whatsNewTitle: "v{v} 更新内容",
      close: "关闭",
    },
    en: {
      mute: "Muted words",
      mutePlaceholder: "One per line, or separated by commas",
      muteHint: "Hides posts with these words in their text, author or link card, ignoring case. The post you open and what it answers always show.",
      flow: "Default flow",
      flowV: "Vertical",
      flowH: "Sideways",
      theme: "Theme",
      themeAuto: "Follow X",
      themeDark: "Black",
      themeLight: "White",
      themeNote: "Open X pages reload when the theme changes.",
      panel: "Sidebar links",
      panelSheet: "Side panel",
      panelSame: "Same tab",
      panelTab: "New tab",
      panelKeep: "Side panel refresh time",
      keep0: "Never",
      keep1: "1 minute",
      keep5: "5 minutes",
      keep15: "15 minutes",
      keep30: "30 minutes",
      keep60: "1 hour",
      cols: "Columns",
      colsAuto: "Auto",
      lang: "Language",
      langAuto: "Follow browser",
      navExpand: "Expand sidebar",
      navCollapse: "Collapse sidebar",
      flowToVertical: "Switch to vertical flow",
      flowToSideways: "Switch to sideways flow",
      timelines: "Timelines",
      whatsNew: "What's new",
      whatsNewTitle: "What's new in v{v}",
      close: "Close",
    },
    ja: {
      mute: "ミュートワード",
      mutePlaceholder: "1 行に 1 語、またはカンマ区切り",
      muteHint: "本文、投稿者、リンクカードにこれらの語を含む投稿を非表示にします。大文字と小文字は区別しません。開いた投稿とその返信先は常に表示されます。",
      flow: "デフォルトの向き",
      flowV: "縦",
      flowH: "横",
      theme: "テーマ",
      themeAuto: "X に合わせる",
      themeDark: "黒",
      themeLight: "白",
      themeNote: "テーマを変更すると、開いている X のページが再読み込みされます。",
      panel: "サイドバーのリンク",
      panelSheet: "サイドパネル",
      panelSame: "同じタブ",
      panelTab: "新しいタブ",
      panelKeep: "サイドパネルの更新間隔",
      keep0: "更新しない",
      keep1: "1 分",
      keep5: "5 分",
      keep15: "15 分",
      keep30: "30 分",
      keep60: "1 時間",
      cols: "列数",
      colsAuto: "自動",
      lang: "言語",
      langAuto: "ブラウザに合わせる",
      navExpand: "サイドバーを開く",
      navCollapse: "サイドバーを閉じる",
      flowToVertical: "縦スクロールに切り替え",
      flowToSideways: "横スクロールに切り替え",
      timelines: "タイムライン",
      whatsNew: "更新内容",
      whatsNewTitle: "v{v} の新機能",
      close: "閉じる",
    },
  };

  const CHANGELOG = {
    "0.4.3": {
      zh: [
        "点开帖子浮窗后锁定背景瀑布流位置，不再意外向下滚动",
        "点开图片进入原生视图后，点击下方回复也会在浮窗内打开",
        "修复 Safari 中宽图多图卡片小幅滑动滚不到下一张的问题",
        "在帖子浮窗内点击图片时直接占满整个浏览器页面显示",
      ],
      en: [
        "Lock background feed scroll while the post window is open so the timeline stays put",
        "Clicking replies inside X's native photo viewer now opens them in the post window",
        "Fix small horizontal scrolls snapping back on wide multi-photo cards in Safari",
        "Clicking an image inside the post window now expands it to fill the browser viewport",
      ],
      ja: [
        "投稿ウィンドウ表示中に背景タイムラインのスクロール位置を固定",
        "画像ビューア内の返信クリックも投稿ウィンドウで開くように改善",
        "Safari で幅広の複数画像カードが小さなスクロールで進まない問題を修正",
        "投稿ウィンドウ内の画像クリック時にブラウザ全体へ拡大表示",
      ],
    },
  };

  // The setting if it names a language, otherwise the first of the browser's that we have.
  function resolve(setting, preferred = navigator.languages) {
    if (STRINGS[setting]) return setting;
    for (const tag of preferred) {
      const base = tag.toLowerCase().split("-")[0];
      if (STRINGS[base]) return base;
    }
    return "en";
  }

  function changelog(setting, version) {
    const entry = CHANGELOG[version];
    return entry ? entry[resolve(setting)] || entry.en : null;
  }

  return { resolve, t: (setting, key) => STRINGS[resolve(setting)][key], changelog };
})();
