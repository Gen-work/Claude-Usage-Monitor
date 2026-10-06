# Claude Usage Monitor

### 🌐 [日本語](#日本語) | [English](#english) | [中文](#中文)

---

## 日本語

**Claude.ai と ChatGPT の利用制限を、チャット画面から動かずに確認できる Chrome / Edge 拡張機能（Manifest V3 / 8言語対応）。**

### 何のために作ったか

Claude.ai には5時間ごと・7日ごとの利用量制限があるが、残量を確認するには使用状況ページへ移動する必要があり、確認するたびに作業の流れが切れていた。自分がこの不便さに困っていたため、チャット入力欄の周囲に光の強弱で残量を表示し、画面を離れずに残量を把握できる拡張機能を作った。v3 からは ChatGPT（chatgpt.com）の 5時間 / 週間ウィンドウにも同じ表示が付く。

### 機能

- **ハロー（呼吸灯）**: 入力欄の周囲が残量に応じた色・強さで光る。入力中は強く、待機中は弱く。ライト／ダークテーマを自動判定し、文字色を切り替える。色と強度は Claude / ChatGPT で別々に設定できる（ChatGPT の既定色は紫）。
- **送信ボタンのリング**: 送信ボタンの周囲に残量のリングゲージを表示。ボタンの形に合わせて角丸四角（Claude）／円（ChatGPT）になる。
- **インラインチップ**: 入力中に、次回リセットまでのカウントダウンと概算トークン数（CJK 文字は 1 文字 ≒ 1.3 トークンで重めに見積もる）を表示。
- **フローティングアイコン**: 12 枚の花弁で残量を示す Claude マーク。ドラッグ移動・リサイズ・右クリック設定。「全ページ表示」を有効にすると任意のサイトにも表示でき、表示するデータソース（Claude / ChatGPT）を選べる。
- **ポップアップ**: Claude / ChatGPT を切り替えて 5時間枠と 7日枠の残量・リセット時刻を確認。
- **8言語 UI**: 中国語・英語・日本語・韓国語・フランス語・ロシア語・スペイン語・アラビア語（RTL 対応）。初回はブラウザの言語から自動選択。

### 技術構成

**Manifest V3を選んだ理由と対応点**
2024年にChromeがMV2拡張の新規公開を停止したため、最初からMV3で実装した。MV3では常駐するbackground pageが廃止され、非永続のservice workerに置き換わるため、`setInterval`で内部状態をメモリに持つV2的な実装は使えない。定期的なデータ取得は`chrome.alarms`に置き換え、状態はメモリ変数ではなく`chrome.storage.local`に保存し、service workerが休止・再起動しても状態を復元できるようにした。またMV3ではレスポンス内容を書き換える`webRequest`のブロッキング利用は禁止されているが、監視専用の`onCompleted`リスナー自体は残っていることを確認し、「返信完了」を検知するトリガーとして採用した。

**データソース**

| サイト | 取得方法 | 返ってくる値 |
|---|---|---|
| claude.ai | `GET /api/organizations/{org}/usage`（org は `lastActiveOrg` Cookie、無ければ `/api/organizations`） | `five_hour` / `seven_day` の `utilization`（0–100 の使用率）と `resets_at`。新しい `limits[]` 形式にも対応 |
| chatgpt.com | `GET /api/auth/session` でセッションの access token を得て `GET /backend-api/wham/usage` | `rate_limit.primary_window`（5時間）/ `secondary_window`（7日）の `used_percent`、`reset_at`（秒） |

ChatGPT のリクエストは、開いている chatgpt.com タブの content script から（ページと同じ Cookie で）行い、タブが無いときだけ service worker から直接試みる。どちらも非公開 API のため、仕様変更で動かなくなる可能性がある。取得失敗時は前回の値を「古いデータ」として保持し、表示を消さない。

