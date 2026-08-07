# Claude Usage Monitor

### 🌐 [日本語](#日本語) | [English](#english) | [中文](#中文)

---

## 日本語

**Claude.ai の利用制限をチャット画面から動かずに確認できる Chrome 拡張機能（Manifest V3 / 8言語対応）。**

### 何のために作ったか

Claude.ai には5時間ごとの利用量制限があるが、残量を確認するには使用状況ページへ移動する必要があり、確認するたびに作業の流れが切れていた。自分がこの不便さに困っていたため、チャット入力欄の周囲に光の強弱で残量を表示し、画面を離れずに残量を把握できる拡張機能を作った。

### 技術構成

**Manifest V3を選んだ理由と対応点**
2024年にChromeがMV2拡張の新規公開を停止したため、最初からMV3で実装した。MV3では常駐するbackground pageが廃止され、非永続のservice workerに置き換わるため、`setInterval`で内部状態をメモリに持つV2的な実装は使えない。定期的なデータ取得は`chrome.alarms`に置き換え、状態はメモリ変数ではなく`chrome.storage.local`に保存し、service workerが休止・再起動しても状態を復元できるようにした。またMV3ではレスポンス内容を書き換える`webRequest`のブロッキング利用は禁止されているが、監視専用の`onCompleted`リスナー自体は残っていることを確認し、「返信完了」を検知するトリガーとして採用した。

**i18n(8言語)対応**
UIテキストを`i18n.js`にキー・バリュー辞書としてまとめ、選択言語を`chrome.storage`に保存してリロードなしで切り替えられるようにした。中国語・英語・日本語・韓国語・フランス語・ロシア語・スペイン語・アラビア語の8言語に対応したのは、Chrome拡張ストアの主要ユーザー圏をなるべく広くカバーし、UI言語の壁でインストールを諦められることを避けたいと判断したため。

**主要ファイル構成**
```
manifest.json   # MV3マニフェスト
background.js   # service worker: データ取得・キャッシュ・配信
content.js      # claude.ai に注入するオーバーレイUI
float_only.js   # 他ページ用のフローティングアイコン
popup.html/js   # ポップアップパネル
i18n.js         # 8言語分の翻訳辞書
```

### 実装上つまずいた点と、どう解決したか

- **APIの単位の誤り**: 参考にした既存拡張機能の情報では`utilization`は0〜1の割合とされていたが、実際のレスポンスは0〜100のパーセント値だった。ドキュメントをそのまま信用せず、実際のレスポンスを確認して計算式を補正した。補正しなければ残量表示が実際の100倍ずれる。
- **色変更がbloomエフェクトに反映されない**: カラーピッカーで色を変えても、CSSの`@keyframes`にハードコードした既定色(`#d97757`)のせいで光彩(bloom)だけ色が変わらなかった。`@keyframes`はJSから直接書き換えられないため、色変更時にテンプレート文字列で`@keyframes`を再生成し、`<style>`要素の内容を差し替える方式に変えて解決した。
- **`||`によるリセット時刻の誤表示**: 5時間枠がリセット済み(`resetMs=0`)の場合、`||`演算子のフォールバックだと`0`がfalsyとして無視され、7日枠のリセット時刻が誤って表示されるバグがあった。「`0`という正当な値」と「未設定(`null`/`undefined`)」は区別すべきと判断し、`??`(nullish coalescing)に置き換えて修正した。

### インストール方法

1. このリポジトリをクローンまたはダウンロード
2. Chromeで `chrome://extensions` を開く
3. 右上の「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」から `manifest.json` のあるフォルダを選択
5. claude.ai にログインすると自動的に動作開始

### スクリーンショット

> *(ここにスクリーンショットを追加予定: 1. 入力欄周辺のhalo表示 2. フローティングアイコン 3. ポップアップパネル 4. 右クリックの設定メニュー)*

---

## English

**A Chrome extension (Manifest V3, 8 languages) that shows your Claude.ai usage quota as ambient visual feedback, without leaving the chat.**

### Why I built it

Claude.ai enforces a rolling 5-hour usage window, but checking your remaining quota means navigating away from the chat and breaking your flow. That friction bothered me enough that I built an extension that shows remaining quota as a glow around the chat input, so I never have to leave the page to check.

### Tech stack

**Why Manifest V3, and what had to change from V2**
Chrome stopped accepting new MV2 listings in 2024, so MV3 was the only real option from the start. MV3 replaces the persistent background page with a non-persistent service worker, so a V2-style approach that keeps state in memory via `setInterval` doesn't work. I moved periodic fetching to `chrome.alarms` and persisted state in `chrome.storage.local` instead of in-memory variables, so state survives the service worker being suspended and restarted. MV3 also removes blocking `webRequest`, but the observation-only `onCompleted` listener still works, so I used it to detect "reply finished" without needing to intercept or rewrite any request.

**i18n for 8 languages**
UI strings live in a flat key-value dictionary in `i18n.js`; the chosen language is persisted to `chrome.storage` and switches without a reload. I covered Chinese, English, Japanese, Korean, French, Russian, Spanish, and Arabic to cover the Chrome Web Store's major user regions and avoid losing installs to a language barrier.

