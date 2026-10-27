# PRD：DSH MCP 服务器管理插件（dsh-mcpserver-manager）

## 1. 项目信息

| 项 | 值 |
| --- | --- |
| Language | 简体中文 |
| Project Name | `dsh_mcpserver_manager`（npm 包名 `dsh-mcpserver-manager`） |
| Programming Language | **非标准 Web 脚手架**。本产物是 DSH 双面插件：Host 半为 Node ESM（≥18），Client 半为 React JSX，由 esbuild 打成单文件 CJS bundle。**React 由宿主注入，不得打进 bundle；不引入 MUI / Tailwind / 任何第三方 UI 框架或图标库**（默认技术栈在此场景下不适用，原因见 §4.6 设计约束 D6） |
| 版本 | v0.1.0 |
| 仓库 | `github.com/liuleiyu121520/dsh-mcpserver-manager`（公开） |
| 文档位置 | `docs/software-company/prd.md` |

### 1.1 原始需求复述（用户原文）

> 请参考 https://dsh-hub.cc/plugins/null119/dsh-mcp-manage 这个由 DeepSeek Hunters 提供的 MCP 管理界面（该链接当前无法访问），重新设计一个 MCP 管理页面。要求：界面风格与 DeepSeek Hunters 的主题保持一致，改善现有界面观感偏差的问题；支持添加 MCP，流程为录入一段 JSON 配置、点击确定进行校验、校验通过后将配置写入当前 DSH 的 MCP 维护配置文件中，并能正常回显已添加的 MCP 列表；完成后将代码提交到我的 GitHub 仓库，并同步发布到 DSH Hub 上。

### 1.2 已确认决策（本 PRD 的前提，不再讨论）

1. **写入目标**：`~/.dsh/profiles/web/cordis.patch.yml`，按 `name: '@deepseek-ai/dsh-mcp-client'` 的行格式插入条目。
2. **页面入口**：设置 → MCP 管理，向 `settings.section` 槽位注册。
3. **发布**：GitHub 用户 `liuleiyu121520` 下新建公开仓库 `dsh-mcpserver-manager`，推送 + `v0.1.0` tag/Release，DSH Hub 自动索引。

### 1.3 环境与事实基线

- 目标文件 `/Users/leiyu/.dsh/profiles/web/cordis.patch.yml` 当前**只有一条** `ui-settings-general`，即**首屏列表为空**，空态是默认路径而非异常路径。
- 该 profile 已声明 `patchReload: live`，写文件后宿主自动热重载，插件**不需要、也不应该**自行重启宿主。
- 工作区 `/Users/leiyu/AI/dsh-hub/dsh-mcpserver-manager` 当前为空、非 git 仓库。
- 参考实现（本地可读）：`dsh-ssh`（构建脚本 `scripts/build.mjs` 可直接照抄）、`dsh-launchpad`、`dsh-wallpaper`、已安装样例 `~/.dsh/profiles/web/node_modules/dsh-hub/`。

---

## 2. 产品定义

### 2.1 产品目标（一句话）

> 在 DSH 设置里提供一个**主题原生、校验先行、写入官方 MCP 维护配置文件**的 MCP 服务器管理页，让用户「粘贴一段 JSON → 点确定 → 立刻在列表里看到它」这一条主路径 3 秒内闭环。

### 2.2 三条设计原则

| # | 原则 | 含义 | 可度量判据 |
| --- | --- | --- | --- |
| **P-1** | **主题一致性优先于视觉个性** | 严格使用 DSH 设计系统的 `--dsw-alias-*` 变量，"设置页"语言优先（原生设置卡片而非自造面板）。**零硬编码业务色值，零 JS 明暗判断**。 | 全量 CSS 中除 `var(...)` 的 fallback 外不出现第 2 处色值；明暗主题切换后所有区域对比度保持可读 |
| **P-2** | **写入官方配置文件，且绝不破坏它** | 只写 `cordis.patch.yml`，采用**受管段落 + 文本级增删 + 原子写 + 备份 + 失败回滚**，不动段外任何一个字节。 | 连续 20 次增删后，段外内容与操作前 `md5` 完全一致；写入失败时文件内容与操作前一致 |
| **P-3** | **校验先行，前后端同一套规则** | 前端给出即时反馈，后端是唯一权威；规则集以单一数据源定义，前后端共用。 | 前端判过的一定能过后端；后端判拒的一定能在 UI 上定位到具体字段/行号 |

### 2.3 设计约束（Derived Constraints）