**文字化け対策（Shift_JIS 環境の Edge などで検証）**
- 全ソースを UTF-8 / LF で固定（`.editorconfig`, `.gitattributes`）。拡張機能のファイルはブラウザが常に UTF-8 として読むので BOM は付けない。
- ✓ ▶ 🔋 🪫 などの記号・絵文字はフォント依存で豆腐になりやすいため、すべてインライン SVG に置き換えた。
- 注入する UI には `lang` / `dir` 属性を付け、UI 言語に合わせた CJK フォントスタック（日本語なら Yu Gothic UI → Meiryo → …）を明示。Segoe UI だけでは CJK がシステム既定の MS ゴシックに落ちる問題を回避。
- 時刻表示は `Intl.DateTimeFormat` を使い、言語ごとに正しい書式にする。
- ホストページが Shift_JIS で配信されていても、content script は UTF-8 で動く。`test/harness-sjis.html` で実際に Shift_JIS 文書に注入して確認できる。

**ホスト DOM への依存を最小化**
Claude / ChatGPT の送信ボタンの `aria-label` は UI 言語で変わる（例: "Send message" / "发送消息" / "メッセージを送信"）。文字列には頼らず、`data-testid`・`type=submit`・多言語の正規表現・位置ヒューリスティックの順に探す。入力欄の外枠は CSS クラス名ではなく「角丸 12px 以上の最も近い祖先」で特定する。

**主要ファイル構成**
```
manifest.json   # MV3マニフェスト（claude.ai / chatgpt.com / その他ページ）
background.js   # service worker: 取得・正規化・キャッシュ・配信
shared.js       # 共通: 花弁ジオメトリ、色の段階、i18n ヘルパ、API パーサ、フォント/言語
content.js      # claude.ai / chatgpt.com に注入するオーバーレイ（サイト別アダプタ入り）
float_only.js   # その他ページ用のフローティングアイコン
popup.html/js   # ポップアップパネル
i18n.js         # 8言語分の翻訳辞書
test/           # 単体テスト（node --test）と視覚確認用ハーネス
```

### テスト

```bash
npm test          # shared.js の純粋関数（パーサ、色段階、i18n 網羅性など）
npm run check     # 全スクリプトの構文チェック
npm run harness   # http://localhost:8765/test/harness.html?site=claude|chatgpt|other&lang=ja&theme=light
```

### インストール方法

1. このリポジトリをクローンまたはダウンロード
2. Chrome は `chrome://extensions`、Edge は `edge://extensions` を開く
3. 「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」から `manifest.json` のあるフォルダを選択
5. claude.ai / chatgpt.com にログインすると自動的に動作開始

---

## English

**A Chrome / Edge extension (Manifest V3, 8 languages) that shows your Claude.ai and ChatGPT usage quota as ambient visual feedback, without leaving the chat.**

### Why I built it

Claude.ai enforces rolling 5-hour and 7-day usage windows, but checking your remaining quota means navigating away from the chat and breaking your flow. That friction bothered me enough that I built an extension that shows remaining quota as a glow around the chat input. Since v3 the same glow works on chatgpt.com for ChatGPT's 5-hour / weekly windows.

### Features

- **Halo**: the composer glows in a colour and intensity that track remaining quota; stronger while typing, softer when idle. Light / dark host themes are detected automatically. Colours and intensities are configured per provider (ChatGPT defaults to violet).
- **Send ring**: a ring gauge around the send button that follows the button's shape — rounded square on Claude, circle on ChatGPT.
- **Inline chip**: while typing, a countdown to the next reset and a rough token estimate (CJK characters are weighted ≈1.3 tokens each instead of being under-counted).
- **Floating icon**: the 12-petal Claude mark fills according to remaining quota. Drag, resize, right-click for settings. With "All pages" on, it appears on any site and you can choose which source (Claude / ChatGPT) it shows.
- **Popup**: switch between Claude and ChatGPT; shows both the 5-hour and the 7-day window with reset countdowns.
- **8 UI languages** incl. Arabic (RTL); picked from the browser language on first run.

### Tech notes

**Manifest V3**: no persistent background page, so periodic fetching runs on `chrome.alarms` and all state lives in `chrome.storage.local`, surviving service-worker suspension. The observation-only `webRequest.onCompleted` listener is still permitted in MV3 and is used to refetch right after a reply completes.

**Data sources**