**Main file layout**
```
manifest.json   # MV3 manifest
background.js   # Service worker: fetch, cache, broadcast usage data
content.js      # Overlay UI injected into claude.ai
float_only.js   # Floating icon only, for other pages
popup.html/js   # Extension popup panel
i18n.js         # Translations for 8 languages
```

### Where I got stuck, and how I fixed it

- **Wrong unit assumption from the API**: The reference project I used to understand the API response claimed `utilization` was a 0-1 fraction. The real response was already a 0-100 percentage. I didn't take the documentation at face value — I checked the actual response and corrected the formula; using the wrong scale would have made the displayed remaining quota off by 100x.
- **Color changes didn't reach the bloom effect**: Changing colors via the picker updated the floating icon but not its bloom/glow effect, because the glow color was hardcoded into a CSS `@keyframes` block (`#d97757`). Since `@keyframes` rules can't be patched from JS, I rebuilt the keyframes as a template string and swapped a `<style>` element's content whenever the color changed.
- **`||` fallback misread a legitimate zero**: When the 5-hour window had already reset (`resetMs = 0`), a `||` fallback treated `0` as falsy and fell through to the 7-day window's reset time, showing the wrong countdown. I judged that `0` is a legitimate value and only `null`/`undefined` should trigger the fallback, so I switched to `??` (nullish coalescing).

### Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Log in to claude.ai — the extension activates automatically.

### Screenshots

> *(Placeholders — to be added: 1. halo glow around the chat input 2. floating icon 3. popup panel 4. right-click settings menu)*

---

## 中文

**一款 Chrome 扩展（Manifest V3，支持 8 种语言），在不离开聊天界面的情况下，以环境光效直观展示 Claude.ai 的用量额度。**

### 为什么做这个

Claude.ai 有一个滚动的 5 小时用量限制，但想查看剩余额度就必须跳转到用量页面，每次查看都会打断工作节奏。这个不便让我很困扰，于是做了这个扩展：在聊天输入框周围用光环强弱直观显示剩余额度，不用离开页面就能随时掌握用量。

### 技术构成

**为什么选择 Manifest V3，以及从 V2 迁移需要处理的问题**
2024 年 Chrome 停止接受新的 MV2 扩展上架，所以一开始就直接用 MV3 实现。MV3 用非持久的 service worker 取代了常驻的 background page，因此 V2 那种用 `setInterval` 把状态保存在内存里的做法不再可行。我把定时拉取数据改用 `chrome.alarms`，状态也不再存内存变量，而是持久化到 `chrome.storage.local`，这样 service worker 被挂起或重启后状态依然能恢复。另外 MV3 禁止使用会改写请求内容的 `webRequest` 阻塞模式，但仅用于监听的 `onCompleted` 监听器依然可用，我确认这一点后用它来检测"回复已完成"，无需拦截或改写任何请求。

**8 语言 i18n 实现**
所有界面文本集中放在 `i18n.js` 的一个键值字典里，用户选择的语言保存在 `chrome.storage`，切换语言无需刷新页面。之所以覆盖中文、英文、日语、韩语、法语、俄语、西班牙语、阿拉伯语这 8 种语言，是判断需要尽量覆盖 Chrome 应用商店的主要用户地区，避免因为语言门槛而流失安装用户。

**主要文件结构**
```
manifest.json   # MV3 清单文件
background.js   # service worker：拉取、缓存、广播用量数据
content.js      # 注入 claude.ai 页面的悬浮 UI
float_only.js   # 其他页面上的悬浮图标
popup.html/js   # 扩展弹出面板
i18n.js         # 8 种语言的翻译字典
```

### 实现中踩过的坑，以及如何解决

- **API 单位判断错误**：参考项目的文档里说 `utilization` 是 0~1 的比例值，但实际返回的是 0~100 的百分比数值。我没有直接相信文档，而是核对了真实响应并修正了计算公式——如果不修正，显示的剩余额度会偏差 100 倍。
- **改色不影响 bloom 光晕效果**：通过颜色选择器改色后，悬浮图标本身会变色，但光晕（bloom）效果的颜色不变，原因是光晕颜色被硬编码在 CSS 的 `@keyframes` 里（`#d97757`）。由于 `@keyframes` 规则无法直接从 JS 修改，我改为在颜色变化时用模板字符串重新生成 `@keyframes`，替换一个 `<style>` 元素的内容来解决。
- **`||` 误判合法的 0 值**：当 5 小时额度已经重置（`resetMs = 0`）时，用 `||` 做回退会把 `0` 当作 falsy 值跳过，错误地显示 7 天额度的重置时间。我判断 `0` 是合法值，只有 `null`/`undefined` 才该触发回退，因此改用 `??`（nullish coalescing）修复。

### 安装方法

1. 克隆或下载本仓库。
2. 打开 Chrome，进入 `chrome://extensions`。
3. 打开右上角的"开发者模式"。
4. 点击"加载已解压的扩展程序"，选择包含 `manifest.json` 的文件夹。
5. 登录 claude.ai，扩展会自动开始工作。

### 截图

> *（占位：待补充 1. 输入框周围的光环效果 2. 悬浮图标 3. 弹出面板 4. 右键设置菜单）*

---

## Reference / 参考 / 参考资料

API endpoint and response shape based on [lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension).