| # | 约束 | 来源 |
| --- | --- | --- |
| D1 | 写入**不能**走「解析 YAML → 改对象 → 再 dump」。原文件含头部注释、且 MCP 配置允许 `!!js process.env.X` 自定义 tag，通用 dump 会毁掉它们。必须走**文本级段落编辑**。 | §1.3 + MCP 官方格式 |
| D2 | 插件自己写入的条目必须能被**幂等地重新识别**（否则刷新一次就重复插入一条）。→ 引入受管段落标记。 | D1 |
| D3 | `env` 里可能有 token，**列表回显绝不能输出明文**。 | 安全底线 |
| D4 | 所有 Host HTTP 入口第一个语句必须是 `ctx.connection.requestRejection(req)` 守卫。 | 宿主既定安全契约 |
| D5 | React 由宿主 `factory(require)` 提供，bundle 必须 `external: ['react','react-dom']`。 | 客户端加载器契约 |
| D6 | bundle 是客户端唯一产物且每次宿主启动都要读入执行，**不引 UI 框架/图标库**（图标用内联 SVG），体积设门禁。 | `dsh-ssh` build.mjs 既有教训 |

### 2.4 受管段落（Managed Block）—— 本 PRD 的核心机制

在 `cordis.patch.yml` 的顶层数组内维护一段由本插件独占的区间，用注释锚点界定：

```yaml
# >>> dsh-mcpserver-manager:managed:begin —— 本段由插件维护，请勿手改缩进
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env: { GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN }
# <<< dsh-mcpserver-manager:managed:end

# >>> dsh-mcpserver-manager:disabled:begin —— 已停用的条目（整段注释，可一键恢复）
# - id: mcp-foo
#   name: '@deepseek-ai/dsh-mcp-client'
#   config: { serverName: foo, transport: stdio, command: node }
# <<< dsh-mcpserver-manager:disabled:end
```

| 操作 | 实现方式 | 幂等性 |
| --- | --- | --- |
| 读取 | 全文扫描两个锚点，只解析段内条目；锚点不存在 → 视为空列表 | 天然 |
| 新增 | 在 `managed:end` 锚点前插入规范化 YAML 行 | 唯一性由 `serverName` 校验保证 |
| 删除 | 按 `serverName` 定位条目行区间，整段移除 | 找不到 → 返回 404，UI 提示"条目已不存在" |
| 停用/启用 | 在两个段之间**整段搬运**（启用=去注释，停用=加注释） | **不依赖宿主是否支持 `disabled` 键**，零风险 |
| 写入 | 写临时文件 → `fsync` → `rename` 覆盖；写前备份 `cordis.patch.yml.bak` | 失败自动回滚 |

> **为什么停用用「注释搬运」而不是 `disabled: true`**：cordis patch 层的 disable 语义未经本机验证（见 §6-Q3）。注释搬运 100% 由插件自己控制、可逆、且配置不丢失，是 P0 唯一稳妥解。若架构师验证出原生 disable 键可用，再切换（届时为 P1 优化项）。

### 2.5 用户故事

| # | 场景 | 用户故事 | 验收要点 |
| --- | --- | --- | --- |
| **US-1** | 首次打开空态 | 作为一个**刚装好插件的 DSH 用户**，我想在「设置 → MCP 管理」里看到一个说明清楚的引导页，以便知道这个页面能做什么、配置会写到哪里。 | 空态含图标 + 主文案 + 副文案（含写入文件路径）+ 主按钮「添加 MCP」；无空白卡片、无 loading 闪烁 |
| **US-2** | 粘贴 JSON 添加 | 作为一个**要接入 GitHub MCP 的用户**，我想粘贴一段 JSON 配置并点「确定」，以便系统校验通过后自动把它写进 DSH 的 MCP 配置文件并立刻出现在列表里。 | 全流程 ≤ 3s；成功后弹窗关闭、列表刷新、新条目高亮 1.5s；`cordis.patch.yml` 出现对应条目；宿主热重载后 MCP 生效 |
| **US-3** | 校验失败 | 作为一个**手滑写错配置的用户**，我想在点「确定」后立刻看到"哪一行/哪个字段错了、为什么"，以便改完再提交。 | 错误定位到字段；JSON 语法错报 `第 N 行`；提交按钮在校验未过时禁用；错误文案用 `--dsw-alias-state-error-primary` |
| **US-4** | 列表回显 | 作为一个**已有多个 MCP 的用户**，我想在列表里一眼看到每个 MCP 的 `serverName` / 传输方式 / 关键参数 / 启用状态，以便快速确认当前接入情况。 | 每条一张卡片；`env` 值脱敏；命令过长单行截断 + `title` 悬浮全量；刷新页面后列表与文件内容一致 |
| **US-5** | 删除 / 停用 | 作为一个**临时不想用某个 MCP 的用户**，我想能停用它（之后还能一键恢复），或者彻底删除它，以便控制哪些工具注入到会话里。 | 删除需二次确认；停用后卡片变灰标「已停用」但仍可见可恢复；两个操作都原子生效并可回退 |
| **US-6** | 重名冲突 | 作为一个**重复添加同名 MCP 的用户**，我想在提交时就被告知"`serverName` 已被占用"，以便改名而不是静默覆盖掉已有配置。 | 校验阶段拦截，不进入写文件；错误信息里指出已存在的条目；改名后立即可提交 |
| **US-7** | 写入失败（隐含） | 作为一个**配置文件被占用的用户**，我想在写入失败时看到明确错误并确认文件没被写坏，以便放心重试。 | 自动回滚 + 保留备份；页面顶部红色 banner 显示原因；文件内容与操作前 `md5` 一致 |

