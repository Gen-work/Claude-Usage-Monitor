# Claude Usage Monitor

[日本語](#日本語) · [English](#english) · [中文](#中文)

---

## 日本語

**Claude.ai と ChatGPT の利用枠の残量を、チャット画面で確認できる Chrome / Edge 拡張機能です。Manifest V3 に対応し、8 言語で利用できます。**

### 開発のきっかけ

残りの利用枠を確認するたびに使用状況ページへ移動すると、作業の流れが途切れてしまいます。そこで、チャット入力欄の周囲に光で残量を表示する拡張機能を作りました。v3 からは ChatGPT にも対応し、API から取得できる短期・週間の利用状況を表示します。

### 機能

- **入力欄の光（ハロー）**：残量に応じて色と明るさが変わります。入力中は明るく、待機中は控えめに表示し、ページのライト／ダークテーマに合わせて文字色を調整します。色と明るさは Claude と ChatGPT で個別に設定できます。ChatGPT の既定色は紫です。
- **送信ボタンの残量ゲージ**：ボタンの周囲に残量を表示します。Claude では角丸の四角形、ChatGPT では円形になります。
- **入力中の情報表示**：次のリセットまでの時間と、おおよそのトークン数を表示します。中国語・日本語・韓国語（CJK）の文字は、1 文字あたり約 1.3 トークンとして計算します。実際のトークナイザーによる計測値ではありません。
- **フローティングアイコン**：12 枚の花びらを使った Claude のマークで残量を表示します。ドラッグで移動でき、サイズ変更や右クリックでの設定にも対応しています。全ページでの表示を有効にすると、ほかのサイトでも Claude または ChatGPT の利用状況を確認できます。
- **ポップアップ**：Claude と ChatGPT を切り替え、短期・週間の残量とリセットまでの時間を確認できます。
- **8 言語の UI**：中国語、英語、日本語、韓国語、フランス語、ロシア語、スペイン語、アラビア語に対応しています。アラビア語は右から左への表示に対応し、初回起動時はブラウザの言語に合わせて選択します。

### インストール

[最新版のインストールアシスタントをダウンロード](https://github.com/Gen-work/Claude-Usage-Monitor/releases/latest/download/Claude-Usage-Monitor-installer.zip)

1. ZIP ファイルをダウンロードし、すべて展開します。
2. Windows では `install.cmd`、macOS では `install.command` をダブルクリックします。Linux では展開先のディレクトリで `sh install.sh` を実行します。
3. アシスタントが拡張機能を保存先フォルダにコピーし、そのパスを表示します。
4. Chrome で `chrome://extensions`、Edge で `edge://extensions` を開き、「デベロッパー モード」を有効にします。
5. 「パッケージ化されていない拡張機能を読み込む」をクリックし、手順 3 のフォルダを選択します。
6. claude.ai または chatgpt.com にログインして利用します。

保存先フォルダは削除しないでください。更新するには、最新版のアシスタントを実行し、ブラウザの拡張機能一覧で再読み込みボタンをクリックします。macOS で `install.command` が開けない場合は、ターミナルで `/bin/sh "/展開先のパス/install.command"` を実行してください。

ソースから読み込む場合は、このリポジトリをクローンするかダウンロードし、手順 5 で `manifest.json` のあるフォルダを選択します。ダウンロードリンクは、最初の GitHub Release が公開されると利用できます。

インストールアシスタントの実行に Node.js、Python、管理者権限は必要ありません。ブラウザでの読み込み操作は手動で行います。アシスタントによる自動更新には対応していません。通常のワンクリックインストールとブラウザによる自動更新には、拡張機能ストアへの公開が必要です。詳しくは [Chrome の配布に関する公式ドキュメント](https://developer.chrome.com/docs/extensions/how-to/distribute)をご覧ください。

### 技術情報

**Manifest V3**

定期的なデータ取得には `chrome.alarms` を使い、取得したデータや設定は `chrome.storage.local` に保存します。これにより、バックグラウンドのサービスワーカーが停止・再起動しても状態を復元できます。`webRequest.onCompleted` はリクエストの完了を検知し、利用状況を再取得するきっかけとして使っています。

**データソース**

| サイト | 取得方法 | 主なフィールド |
|---|---|---|
| claude.ai | `GET /api/organizations/{org}/usage`。組織 ID は `lastActiveOrg` Cookie から取得し、取得できない場合は `/api/organizations` を参照 | `five_hour` / `seven_day` の `utilization`（使用率、0–100%）と `resets_at`。`limits[]` 形式にも対応 |
| chatgpt.com | `GET /api/auth/session` でアクセストークンを取得し、`GET /backend-api/wham/usage` を呼び出す | `rate_limit.primary_window` / `secondary_window` の `used_percent` と `reset_at`（Unix 時刻、秒単位） |

短期・週間の利用枠として、通常は 5 時間・7 日間のデータを扱います。実際に取得できる利用枠は、サービスやプラン、API の応答によって異なります。

ChatGPT のデータは、開いている chatgpt.com タブ内のコンテンツスクリプトから優先的に取得します。タブがない場合や応答を取得できない場合は、サービスワーカーから直接取得を試みます。未ログインと判定された場合は、その状態を表示します。どちらのサービスも非公開 API を利用しているため、仕様変更によって取得できなくなる可能性があります。取得に失敗した場合、前回のデータがあれば保持し、最新ではないことを示します。

**文字と表示への配慮**

- `.editorconfig` と `.gitattributes` で、ソースの文字コードを UTF-8、改行を LF に統一しています。
- UI のアイコンにはインライン SVG を使い、フォントによる記号や絵文字の表示の違いを抑えています。
- 注入する UI に `lang` / `dir` 属性を指定し、言語に応じた CJK フォントの優先順位を設定しています。
- 時刻は `Intl.DateTimeFormat` で、選択した言語に合わせて表示します。
- Shift_JIS のページでの表示は、`http://localhost:8765/test/harness-sjis.html` で確認できます。

**ページ構造への対応**

送信ボタンは、`data-testid` などの識別子、`type=submit`、複数言語の `aria-label`、位置情報を組み合わせて探します。入力欄の外枠は、角丸が 12 px 以上の最も近い祖先要素から特定します。特定の CSS クラス名への依存を抑えていますが、サイト側の変更で調整が必要になる場合があります。

**主要ファイル**

```text
manifest.json   # 拡張機能の定義と権限
background.js   # データ取得、正規化、キャッシュ、通知
shared.js       # 描画、色、翻訳、API 解析などの共通処理
content.js      # Claude.ai / ChatGPT 上の UI
float_only.js   # ほかのページに表示するフローティングアイコン
popup.html      # ポップアップのレイアウト
popup.js        # ポップアップの処理
i18n.js         # 8 言語の翻訳
installer/      # OS 別のインストールアシスタント
scripts/        # パッケージ作成ツール
test/           # 自動テストと表示確認用ページ
```

### 開発・テスト・パッケージ作成

Node.js 18 以上が必要です。パッケージ作成とそのテストには Python 3.8 以上も必要です。

```bash
npm test          # 共通処理の単体テスト
npm run check     # 拡張機能の JavaScript の構文チェック
npm run harness   # 表示確認用サーバーを起動
npm run package   # packages/ に ZIP と SHA-256 チェックサムを生成
```

パッケージ作成のテストは `python3 -m unittest discover -s test -p 'test_package.py'` で実行できます。Windows では、環境に応じて `python3` を `python` または `py` に置き換えてください。

表示確認用サーバーを起動したら、`http://localhost:8765/test/harness.html?site=claude&lang=ja&theme=light` を開きます。`site` は `claude` / `chatgpt` / `other`、`lang` は UI 言語、`theme` は `light` / `dark` に切り替えられます。

GitHub Actions の CI は、push とプルリクエストごとにテストとパッケージ作成を実行し、ZIP を `Claude-Usage-Monitor-chrome-edge` アーティファクトとして保存します。従来の `scripts/package.ps1` もパッケージ作成の入口として利用できます。

### リリース

1. `manifest.json` と `package.json` のバージョンを一致させます。
2. 変更をコミットして push します。
3. 対応する `v<バージョン>` タグを作成して push します。たとえば、バージョンが `3.0.0` ならタグは `v3.0.0` です。

`.github/workflows/release.yml` がチェックとパッケージ作成を実行し、次のファイルを GitHub Release に公開します。

- `Claude-Usage-Monitor-v<version>-chrome-edge.zip`：拡張機能のファイルのみ。
- `Claude-Usage-Monitor-installer.zip`：拡張機能とインストールアシスタント。
- `SHA256SUMS.txt`：両 ZIP の SHA-256 チェックサム。

Release ワークフローを手動実行する場合は、既存のバージョンタグを指定します。そのタグのコミットに Release ワークフローが含まれている必要があります。タグとファイルのバージョンが一致しない場合は、公開前に処理を停止します。

---

## English

**A Chrome / Edge extension that shows your remaining Claude.ai and ChatGPT usage allowance right in the chat. Built on Manifest V3, with support for 8 interface languages.**

### Why I built it

Opening a separate usage page to check how much allowance is left interrupts the flow of a conversation. This extension shows that information as a glow around the chat input. Version 3 adds ChatGPT support, displaying the short-term and weekly usage data available from its API.

### Features

- **Input halo**: the glow changes colour and brightness with your remaining allowance. It brightens while you type and softens when idle, with text colours adjusted to the page's light or dark theme. Configure colours and brightness separately for Claude and ChatGPT; ChatGPT defaults to purple.
- **Send-button gauge**: shows the remaining allowance around the send button, following its shape: a rounded square on Claude and a circle on ChatGPT.
- **Typing indicators**: show a countdown to the next reset and a rough token estimate. Chinese, Japanese and Korean (CJK) characters are estimated at about 1.3 tokens each. This is an approximation, not a measurement from the model's tokenizer.
- **Floating icon**: a 12-petal Claude mark shows the remaining allowance. Drag it to move it, resize it, or right-click to change its settings. Enable display on all pages to view either Claude or ChatGPT usage while browsing other sites.
- **Popup**: switch between Claude and ChatGPT to check the short-term and weekly allowances and reset countdowns.
- **8 interface languages**: Chinese, English, Japanese, Korean, French, Russian, Spanish and Arabic. Arabic supports right-to-left layout. The initial language is selected from your browser settings.

### Installation

[Download the latest installation helper](https://github.com/Gen-work/Claude-Usage-Monitor/releases/latest/download/Claude-Usage-Monitor-installer.zip)

1. Download the ZIP and extract all its contents.
2. On Windows, double-click `install.cmd`. On macOS, double-click `install.command`. On Linux, run `sh install.sh` from the extracted directory.
3. The helper copies the extension to a permanent folder and displays its path.
4. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge, then enable **Developer mode**.
5. Click **Load unpacked** and select the folder shown in step 3.
6. Log in to claude.ai or chatgpt.com to use the extension.

Keep the installation folder in place. To update, run the latest helper and click the extension's reload button on the browser's extensions page. If `install.command` will not open on macOS, run `/bin/sh "/path/to/extracted/install.command"` in Terminal.

To install from source, clone or download this repository and select the folder containing `manifest.json` in step 5. The download link becomes available once the first GitHub Release is published.

The helper does not require Node.js, Python or administrator access. You still need to load the extension manually in the browser. The helper does not provide automatic updates. Standard one-click installation and browser-managed updates require publication in an extension store. See [Chrome's distribution documentation](https://developer.chrome.com/docs/extensions/how-to/distribute).

### Technical notes

**Manifest V3**

Periodic fetching uses `chrome.alarms`, while usage data and settings are saved in `chrome.storage.local` so they survive service-worker shutdowns and restarts. The `webRequest.onCompleted` listener detects completed requests and triggers a usage refresh.

**Data sources**

| Site | Retrieval | Main fields |
|---|---|---|
| claude.ai | `GET /api/organizations/{org}/usage`; the organisation ID comes from the `lastActiveOrg` cookie, with `/api/organizations` as a fallback | `five_hour` / `seven_day`: `utilization` (0–100% used) and `resets_at`; also supports the `limits[]` format |
| chatgpt.com | Fetch an access token from `GET /api/auth/session`, then call `GET /backend-api/wham/usage` | `rate_limit.primary_window` / `secondary_window`: `used_percent` and `reset_at` (Unix time in seconds) |

The short-term and weekly windows are typically 5 hours and 7 days. The available windows depend on the service, plan and API response.

ChatGPT data is fetched through a content script in an open chatgpt.com tab where possible. If no tab is open or no usable response is received, the service worker attempts a direct fetch. A response indicating that you are logged out is reported as such. Both services use undocumented APIs that may change. If a fetch fails, the extension keeps any previously fetched data and marks it as out of date.

**Text and display handling**

- `.editorconfig` and `.gitattributes` keep source files in UTF-8 with LF line endings.
- UI icons use inline SVG to reduce differences caused by missing symbols or emoji in fonts.
- Injected UI elements specify `lang` and `dir`, with CJK font fallbacks ordered for the selected language.
- Times are formatted for the selected language using `Intl.DateTimeFormat`.
- `http://localhost:8765/test/harness-sjis.html` provides a page for checking the UI in a Shift_JIS document.

**Adapting to page structure**

Send-button detection combines identifiers such as `data-testid`, `type=submit`, multilingual `aria-label` matching and position-based fallbacks. The input container is identified by its nearest ancestor with a border radius of at least 12 px. This reduces reliance on specific CSS class names, though changes to either site may still require adjustments.

**Main files**

```text
manifest.json   # Extension configuration and permissions
background.js   # Fetch, normalise, cache and broadcast usage data
shared.js       # Shared drawing, colour, translation and API helpers
content.js      # UI on Claude.ai and ChatGPT
float_only.js   # Floating icon on other pages
popup.html      # Popup layout
popup.js        # Popup behaviour
i18n.js         # Translations for 8 languages
installer/      # Installation helpers for each OS
scripts/        # Packaging tools
test/           # Automated tests and visual test pages
```

### Development, testing and packaging

Node.js 18 or later is required. Packaging and packaging tests also require Python 3.8 or later.

```bash
npm test          # Unit tests for shared helpers
npm run check     # Syntax checks for the extension's JavaScript
npm run harness   # Start the visual test server
npm run package   # Generate ZIPs and SHA-256 checksums in packages/
```

Run the packaging tests with `python3 -m unittest discover -s test -p 'test_package.py'`. On Windows, use `python` or `py` instead of `python3` if needed.

Once the visual test server is running, open `http://localhost:8765/test/harness.html?site=claude&lang=en&theme=light`. Set `site` to `claude`, `chatgpt` or `other`; use `lang` to select the interface language and `theme` to choose `light` or `dark`.

GitHub Actions CI runs tests and builds packages on each push and pull request. ZIPs are uploaded as the `Claude-Usage-Monitor-chrome-edge` artifact. The existing `scripts/package.ps1` entry point is also supported.

### Releases

1. Set matching versions in `manifest.json` and `package.json`.
2. Commit and push the changes.
3. Create and push the corresponding `v<version>` tag. For example, version `3.0.0` uses tag `v3.0.0`.

`.github/workflows/release.yml` runs validation and packaging, then publishes these files in a GitHub Release:

- `Claude-Usage-Monitor-v<version>-chrome-edge.zip`: extension files only.
- `Claude-Usage-Monitor-installer.zip`: the extension and installation helpers.
- `SHA256SUMS.txt`: SHA-256 checksums for both ZIPs.

To run the Release workflow manually, specify an existing version tag whose commit includes the workflow. If the tag and file versions do not match, the workflow stops before publishing.

---

## 中文

**一款 Chrome / Edge 扩展，在聊天页面直接显示 Claude.ai 和 ChatGPT 的剩余额度。基于 Manifest V3，支持 8 种界面语言。**

### 开发缘由

每次查看剩余额度都要跳转到用量页面，很容易打断聊天和工作节奏。这个扩展将剩余额度显示为输入框周围的光环，让你无需离开当前页面就能查看。v3 起支持 ChatGPT，可显示其 API 返回的短期和每周用量数据。

### 功能

- **输入框光环**：颜色和亮度随剩余额度变化，输入时更亮，待机时更柔和，并根据页面的明暗主题调整文字颜色。Claude 和 ChatGPT 的颜色、亮度可分别设置；ChatGPT 默认使用紫色。
- **发送按钮额度指示**：在发送按钮周围显示剩余额度，形状与按钮保持一致：Claude 为圆角方形，ChatGPT 为圆形。
- **输入提示**：显示下次重置的倒计时和预估 token 数。中日韩文字（CJK）按每字约 1.3 个 token 估算，仅供参考，并非模型分词器的实际计数。
- **悬浮图标**：用 12 瓣 Claude 标志显示剩余额度，支持拖动、调整大小和右键设置。开启跨页显示后，在其他网站也能查看 Claude 或 ChatGPT 的用量。
- **弹出面板**：切换 Claude 和 ChatGPT，查看短期、每周剩余额度及重置倒计时。
- **8 种界面语言**：中文、英语、日语、韩语、法语、俄语、西班牙语和阿拉伯语。阿拉伯语支持从右向左布局；首次使用时根据浏览器语言自动选择。

### 安装

[下载最新安装助手](https://github.com/Gen-work/Claude-Usage-Monitor/releases/latest/download/Claude-Usage-Monitor-installer.zip)

1. 下载 ZIP，并完整解压。
2. Windows 双击 `install.cmd`；macOS 双击 `install.command`；Linux 在解压目录中运行 `sh install.sh`。
3. 安装助手会将扩展复制到固定目录，并显示目录路径。
4. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`，开启“开发者模式”。
5. 点击“加载已解压的扩展程序”，选择第 3 步显示的目录。
6. 登录 claude.ai 或 chatgpt.com，即可使用。

请保留扩展的安装目录。更新时，运行最新版安装助手，再点击浏览器扩展管理页中的重新加载按钮。macOS 若无法打开 `install.command`，可在终端运行 `/bin/sh "/解压路径/install.command"`。

也可以从源码安装：克隆或下载本仓库，在第 5 步选择包含 `manifest.json` 的目录。首次发布 GitHub Release 后，上方下载链接才会生效。

运行安装助手无需 Node.js、Python 或管理员权限，但仍需在浏览器中手动加载扩展。安装助手不提供自动更新；标准的一键安装和浏览器自动更新需要上架扩展商店。详见 [Chrome 官方分发说明](https://developer.chrome.com/docs/extensions/how-to/distribute)。

### 技术说明

**Manifest V3**

定时获取数据使用 `chrome.alarms`，用量数据和设置保存在 `chrome.storage.local` 中，服务工作线程（service worker）停止或重启后仍可恢复。通过 `webRequest.onCompleted` 监听请求完成事件，触发用量刷新。

**数据来源**

| 站点 | 获取方式 | 主要字段 |
|---|---|---|
| claude.ai | `GET /api/organizations/{org}/usage`；组织 ID 来自 `lastActiveOrg` Cookie，无法获取时查询 `/api/organizations` | `five_hour` / `seven_day` 中的 `utilization`（已用百分比，0–100%）和 `resets_at`；也支持 `limits[]` 格式 |
| chatgpt.com | 通过 `GET /api/auth/session` 获取访问令牌，再调用 `GET /backend-api/wham/usage` | `rate_limit.primary_window` / `secondary_window` 中的 `used_percent` 和 `reset_at`（秒级 Unix 时间戳） |

短期和每周用量窗口通常为 5 小时和 7 天；实际可获取的窗口取决于服务、套餐和 API 响应。

ChatGPT 数据优先通过已打开的 chatgpt.com 标签页中的内容脚本获取。没有打开的标签页或未收到有效响应时，服务工作线程会尝试直接请求；若响应表明用户尚未登录，则显示未登录状态。两个服务均使用非公开 API，接口变动可能导致获取失败。请求失败时，如已有历史数据，扩展会保留这些数据并标记为非最新。

**文字与显示处理**

- 通过 `.editorconfig` 和 `.gitattributes` 将源码统一为 UTF-8 编码、LF 换行。
- 界面图标使用内联 SVG，减少字体缺字造成的符号或表情显示差异。
- 注入的界面带有 `lang` 和 `dir` 属性，并按所选语言设置中日韩字体的回退顺序。
- 使用 `Intl.DateTimeFormat`，按所选语言格式化时间。
- 可通过 `http://localhost:8765/test/harness-sjis.html` 检查扩展在 Shift_JIS 页面中的显示情况。

**适配页面结构**

发送按钮的查找综合使用 `data-testid` 等标识、`type=submit`、多语言 `aria-label` 匹配和位置判断。输入框外框通过最近的、圆角半径至少为 12 px 的祖先元素识别。这些方式减少了对特定 CSS 类名的依赖，但网站结构变化后仍可能需要调整。

**主要文件**

```text
manifest.json   # 扩展配置与权限
background.js   # 获取、归一化、缓存和广播用量数据
shared.js       # 绘制、颜色、翻译、API 解析等共用逻辑
content.js      # Claude.ai 和 ChatGPT 页面上的界面
float_only.js   # 其他页面上的悬浮图标
popup.html      # 弹出面板布局
popup.js        # 弹出面板逻辑
i18n.js         # 8 种语言的翻译
installer/      # 各操作系统的安装助手
scripts/        # 打包工具
test/           # 自动化测试与界面测试页
```

### 开发、测试与打包

需要 Node.js 18 或更高版本；打包及打包测试还需要 Python 3.8 或更高版本。

```bash
npm test          # 共用逻辑的单元测试
npm run check     # 扩展 JavaScript 的语法检查
npm run harness   # 启动界面测试服务器
npm run package   # 在 packages/ 中生成 ZIP 和 SHA-256 校验文件
```

运行 `python3 -m unittest discover -s test -p 'test_package.py'` 可执行打包测试。Windows 可根据环境将 `python3` 替换为 `python` 或 `py`。

启动界面测试服务器后，打开 `http://localhost:8765/test/harness.html?site=claude&lang=zh&theme=light`。`site` 可选 `claude`、`chatgpt` 或 `other`；`lang` 指定界面语言；`theme` 可选 `light` 或 `dark`。

GitHub Actions CI 会在每次 push 和拉取请求时运行测试、构建安装包，并将 ZIP 上传为 `Claude-Usage-Monitor-chrome-edge` 构建产物。原有的 `scripts/package.ps1` 打包入口仍可使用。

### 发布

1. 将 `manifest.json` 和 `package.json` 的版本号设为一致。
2. 提交并推送改动。
3. 创建并推送对应的 `v<版本号>` 标签。例如，版本号为 `3.0.0` 时，标签为 `v3.0.0`。

`.github/workflows/release.yml` 会执行检查和打包，然后将以下文件发布到 GitHub Release：

- `Claude-Usage-Monitor-v<version>-chrome-edge.zip`：仅包含扩展文件。
- `Claude-Usage-Monitor-installer.zip`：包含扩展和安装助手。
- `SHA256SUMS.txt`：两个 ZIP 的 SHA-256 校验值。

也可手动运行 Release 工作流，指定一个已存在的版本标签；该标签指向的提交必须包含 Release 工作流。标签与文件中的版本号不一致时，工作流会在发布前停止。

---

## 参考資料 / References / 参考资料

- Claude の利用状況 API / Claude usage API / Claude 用量 API：[lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension)
- ChatGPT `wham/usage`：[thefishbonecoder/worklimit-widget](https://github.com/thefishbonecoder/worklimit-widget)、[sebastian-suarez/ai-usage#5](https://github.com/sebastian-suarez/ai-usage/issues/5)
