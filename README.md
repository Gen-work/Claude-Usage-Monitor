# Claude Usage Monitor

一个 Chrome 扩展，以视觉化方式在 Claude.ai 聊天界面内展示用量余额——无需切换页面，无需手动刷新。

---

## 功能

| 功能 | 说明 |
|------|------|
| **光晕** | 输入框周围持续微光；悬停/激活时亮度增强；余量越低颜色越偏红 |
| **发送按钮圆角矩形进度环** | 有文字时出现，沿发送按钮外框显示余量百分比 |
| **行内芯片** | 激活输入框时，在工具栏居中显示重置倒计时（HH:MM:SS）；有文字时滑出 token 估算 |
| **浮动 Claude 图标** | 页面右下角，12 片花瓣按饼图着色（橙色=剩余，白色=已用）；可拖拽，位置跨窗口保持 |
| **弹出面板** | 点击扩展图标查看余量百分比、进度条与重置时间；管理浮动图标开关/水印/透明度 |
| **多语言** | 支持中文、English、日本語、한국어，在弹出面板或右键菜单切换 |

---

## 安装

1. 下载或克隆本仓库到本地目录
2. 打开 Chrome，地址栏输入 `chrome://extensions`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择包含 `manifest.json` 的目录
5. 打开 [claude.ai](https://claude.ai) 并登录，扩展自动生效

---

## 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 缓存用量数据与浮动图标设置（位置、透明度、水印模式） |
| `cookies` | 读取 `lastActiveOrg` Cookie 以获取组织 ID |
| `webRequest` | 监听对话完成请求，在每次 AI 回复后自动刷新用量 |
| `tabs` | 将用量更新推送到所有打开的 claude.ai 标签页 |
| `alarms` | 每 2 分钟定时刷新用量（后台保活） |
| `host_permissions: *://*.claude.ai/*` | 访问 Claude 内部 API `/api/organizations/{id}/usage` |

> 所有网络请求均直接发往 `claude.ai`，不经过任何第三方服务器。扩展不收集、不上传任何个人数据。

---

## 文件结构

```
Claude-Usage-Monitor/
├── manifest.json   # 扩展清单（MV3）
├── background.js   # Service Worker：抓取并缓存用量数据
├── i18n.js         # 多语言翻译（zh/en/ja/ko）
├── content.js      # 注入 claude.ai 的覆盖层 UI
├── popup.html      # 扩展图标弹出面板 HTML
├── popup.js        # 弹出面板逻辑
└── icon.png        # 扩展图标
```

---

## 架构

```
background.js (Service Worker)
  │  每2分钟 + 每次对话完成后
  │  GET /api/organizations/{orgId}/usage
  │  (credentials: include，利用已有登录态)
  │
  ├─► chrome.storage.local { usageData }
  │       └─► popup.js 读取并显示
  │
  └─► chrome.tabs.sendMessage USAGE_UPDATE
          └─► content.js 实时更新覆盖层 UI
```

**数据格式（来自 Claude API）：**
```json
{
  "five_hour": { "utilization": 42, "resets_at": "2026-01-01T12:00:00Z" },
  "seven_day": { "utilization": 15, "resets_at": "2026-01-07T00:00:00Z" }
}
```
`utilization` 为已用百分比（0–100 整数），`remainPct = 100 - utilization`。

**UI 层（content.js）关键设计：**
- 所有 DOM 节点挂载在 `document.body` 下的 `position:fixed` 覆盖层（`#cum-ov`），**不触碰 React 管理的节点**，避免破坏聊天界面
- RAF 循环调用 `getBoundingClientRect()` 实时对齐各覆盖元素与页面元素
- 浮动图标使用 `right`/`bottom` CSS 偏移量（相对视口边缘），窗口缩放后自动保持角落位置

---

## 浮动图标使用

- **拖拽**：按住左键拖动到任意位置，松手后自动保存
- **右键菜单**：
  - 隐藏图标（可从弹出面板重新开启）
  - 水印模式（鼠标穿透，不遮挡内容）
  - 透明度（25% / 50% / 75% / 100%）
- **悬停**：显示余量百分比与重置倒计时

---

## 调试

**问题：扩展显示"无法获取数据"**
1. 确认已登录 [claude.ai](https://claude.ai)
2. 前往 `chrome://extensions` → Claude Usage Monitor → **检查视图：Service Worker**
3. 在 Console 查找报错；若看到 `no_org`，刷新 claude.ai 页面后 Cookie 重新写入
4. 检查 `chrome://extensions` 是否显示"Service Worker（无效）"——若是，点击扩展卡片上的蓝色链接重新激活，或重新加载扩展

**问题：百分比显示异常（如 -4000%）**
- 仅在旧版本中出现，原因是误将 `utilization`（0–100）当作 0–1 小数处理
- 当前版本已修复：`remainPct = Math.round(100 - utilization)`

**问题：Service Worker 崩溃**
- MV3 Service Worker 不支持 Promise 版 `chrome.tabs.sendMessage(...).catch()`
- 当前版本已使用回调形式并以 `void chrome.runtime.lastError` 抑制"无接收者"错误

**手动触发刷新：**
在 Service Worker Console 中执行：
```javascript
doFetch()
```

---

## 开发说明

- Manifest V3，无外部依赖，纯原生 JS
- Token 估算公式：`ceil(字符数 / 3.5)`，适用于中英文混合文本（粗略估算）
- 花瓣顺序（顺时针从12点）：`[2,1,0,11,10,9,8,7,6,5,4,3]`（SVG path 索引）
- 光晕动画区分6种状态：{低/中/高余量} × {idle/active}

---

## 参考

- [lugia19/Claude-Usage-Extension](https://github.com/lugia19/Claude-Usage-Extension) — API 端点与数据格式参考