---

## 3. 需求池

优先级定义：**P0 = 必须可交付（缺一不可发布）**，P1 = 应该有（首发后首个迭代），P2 = 锦上添花。

### 3.1 P0 —— Must have

| ID | 需求 | 描述 | 验收判据 |
| --- | --- | --- | --- |
| **P0-1** | 插件双面骨架 | `package.json` 照 §3.4 形状声明 `dsh.bundle.patch` / `dsh.client.{platform,inject}` / `exports` / `files`；`icon.svg`；`.gitignore` | `node --check` 通过；`inject` 含 `@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-settings` |
| **P0-2** | 构建链路 | 照抄 `dsh-ssh/scripts/build.mjs`：esbuild 打 client（`bundle/cjs/browser/es2020/minify`，`external: react,react-dom`），外层包 `window.__ModuleLoader__.load({id, factory(require){...}})`；Host 半目录扫描拷贝；支持 `--check` | `npm run build` 产出 `lib/index.js` + `lib/client.js`；`lib/client.js` 内**不含** React 源码（grep `createElement` 定义不可命中 bundle 自带实现） |
| **P0-3** | 设置页注册 | `ctx.slots.inject('settings.section', () => ctx.slots.register({ name:'settings.section', id:'dsh-mcpserver-manager', order:17, label:<thunk> }, () => <McpManager/>))`。`inject = ['slots','sessions']`，client 侧 `inject` 从宿主拿 React | 设置左侧导航出现「MCP 管理」；点击后右侧渲染本页；与 DSH HUB 市场（order 16）共存无样式冲突 |
| **P0-4** | 列表读取接口 | Host `GET /api/dsh-mcpserver-manager/servers`：读 patch 文件 → 解析受管段 → 返回 `{ items:[{serverName, transport, id, summary, envKeys[], enabled, raw}], file, updatedAt }`。**入口先 `requestRejection` 守卫** | 空文件返回 `{items:[]}`；含 `!!js` 的条目能正确解析不报错；并发读不阻塞 |
| **P0-5** | 添加接口 | Host `POST /api/dsh-mcpserver-manager/servers`，body `{ raw: string }`（原始 JSON 文本，保留行号用于报错）。后端**权威校验**→受管段插入→原子写 | 200 返回新条目；409 重名；400 返回 `{errors:[{path,line,message}]}`；500 返回 `{rollback:true}` 且文件未变 |
| **P0-6** | 双重校验规则引擎 | 规则以**单一数据源**定义（Host 侧导出 `RULES`，Client 侧同源内联/共享），前端即时校验 + 后端提交时再校验一次。规则见 §3.3 | 前后端对同一输入的判定结果完全一致（用例见 §3.3 表） |
| **P0-7** | 添加 MCP 弹窗 | 多行 JSON 编辑器（等宽字体、保留缩进）+ 「填入示例」下拉（stdio / streamable-http 两套模板）+ 实时错误区 + 「写入位置」提示行 + 取消/确定 | 输入即时校验；未通过时「确定」禁用；确定后 loading 态不可重复点击 |
| **P0-8** | 列表回显与刷新 | 卡片列表；写入/删除/启停成功后自动重拉列表；新条目高亮 1.5s | 操作后 ≤1s 内列表更新；刷新浏览器后与文件一致 |
| **P0-9** | 删除 | `DELETE /api/dsh-mcpserver-manager/servers/:serverName`；UI 二次确认弹窗；从受管段移除 | 确认后文件立即少一条；二次确认可取消；删除不存在的名字返回 404 且 UI 友好提示 |
| **P0-10** | 启用 / 停用 | `POST /api/dsh-mcpserver-manager/servers/:serverName/toggle`，body `{enabled:boolean}`；实现为受管段 ↔ 停用段的**注释搬运** | 停用后卡片显示「已停用」态；再次启用可完整恢复原配置（含 `env` 与 `!!js`） |
| **P0-11** | 原子写 + 备份 + 回滚 | 写 `cordis.patch.yml.tmp` → `fsync` → `rename`；写前备份 `cordis.patch.yml.bak`；任一异常→恢复备份并抛错 | 注入失败场景后文件 `md5` 与操作前一致；备份文件存在且可手工恢复 |
| **P0-12** | 三态与错误处理 | 加载态（skeleton，用 `--dsw-alias-bg-skeleton`）、空态、错误态齐全；HTTP 非 2xx 统一映射为用户可读文案；页面级错误 banner | 断网/后端异常时页面不白屏、不卡在 loading |
| **P0-13** | 安全 | 所有 HTTP 入口 `requestRejection` 守卫；`env` 值永不回显明文（仅回 `envKeys`）；不记录 token 到日志 | grep 产物无 token 输出路径；跨连接请求被拒 |
| **P0-14** | 主题与样式系统 | 注入一段作用域限定在 `.dshmcp-` 的 CSS；全部色值走 `--dsw-alias-*` 且带 fallback；8px 栅格；字号 4 档 | 明暗主题下无对比度失效；无一处 JS 主题判断 |