| Site | How | Fields |
|---|---|---|
| claude.ai | `GET /api/organizations/{org}/usage` (org from the `lastActiveOrg` cookie, falling back to `/api/organizations`) | `five_hour` / `seven_day` → `utilization` (0–100 % used), `resets_at`; the newer `limits[]` shape is also parsed |
| chatgpt.com | `GET /api/auth/session` for the session access token, then `GET /backend-api/wham/usage` | `rate_limit.primary_window` (5 h) / `secondary_window` (7 d) → `used_percent`, `reset_at` (epoch seconds) |

The ChatGPT request is made from the content script inside an open chatgpt.com tab (same cookies as the page); the service worker only tries directly when no tab is open. Both endpoints are undocumented and may change. A failed fetch keeps the last good snapshot and marks it stale instead of blanking the UI.

**No mojibake, any browser / OS language** (verified with Edge on a Shift_JIS Windows system)
- All sources pinned to UTF-8 / LF via `.editorconfig` and `.gitattributes`; browsers always read extension files as UTF-8, so no BOM.
- Dingbats and emoji (✓ ▶ 🔋 🪫) replaced by inline SVG — they rendered as tofu on fonts that lack them.
- Injected UI carries `lang` / `dir` attributes and an explicit CJK font stack ordered by UI language, so Han glyphs use the right regional forms instead of falling back to MS Gothic.
- Times are formatted with `Intl.DateTimeFormat` per language.
- Content scripts stay UTF-8 even inside a Shift_JIS host document; `test/harness-sjis.html` reproduces that case.

**Minimal host-DOM coupling**: send buttons have localised `aria-label`s ("Send message" / "发送消息" / "メッセージを送信"), so lookups go `data-testid` → `type=submit` → multilingual regex → position heuristic. The composer box is found as the nearest ancestor with a ≥12 px border radius rather than by Tailwind class name.

**Files**
```
manifest.json   # MV3 manifest (claude.ai / chatgpt.com / other pages)
background.js   # Service worker: fetch, normalise, cache, broadcast
shared.js       # Shared: petal geometry, colour tiers, i18n helper, API parsers, fonts/locale
content.js      # Overlay injected into claude.ai and chatgpt.com (site adapters inside)
float_only.js   # Floating icon for every other page
popup.html/js   # Extension popup
i18n.js         # Translations for 8 languages
test/           # Unit tests (node --test) + visual harness
```

### Tests

```bash
npm test          # pure helpers in shared.js (parsers, colour tiers, i18n completeness, …)
npm run check     # syntax check of every script
npm run harness   # http://localhost:8765/test/harness.html?site=claude|chatgpt|other&lang=ja&theme=light
```

### Installation

1. Clone or download this repository.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Log in to claude.ai / chatgpt.com — the extension activates automatically.

---

## 中文

**一款 Chrome / Edge 扩展（Manifest V3，支持 8 种语言），在不离开聊天界面的情况下，以环境光效直观展示 Claude.ai 与 ChatGPT 的用量额度。**

### 为什么做这个

Claude.ai 有滚动的 5 小时和 7 天用量限制，但想查看剩余额度就必须跳转到用量页面，每次查看都会打断工作节奏。于是做了这个扩展：在聊天输入框周围用光环强弱直观显示剩余额度。v3 起同样的光环也适用于 chatgpt.com 的 5 小时 / 周窗口。

### 功能

- **呼吸灯光环**：输入框外围随剩余额度改变颜色和强度；输入时更亮，待机时更弱；自动识别页面明暗主题。颜色和强度按 Claude / ChatGPT 分别保存（ChatGPT 默认紫色）。
- **发送按钮环形进度**：发送按钮周围的环形量表，形状跟随按钮：Claude 为圆角方形，ChatGPT 为圆形。
- **内联信息条**：输入时显示到下次重置的倒计时和粗略 token 估算（CJK 字符按约 1.3 token/字计算，不再被低估）。
- **悬浮图标**：12 瓣 Claude 标志按剩余额度填充；可拖拽、缩放、右键设置。开启"跨页显示"后可出现在任意网站，并可选择显示 Claude 还是 ChatGPT 的数据。
- **弹出面板**：Claude / ChatGPT 切换，同时显示 5 小时与 7 天窗口的剩余量与重置倒计时。
- **8 种界面语言**（含阿拉伯语 RTL），首次使用按浏览器语言自动选择。