### 3.2 P1 / P2

| ID | 优先级 | 需求 | 备注 |
| --- | --- | --- | --- |
| P1-1 | P1 | **编辑**已存在条目（点卡片「编辑」→ 预填 JSON → 按 `serverName` 原位替换） | P0 只做增/删/启停 |
| P1-2 | P1 | 列表**搜索**（serverName 模糊）+ 状态筛选（全部/已启用/已停用） | — |
| P1-3 | P1 | 未知字段**黄色警告放行**（"未知字段 `xxx` 将被忽略"） | 需 §6-Q8 裁决后定文案 |
| P1-4 | P1 | 卡片「复制为 JSON」/「导出全部」 | — |
| P1-5 | P1 | 展示「N 个工具」（可展开 `mcp__<serverName>__*`） | **依赖 §6-Q4**：宿主是否暴露 MCP 运行时查询服务；不暴露则整条降级 |
| P1-6 | P1 | 批量导入：支持顶层 JSON 数组一次写入多条 | — |
| P1-7 | P1 | 单元测试（`node --test`）：校验引擎 + patch 文本读写（增删/幂等/回滚） | 建议 P0 阶段至少覆盖 patch 读写 |
| P1-8 | P1 | 国际化：label 与文案跟随宿主语言（zh / en） | — |
| P1-9 | P1 | bundle 体积门禁 ≤ 120KB（构建时校验，超了 fail） | 本插件无第三方运行时依赖，120KB 很宽松 |
| P2-1 | P2 | 「测试连接」：启动一次 MCP 握手，返回工具清单与耗时 | 竞品没有的能力，差异化点 |
| P2-2 | P2 | 识别并管理**非本插件写入**的 `@deepseek-ai/dsh-mcp-client` 条目（组合配置行 / 用户手写行） | 依赖 §6-Q2 |
| P2-3 | P2 | 配置漂移检测：文件被外部修改时提示「已外部变更，点击重载」 | — |
| P2-4 | P2 | 备份历史管理与一键回滚 | — |
| P2-5 | P2 | 从 dsh-hub.cc 市场模板一键导入 | — |

### 3.3 校验规则（P0-6，前后端同源）

输入约定：用户在弹窗里录入**一段 JSON**，顶层对象直接就是 MCP 的 `config` 内容（`serverName` / `transport` / `command` ...），**不需要用户手写 `id`/`name`/`config` 外壳**——外壳由后端按 `id = mcp-<serverName>`、`name = '@deepseek-ai/dsh-mcp-client'` 生成。降低录入心智负担，也避免用户写错外壳。

| 规则 | 级别 | 判据 | 错误文案（示例） |
| --- | --- | --- | --- |
| R1 JSON 可解析 | ERROR | `JSON.parse` 成功；失败时提取 `line/column` | `JSON 语法错误（第 3 行）：Unexpected token }` |
| R2 顶层为对象 | ERROR | 非数组、非 null | `配置必须是一个 JSON 对象` |
| R3 `transport` 必填且合法 | ERROR | ∈ {`stdio`, `streamable-http`} | `transport 必填，只能是 stdio 或 streamable-http` |
| R4 `serverName` 格式 | ERROR | `/^[A-Za-z0-9_-]{1,32}$/` | `serverName 只能包含字母、数字、下划线和连字符，长度 1–32` |
| R5 `serverName` 唯一 | ERROR | 与受管段内已有条目比对 | `serverName "github" 已存在，请换一个名字` |
| R6 stdio：`command` 必填 | ERROR | 非空字符串 | `stdio 传输必须提供 command` |
| R7 `args` 类型 | ERROR | 可选；存在则必须是字符串数组 | `args 必须是字符串数组` |
| R8 `env` 类型 | ERROR | 可选；存在则必须是 string→string 字典 | `env 必须是「字符串: 字符串」对象` |
| R9 `cwd` 类型 | ERROR | 可选；必须是非空字符串 | `cwd 必须是字符串` |
| R10 http：`url` 必填且合法 | ERROR | `http://` 或 `https://` 开头且能被 `new URL()` 解析 | `streamable-http 传输必须提供合法的 url` |
| R11 `headers` 类型 | ERROR | 可选；string→string 字典 | `headers 必须是「字符串: 字符串」对象` |
| R12 `toolCallTimeoutMs` | ERROR | 可选；正整数，1–600000 | `toolCallTimeoutMs 必须是 1–600000 的整数` |
| R13 `maxInstructionBytes` | ERROR | 可选；正整数 | `maxInstructionBytes 必须是正整数` |
| R14 `failOnStartupError` | ERROR | 可选；布尔 | `failOnStartupError 必须是布尔值` |
| R15 传输与字段不匹配 | ERROR | stdio 段不允许 `url`/`headers`；http 段不允许 `command`/`args`/`cwd` | `stdio 传输不支持 url 字段` |
| R16 未知字段 | WARN | 不在白名单内 | `未知字段 "foo" 将被忽略`（放行） |

默认值：`toolCallTimeoutMs=60000`、`maxInstructionBytes=32768`、`failOnStartupError=false`（后端补齐后写入）。

### 3.4 `package.json` 关键声明（照抄此形状）

```json
{
  "name": "dsh-mcpserver-manager",
  "version": "0.1.0",
  "type": "module",
  "main": "./lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json",
    "./icon": "./icon.svg"
  },
  "files": ["lib/", "cordis.patch.yml", "icon.svg", "README.md", "LICENSE"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-settings"]
    }
  },
  "scripts": {
    "build": "node scripts/build.mjs",
    "check": "node scripts/build.mjs --check",
    "test": "node --test \"tests/**/*.test.js\""
  }
}
```

> 注意：插件自带的 `cordis.patch.yml`（bundle 层）与运行时写入的 `~/.dsh/profiles/web/cordis.patch.yml`（patch 层）是**两个不同文件**，前者用于声明本插件自身的客户端注入，后者是用户的 MCP 配置。PRD 中统一称后者为「MCP 维护配置文件」。

---

## 4. UI 设计稿

### 4.1 页面骨架

```
┌─ 设置 左侧导航 ──────┬─ 内容区（max-width: 760px，与 DSH HUB 一致）────────────┐
│                      │                                                        │
│  通用                │  MCP 服务器                          [＋ 添加 MCP]     │
│  外观                │  管理已接入的 MCP 服务器。配置将写入当前 DSH 的         │
│  模型                │  MCP 维护配置文件。                                    │
│ ▸ MCP 管理  ← 注册   │                                                        │
│  DSH HUB 市场        │  ┌ 错误/提示 banner（仅异常时出现）──────────────────┐  │
│  …                   │  │ ⚠ 写入失败：xxx（文件已回滚）            [重试][×]│  │
│                      │  └────────────────────────────────────────────────────┘  │
│                      │                                                        │
│                      │  ┌ 工具条 ──────────────────────────────────────────┐   │
│                      │  │ 🔍 搜索 serverName        [ 全部 ▾ ] [ 刷新 ]   │   │
│                      │  └──────────────────────────────────────────────────┘   │
│                      │                                                        │
│                      │  ┌ 空态 ────────────────────────┐ ┌ 卡片列表 ──────┐  │
│                      │  │        ╭──────────╮          │ │ 见 4.2 / 4.3   │  │
│                      │  │        │ （图标）│          │ │                 │  │
│                      │  │        ╰──────────╯          │ │                 │  │
│                      │  │    还没有配置 MCP 服务器     │ │                 │  │
│                      │  │  粘贴一段 JSON 配置即可接入，│ │                 │  │
│                      │  │  配置会写入 cordis.patch.yml │ │                 │  │
│                      │  │       [ ＋ 添加 MCP ]        │ │                 │  │
│                      │  └─────────────────────────────┘ └─────────────────┘  │
└──────────────────────┴────────────────────────────────────────────────────────┘
```

### 4.2 MCP 卡片（列表项）

```
┌──────────────────────────────────────────────────────────────────────┐
│ ● github                        [ stdio ]                [⋯]         │   ← 14px 标题 / 11px chip / 图标按钮
│   npx -y @modelcontextprotocol/server-github                         │   ← 12px 等宽，单行截断
│  ──────────────────────────────────────────────────────────────────  │   ← 1px 分隔线
│   环境  GITHUB_TOKEN ••••••        超时 60s          [ 已启用 ⇄ ]    │   ← 11px 元信息 + 次级开关
└──────────────────────────────────────────────────────────────────────┘

停用态：整卡 opacity .6，状态点变灰，右侧开关显示「已停用」
下拉菜单 [⋯]：编辑(P1) · 复制为 JSON(P1) · 停用/启用 · 删除（红字）
```

### 4.3 添加 MCP 弹窗