### 技术构成

**Manifest V3**：没有常驻 background page，定时拉取改用 `chrome.alarms`，所有状态持久化在 `chrome.storage.local`，service worker 被挂起后也能恢复。MV3 仍允许仅用于监听的 `webRequest.onCompleted`，用它在回复完成后立即刷新。

**数据来源**

| 站点 | 方式 | 字段 |
|---|---|---|
| claude.ai | `GET /api/organizations/{org}/usage`（org 来自 `lastActiveOrg` Cookie，缺失时回退到 `/api/organizations`） | `five_hour` / `seven_day` 的 `utilization`（0–100 已用百分比）、`resets_at`；同时兼容新的 `limits[]` 结构 |
| chatgpt.com | 先 `GET /api/auth/session` 取会话 access token，再 `GET /backend-api/wham/usage` | `rate_limit.primary_window`（5 小时）/ `secondary_window`（7 天）的 `used_percent`、`reset_at`（秒级时间戳） |

ChatGPT 的请求优先由已打开的 chatgpt.com 标签页内的 content script 发出（与页面同 Cookie），没有标签页时才由 service worker 直接尝试。两者都是未公开接口，可能随时变动。拉取失败时保留上一份数据并标记为"过期"，不会让界面空白。

**防乱码（已在 Shift_JIS 环境的 Edge 上验证）**
- 全部源码固定为 UTF-8 / LF（`.editorconfig`、`.gitattributes`）；浏览器始终按 UTF-8 读取扩展文件，所以不加 BOM。
- ✓ ▶ 🔋 🪫 等符号和 emoji 在缺字字体上会显示为方块，全部替换为内联 SVG。
- 注入的 UI 带 `lang` / `dir` 属性，并按界面语言排列 CJK 字体回退栈（日文优先 Yu Gothic UI → Meiryo …），避免只写 Segoe UI 时 CJK 回落到 MS Gothic。
- 时间用 `Intl.DateTimeFormat` 按语言格式化。
- 即使宿主页面以 Shift_JIS 传输，content script 依然以 UTF-8 运行；`test/harness-sjis.html` 可复现该场景。

**尽量不依赖宿主 DOM 细节**：发送按钮的 `aria-label` 会随界面语言变化（"Send message" / "发送消息" / "メッセージを送信"），查找顺序为 `data-testid` → `type=submit` → 多语言正则 → 位置启发式；输入框外框按"最近的圆角 ≥12px 祖先"识别，而不是 Tailwind 类名。

**主要文件结构**
```
manifest.json   # MV3 清单（claude.ai / chatgpt.com / 其他页面）
background.js   # service worker：拉取、归一化、缓存、广播
shared.js       # 共享：花瓣几何、颜色分档、i18n 助手、API 解析、字体/语言
content.js      # 注入 claude.ai 与 chatgpt.com 的悬浮 UI（内含站点适配器）
float_only.js   # 其他页面上的悬浮图标
popup.html/js   # 扩展弹出面板
i18n.js         # 8 种语言的翻译字典
test/           # 单元测试（node --test）与可视化测试页
```

### 测试

```bash
npm test          # shared.js 纯函数（解析器、颜色分档、i18n 完整性等）
npm run check     # 所有脚本语法检查
npm run harness   # http://localhost:8765/test/harness.html?site=claude|chatgpt|other&lang=ja&theme=light
```

### 安装方法

1. 克隆或下载本仓库。
2. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
3. 打开"开发者模式"。
4. 点击"加载已解压的扩展程序"，选择包含 `manifest.json` 的文件夹。
5. 登录 claude.ai / chatgpt.com，扩展会自动开始工作。

---

## Reference / 参考 / 参考资料

- Claude usage endpoint shape cross-checked with [lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension).
- ChatGPT `wham/usage` window shape cross-checked with [thefishbonecoder/worklimit-widget](https://github.com/thefishbonecoder/worklimit-widget) and [sebastian-suarez/ai-usage#5](https://github.com/sebastian-suarez/ai-usage/issues/5).