```
┌────────────────────────────────────────────────────────────────────┐
│  添加 MCP 服务器                                              [×]  │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│  JSON 配置                                    [ 填入示例 ▾ ]       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ {                                                            │  │
│  │   "serverName": "github",                                    │  │  ← 等宽 12px，行高 20px
│  │   "transport": "stdio",                                      │  │
│  │   "command": "npx",                                          │  │
│  │   "args": ["-y", "@modelcontextprotocol/server-github"],     │  │
│  │   "env": { "GITHUB_TOKEN": "ghp_xxx" }                       │  │
│  │ }                                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌ 错误区（有错才出现，可多条）─────────────────────────────────┐  │
│  │ ⚠ 第 3 行：stdio 传输必须提供 command                        │  │
│  │ ⚠ serverName "github" 已存在，请换一个名字                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ⓘ 写入位置  ~/.dsh/profiles/web/cordis.patch.yml                  │
│     保存后 DSH 将自动热重载，无需重启                              │
│  ────────────────────────────────────────────────────────────────  │
│                                        [ 取消 ]  [ 确定 ]          │
└────────────────────────────────────────────────────────────────────┘
```

### 4.4 设计令牌映射（逐区域）

| 区域 | 背景 | 边框 / 分隔 | 文字 | 其他 |
| --- | --- | --- | --- | --- |
| 页面容器 | 透明（继承设置页） | — | `--dsw-alias-label-primary` | `max-width:760px`；`gap:16px`；`font-family: var(--dsw-font-family, inherit)` |
| 页面标题 | — | — | `--dsw-alias-label-primary`，20px/28px，600 | — |
| 页面副标题 | — | — | `--dsw-alias-label-tertiary`，13px/20px | 含写入路径 |
| 工具条输入框 | `--dsw-alias-bg-layer-1` | `--dsw-alias-border-l2` | `--dsw-alias-label-secondary` | `radius:8px`；focus 时 border → `--dsw-alias-brand-primary` |
| MCP 卡片 | `--dsw-alias-settings-card-fill` | `1px solid var(--dsw-alias-settings-card-stroke)` | — | `radius:10px`；`padding:16px`；`box-shadow: var(--dsw-alias-shadow, none)` |
| 卡片标题 | — | — | `--dsw-alias-label-primary`，14px，600 | — |
| 卡片命令行 | — | — | `--dsw-alias-label-secondary`，12px 等宽 | 单行 `text-overflow:ellipsis` |
| 卡片元信息 | — | — | `--dsw-alias-label-tertiary`，11px | — |
| 卡片分隔线 | — | `--dsw-alias-border-l1` | — | 高 1px，`margin:12px 0` |
| 状态点（启用） | `--dsw-alias-state-business-primary` | — | — | 7px 圆点 |
| 状态点（停用） | `--dsw-alias-label-dimmed` | — | — | 7px 圆点 |
| transport chip | `--dsw-alias-bg-layer-2` | `--dsw-alias-border-l1` | `--dsw-alias-label-secondary`，11px | `radius:6px`；`padding:2px 8px` |
| 主按钮「确定」「添加 MCP」 | `--dsw-alias-button-primary-fill` | — | `--dsw-alias-label-primary-foreground`，12px/600 | `radius:8px`；`h:32px`；hover → `--dsw-alias-button-primary-hover`；disabled `opacity:.5` |
| 次级按钮「取消」 | `--dsw-alias-bg-layer-3` | `--dsw-alias-border-l2` | `--dsw-alias-label-primary` | hover → `--dsw-alias-interactive-bg-hover` |
| 图标按钮 / 菜单项 | transparent | — | `--dsw-alias-label-tertiary` | hover → `--dsw-alias-interactive-bg-hover` |
| 危险操作「删除」 | transparent | — | `--dsw-alias-state-error-primary` | — |
| 错误 banner / 错误文案 | `--dsw-alias-bg-overlay` 或透明 | `--dsw-alias-state-error-primary`（左侧 3px 竖条） | `--dsw-alias-state-error-primary`，12px | `radius:8px` |
| 警告（未知字段） | — | — | `--dsw-alias-state-warning-primary`，12px | — |
| 空态图标 | — | — | `--dsw-alias-label-dimmed`（stroke） | 48px 内联 SVG，`stroke-width:1.5` |
| 空态主文案 | — | — | `--dsw-alias-label-primary`，14px/600 | — |
| 空态副文案 | — | — | `--dsw-alias-label-tertiary`，13px | — |
| 弹窗遮罩 | `--dsw-alias-bg-overlay` | — | — | — |
| 弹窗面板 | `--dsw-alias-bg-layer-2` | `--dsw-alias-border-l3` | — | `radius:12px`；`padding:24px`；`width:560px` |
| JSON 编辑器 | `--dsw-alias-bg-layer-1` | `--dsw-alias-border-l2` | `--dsw-alias-label-primary`，12px 等宽 | `radius:8px`；`padding:12px`；`min-height:200px` |
| 加载 skeleton | `--dsw-alias-bg-skeleton` | — | — | `radius:8px`；呼吸动画 `opacity .6↔1` |
| 说明行 ⓘ | — | — | `--dsw-alias-label-tertiary`，12px | 文件路径用等宽字体 |
| 链接（如有） | — | — | `--dsw-alias-link` | — |

### 4.5 「改善观感偏差」的八条具体措施

这是用户明确提出的核心诉求，逐条落到可执行层面：

1. **零硬编码色值**：所有颜色一律 `var(--dsw-alias-xxx, #fallback)`，fallback 仅用于变量缺失的兜底（与 `dsh-hub` 插件同款做法）。**不使用任何 JS 判断明暗主题**——主题跟随由 CSS 变量天然完成。
2. **说"设置页的语言"**：卡片统一用 `--dsw-alias-settings-card-fill` + `--dsw-alias-settings-card-stroke`，而不是用 `bg-layer-3` + `border-l2` 自造面板。这是原插件最容易"看着不像原生"的地方。
3. **8px 栅格**：所有间距取值 ∈ {4, 8, 12, 16, 24}（4 仅用于图标与文字的紧凑贴边）。卡片内部 padding 16，卡片间距 12，区块间距 24，标题与副标题间距 8。
4. **字号只用 4 档**：11（元信息/chip/eyebrow）、12（按钮/输入/辅助）、13（说明正文）、14（卡片标题），外加页面标题 20。**不出现 15/16/18 这类中间值**。行高固定 1.5（正文）与 1.4（标题）。
5. **圆角统一为 4 档**：外壳 12 / 卡片 10 / 控件按钮 8 / chip 6。**不使用 4px 以下的锐角、也不使用 >16px 的胶囊**（胶囊只用于状态点）。
6. **主按钮唯一化**：一个视图里只出现一个 `--dsw-alias-button-primary-fill` 实心主按钮（列表页=「添加 MCP」，弹窗=「确定」）。列表内所有行操作一律用次级/文字按钮，避免"整页都是蓝块"。
7. **图标全部内联 SVG**：`stroke: currentColor`、`stroke-width:1.5`、16px（空态 48px）。不引图标库——既统一了线宽风格，也把 bundle 体积压住。
8. **三态齐备 + 骨架屏**：空态有图标与引导按钮、加载有 skeleton、失败有可操作 banner。原插件"列表空白时不知道是没数据还是没加载完"的观感问题由此消除。

### 4.6 客户端组件划分（供架构师参考）

```
src/client/entry.js          // inject/apply，slots.inject('settings.section')
src/client/styles.js         // 导出 CSS 字符串（运行时注入 <style>，作用域 .dshmcp-）
src/client/McpManager.jsx    // 页面容器：拉取数据 / 三态分发 / 全局 banner
src/client/Toolbar.jsx       // 搜索 + 筛选 + 刷新（搜索筛选 P1，骨架 P0 预留）
src/client/EmptyState.jsx    // 空态
src/client/ServerList.jsx    // 卡片列表
src/client/ServerCard.jsx    // 单卡片 + ⋯ 菜单 + 启停开关
src/client/AddDialog.jsx     // 添加弹窗（JSON 编辑器 + 错误区 + 写入位置提示）
src/client/ConfirmDialog.jsx // 删除二次确认
src/client/Icons.jsx         // 内联 SVG 图标集

src/index.js                 // Host 入口：webServer 注册 + 路由挂载
src/routes.js                // 4 个路由 handler，每个首行 requestRejection 守卫
src/patch-store.js           // 受管段读写：读 / 增 / 删 / 启停搬运 / 原子写 / 备份回滚
src/validate.js              // 校验规则引擎（单一数据源）
src/serialize.js             // config 对象 → 规范化 YAML 行（含 !!js 透传）
```

---

## 5. 度量标准（Definition of Done）

| 指标 | 目标 |
| --- | --- |
| 页面首屏（空/有数据）渲染 | ≤ 1s |
| 添加一条 MCP 到列表回显 | ≤ 3s |
| 写文件失败后文件一致性 | 内容与操作前 `md5` 一致，UI 可见错误 |
| 连续 20 次增删后段外内容 | `md5` 与初始一致 |
| client bundle 体积 | ≤ 120KB（minify 后，P1 设门禁） |
| 明暗主题切换 | 无一处失效对比度、无一处硬编码色 |
| 前后端校验一致性 | 20 条用例判定结果 100% 一致 |

---

## 6. 待确认问题（请 team-lead 裁决）

> 以下均**不推翻** §1.2 的三项已确认决策，只是实现细节与边界的确认。若未收到答复，架构师按「默认建议」执行。

| # | 问题 | 背景 / 风险 | 默认建议 |
| --- | --- | --- | --- |
| **Q1** | 受管段内条目的 `id` 命名规则？`mcp-<serverName>` 还是 `dsh-mcpserver-manager-<serverName>`？是否与 bundle 层已有的 MCP 条目 id 做过冲突检测？ | 短名更贴近官方 README 示例，长名更不易撞车 | 用 `mcp-<serverName>`；**新增前扫描全文所有 `id:`，撞车则自动加 `-2` 后缀并在写入后提示** |
| **Q2** | P0 是否只读「受管段」？还是全文件扫描所有 `name: '@deepseek-ai/dsh-mcp-client'` 的条目（含用户手写 / 其他插件写入的）？ | 只读受管段最安全但会"看不到"用户手写的 MCP，可能被认为功能缺失；全扫描则需处理"编辑不属于我们的行"的写入风险 | P0 **只读受管段**（安全优先），但在列表底部加一行灰色提示「检测到 N 条非本插件管理的 MCP 条目（只读）」；完整可写支持放 P2-2 |
| **Q3** | cordis patch 层是否原生支持 `disabled: true`（或类似键）来停用条目？ | 若支持，停用实现可更"官方"；若不支持而误用，会导致停用无效 | **不依赖它**。P0 用受管段↔停用段的注释搬运；若架构师在 cordis 源码里确认了原生键，可作为 P1 优化切换 |
| **Q4** | 宿主是否向插件暴露 MCP 运行时服务（能否查询某个 server 已注册的工具列表）？ | 决定 P1-5「N 个工具」能否实现 | 不暴露则 P1-5 整条降级为不展示，卡片只显示静态配置 |
| **Q5** | `env` 脱敏粒度：列表里只显示 key，还是 key + 掩码（如 `ghp••••`），还是允许「点击显示」？ | 涉及便利性与安全的权衡 | P0 只显示 key 名 + `••••`；P1 再加「点击显示」（需二次确认） |
| **Q6** | 只处理当前 profile（`profiles/web`）还是通用？路径是硬编码还是由宿主服务提供？ | 若宿主有 API 能拿到当前 profile 目录，就不该硬编码 | 由宿主提供则优先用；否则 `os.homedir()/.dsh/profiles/web/cordis.patch.yml`，并在 README 里写明 |
| **Q7** | 导航 label 与页面文案：跟随宿主语言（zh/en）还是先只做中文？ | 影响 v0.1.0 工作量 | v0.1.0 先只做中文（宿主 label thunk 直接返回常量），i18n 放 P1-8 |
| **Q8** | 未知字段（R16）策略：警告放行 / 严格拒绝？ | 放行更宽容但可能让用户以为字段生效；拒绝更安全但可能挡住未来新增的官方字段 | **警告放行**，文案明确写「将被忽略」 |
| **Q9** | 备份策略：只保留 `cordis.patch.yml.bak`（每次覆盖）还是带时间戳保留最近 N 份？ | 单份备份在连续两次误操作时可能覆盖掉好数据 | v0.1.0 保留 `.bak`（覆盖式）+ 失败时保留 `.tmp`；带时间戳的多版本备份放 P2-4 |
| **Q10** | DSH Hub 索引公开仓库需要哪些元数据？（README 是否需要特定 frontmatter / `keywords` 是否必须含 `dsh-plugin` / 是否需要 `icon.svg` / 是否校验 `engines.dsh`） | 直接决定"同步发布到 DSH Hub"这一步能否成功 | 建议照抄 `dsh-ssh` 的 README 结构与 `keywords`（含 `dsh-plugin`），并提供 `icon.svg` + `LICENSE(MIT)` + `engines.dsh`。**请 team-lead 确认 dsh-hub.cc 的索引规范** |
| **Q11** | 仓库初始内容范围：是否包含 `tests/` 与 `scripts/e2e.mjs`？还是 v0.1.0 只交付最小可跑产物？ | 影响交付节奏 | 建议：**至少包含 `tests/patch-store.test.js`**（受管段读写的幂等/回滚用例，这是全项目风险最高的一块），其余测试 P1 补齐 |

---

## 7. 附录：与竞品 null119/dsh-mcp-manage 的差异化

| 维度 | 原插件 | 本插件 |
| --- | --- | --- |
| 持久化位置 | `$DSH_HOME/mcp-manage/servers.json`（插件私有） | `cordis.patch.yml`（**DSH 官方 MCP 维护配置文件**，卸载后配置仍在，与宿主原生 MCP 配置同源） |
| 主题 | 观感与 DSH 设计系统有偏差 | 严格 `--dsw-alias-*`，设置页原生卡片语言，零硬编码色值 |
| 录入方式 | 分字段表单（stdio / http 切换） | **粘贴一段 JSON + 双重校验**，与官方配置格式 1:1 对应，便于从文档复制 |
| 组合配置行 | 支持运行时管理 | P0 不支持（只读提示），P2 再补 |
| 差异化增量 | — | 受管段原子写 + 备份回滚；`env` 脱敏；三态齐备；bundle 无第三方依赖 |
