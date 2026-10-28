# dsh-mcpserver-manager

在 DeepSeek Harness 的「设置 → MCP 管理」里管理 MCP 服务器：粘贴一段 JSON → 双重校验 → 写入 DSH **官方**的 MCP 维护配置文件，立刻在列表里回显。

配置写在 `cordis.patch.yml`（DSH 原生 MCP 配置的同一个文件），不是插件私有的 JSON——**卸载插件后配置依然在，与宿主原生 MCP 配置同源**。

---

## 它能做什么

- **粘贴一段 JSON 就能接入**：弹窗里贴配置，输入即时校验，通过后才写盘，写完列表立刻回显并高亮 1.5 秒
- **写入官方配置文件**：写进**当前宿主 profile** 的 `cordis.patch.yml`（例如 desktop 宿主即 `~/.dsh/profiles/desktop/cordis.patch.yml`），按 `name: '@deepseek-ai/dsh-mcp-client'` 的官方条目格式插入，宿主 `patchReload: live` 自动热重载，**不用重启**
- **绝不破坏你的配置文件**：受管段落 + 文本级行编辑 + 原子写 + `.bak` 备份 + 失败自动回滚，**段外一个字节都不动**
- **前后端同一套校验规则**：前后端共用同一个 `src/validate.js`，前端判过的一定能过后端；JSON 语法错能报出「第 N 行第 M 列」
- **env 脱敏**：列表与回显里只出现 `env` 的 key（`GITHUB_TOKEN ••••`），明文永不越过 Host 边界
- **停用/启用可逆**：用 cordis 原生 `disabled: true`，停用后卡片置灰标「已停用」，再启用完整恢复（含 `env` 与 `!!js` 表达式）
- **看得见别人写的 MCP**：用户手写或其它插件写入的条目也会列出来，归到「非本插件管理 · 只读」分组，只展示不改写
- **零运行时依赖**：`dependencies` 为空，构建期只用一个 `esbuild`，客户端 bundle 约 38KB

## 界面

- **列表页**：标题行写明配置会写到哪里，**页头「写入位置」条直接显示当前实际写入的文件路径 + 当前 profile 名 + 这条路径是谁决定的**；每张卡片显示状态点、serverName、传输方式 chip、命令行（过长单行截断、悬浮看全量）、环境 key 与超时
- **空态**：图标 + 主副文案 + 「添加 MCP」按钮——目标文件通常一条 MCP 都没有，空态是默认路径而不是异常
- **添加弹窗**：等宽 JSON 编辑器 + 「填入示例 ▾」（stdio / streamable-http 两套）+ 实时错误区 + 写入位置提示
- **三态齐备**：加载中骨架屏、空态、失败可重试 banner，不会出现「不知道是没数据还是没加载完」
- **主题原生**：全部色值走 `--dsw-alias-*` 设计变量并带 fallback，卡片用设置页语言（`settings-card-fill` + `settings-card-stroke`），**没有任何 JS 明暗判断**

## 安装

### 方式一：插件页直接添加（推荐）

1. 左侧导航点 **插件**
2. 右上角点 **添加插件**
3. 输入框粘贴本仓库地址：

   ```
   https://github.com/liuleiyu121520/dsh-mcpserver-manager
   ```

4. 点 **安装**，完成后在 **设置 → MCP 管理** 里使用

### 方式二：从 DSH Hub 安装

在 [DSH Hub 插件页](https://dsh-hub.cc/plugins/liuleiyu121520/dsh-mcpserver-manager) 点安装，按页面给出的命令执行。

### 方式三：命令行

```bash
dsh plugin --profile <你的 profile> add github:liuleiyu121520/dsh-mcpserver-manager
```

需要固定版本时加 `#` 后缀：

```bash
dsh plugin --profile <你的 profile> add github:liuleiyu121520/dsh-mcpserver-manager#v0.1.0
```

### 卸载

```bash
dsh plugin --profile <你的 profile> remove dsh-mcpserver-manager
```

卸载后本页消失，但**已写入的 MCP 条目仍然留在 `cordis.patch.yml` 里**（它们是 DSH 原生配置，不属于插件）。

## 用法

1. 打开 **设置 → MCP 管理**（页面顶部「写入位置」条会显示当前实际写入的文件与 profile，可先核对一眼）
2. 点 **添加 MCP**，在编辑器里粘贴一段配置（或点「填入示例 ▾」选一套模板改）
3. 错误区为空后点 **确定** → 配置写入 → 列表刷新 → 新条目高亮
4. 卡片上可直接 **停用 / 启用**；点 **⋯** 可 **删除**（二次确认）

### 示例配置：stdio（本地命令）

```json
{
  "serverName": "github",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_TOKEN": "!!js process.env.GITHUB_TOKEN" }
}
```

### 示例配置：streamable-http（远程服务）

```json
{
  "serverName": "remote",
  "transport": "streamable-http",
  "url": "https://example.com/mcp",
  "headers": { "Authorization": "Bearer your-token" }
}
```

> `env` 的值写成 `!!js process.env.X` 时会被**原样写入**（cordis 的私有 tag，运行时才求值），这样 token 不必以明文躺在配置文件里。普通字符串会被加上单引号。

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `serverName` | ✅ | 字母/数字/下划线/连字符，1–32 字符；是工具 namespace，全局唯一 |
| `transport` | ✅ | `stdio` 或 `streamable-http` |
| `command` | stdio 必填 | 可执行文件 |
| `args` | — | 字符串数组 |
| `env` | — | 「字符串: 字符串」字典 |
| `cwd` | — | 工作目录 |
| `url` | http 必填 | `http://` 或 `https://` 且能被解析 |
| `headers` | — | 「字符串: 字符串」字典 |
| `toolCallTimeoutMs` | — | 1–600000 整数，默认 `60000` |
| `maxInstructionBytes` | — | 正整数，默认 `32768` |
| `failOnStartupError` | — | 布尔，默认 `false` |

不在白名单里的字段**不会丢弃**，而是给出黄色警告后原样写入——丢弃会静默吃掉未来官方新增的字段。

## 写入位置与安全

- **写入文件**：**当前宿主 profile** 的 patch 层。插件从宿主拿 `profileContext.patchPath`（cordis `Context` 上的权威字段，由 dsh 在启动 profile 时提供），所以 desktop 宿主写 `~/.dsh/profiles/desktop/cordis.patch.yml`、web 宿主写 `~/.dsh/profiles/web/cordis.patch.yml`——**加完就用得上，不会再出现「加了但工具没出现」**。
- **页面顶部会显示当前实际写入路径**：设置页标题下方的「写入位置」条直接给出 `~/.dsh/profiles/<profile>/cordis.patch.yml`、当前 profile 名，以及这条路径的来源（宿主 `profileContext` / 显式配置 / `$DSH_HOME` / 默认值）。用 `patchFile` 显式指定路径时**不显示 profile 名**——那条路径不一定是 `profiles/<name>/` 形状，与其显示一个和宿主对不上的标签，不如只给路径。Host 日志同一标准：正常为 `mounted profile=desktop file=~/.dsh/profiles/desktop/cordis.patch.yml source=profileContext`；显式指定 `patchFile` 时 profile 一栏写 `(未指定，由 patchFile 决定)`，另有一条 `使用配置中显式指定的 patchFile：<path>`。**日志里不会出现与本机 profile 不符的 profile 名**（排障时要贴的就是这一行）。
- **路径解析优先级**（第一个命中的胜出）：

  | 顺序 | 来源 | 说明 |
  |---|---|---|
  | 1 | 插件配置 `patchFile`（绝对路径） | 精确指定到文件，测试与高级用户的逃生门；相对路径**被忽略** |
  | 2 | 宿主 `profileContext.patchPath` | **正常运行走这条**，宿主说哪个 profile 就是哪个 |
  | 3 | 插件配置 `dshHome` + `profiles/<profile>/` | 宿主未提供 `profileContext` 时（测试 / 独立进程） |
  | 4 | `$DSH_HOME` + `profiles/<profile>/` | 同上 |
  | 5 | `~/.dsh` + `profiles/<profile>/` | 兜底 |

  空字符串或纯空白的 `$DSH_HOME` / `dshHome` 视为**未设置**（不会解析成当前工作目录）。
- **受管段**：本插件只维护下面这段注释之间的内容，段外内容**一个字节都不改**：

  ```yaml
  # >>> dsh-mcpserver-manager:managed:begin (由「设置 → MCP 管理」维护，请勿手改)
  - id: 'mcp-github'
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: 'github'
      transport: 'stdio'
      command: 'npx'
      args:
        - '-y'
        - '@modelcontextprotocol/server-github'
      toolCallTimeoutMs: 60000
      maxInstructionBytes: 32768
      failOnStartupError: false
  # <<< dsh-mcpserver-manager:managed:end
  ```

  > **请勿手改这两个锚点之间、以及锚点本身**。锚点缺失一半、顺序颠倒或重复出现时，页面会切成只读并提示手工修复；你把条目挪到段外它就会变成「非本插件管理 · 只读」。
- **写入流程**：写前落 `cordis.patch.yml.bak` → 写 `cordis.patch.yml.tmp` → `fsync` → `rename` 原子替换；任一步失败自动把 `.bak` 拷回并提示「文件已回滚」
- **手工恢复**：

  ```bash
  # 把 <profile> 换成页面顶部「写入位置」条里显示的那个（例：desktop）
  cp ~/.dsh/profiles/<profile>/cordis.patch.yml.bak ~/.dsh/profiles/<profile>/cordis.patch.yml
  ```

  只有一份 `.bak`（覆盖式），所以误操作两次后要尽快恢复。
- **并发与竞态**：写操作在 Host 进程内串行化，且唯一性判断发生在**落盘前的最后一次扫描**上；文件在读后写前被外部改动会被 checksum 拦下并返回「配置文件已被外部修改，请刷新后重试」
- **env 值脱敏**：`GET /servers` 与页面**永不回显 env 明文**——无论条目由谁写入（本插件、你手写、或其它工具生成的块/流/引号键/行尾注释等形态），env 子树的值一律显示为 `••••`，只有 key 可见。唯一例外是 `!!js process.env.TOKEN` 这类**引用表达式**：它本身不是明文，会原样显示，宿主在启动 MCP 子进程时才求值。明文只存在于落盘文件里（MCP 服务自己要读），不进浏览器
- **脱敏边界**：对「非本插件管理 · 只读」的**不可解析**条目，页面会逐字展示原文（这样你才能看懂并手工处理它），而脱敏只作用于能识别的 `env` 子树——若你把 token 写在 env 之外的位置（比如塞进某段自由文本里），它会随原文显示。**请把秘密只放在 `env` 里**

## 配置

插件自身的可选项写在 `cordis.patch.yml` 的条目 `config` 里：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `profile` | `web` | 宿主未提供 `profileContext` 时要维护的 profile（`profiles/<profile>/`）；**正常运行以宿主实际 profile 为准** |
| `backup` | `true` | 写前是否落 `.bak` |
| `dshHome` | 未设置 | 显式指定 DSH 根目录；优先级高于 `$DSH_HOME`（低于宿主 `profileContext`） |
| `patchFile` | 未设置 | 显式指定到**文件**的绝对路径，连宿主 `profileContext` 都能压过；相对路径被忽略 |

路径解析优先级：**`config.patchFile` > 宿主 `profileContext.patchPath` > `config.dshHome` > `$DSH_HOME` > `~/.dsh`**。空字符串或纯空白的 `$DSH_HOME` / `dshHome` 视为**未设置**（不会解析成当前工作目录）。

想让某台机器强制维护另一个 profile（例如在 desktop 宿主里管理 web 的配置），用 `patchFile` 精确指到文件；只改 `profile` 在正常运行（宿主提供了 `profileContext`）时不生效——这是有意的：那正是「配置写到了宿主不读的文件里」这个 BUG 的成因。

示例：

```yaml
- id: dsh-mcpserver-manager
  name: 'dsh-mcpserver-manager'
  config:
    profile: web
    backup: true
```

## 权限与副作用

- 只读写 profile 下的 `cordis.patch.yml`（及它的 `.bak` / `.tmp`）
- 不发起任何外部网络请求；不读取 `env` 的值（只解析 key），明文 token 不进日志、不进 HTTP 响应
- 不重启宿主；写盘后由宿主的 `patchReload: live` 自行热重载

## 工作原理

```
┌──────── Client 半（esbuild → lib/client.js 单文件 CJS）────────┐
│ launchpad(slots.inject) → McpManager → Toolbar / EmptyState /  │
│   ServerList → ServerCard → AddDialog / ConfirmDialog          │
│ 共享 ../validate.js（同源校验）· api.js · styles.js（CSS）      │
└──────────────────────────┬────────────────────────────────────┘
                     HTTP  /api/dsh-mcpserver-manager/*
┌──────────────────────────┴──────── Host 半（Node ESM）─────────┐
│ index.js → routes.js（守卫 + 4 端点）→ patch-store.js           │
│                                    ├→ paths.js（路径解析）      │
│                                    ├→ serialize.js（→ YAML）    │
│                                    └→ validate.js（同源校验）   │
└────────────────────────────────────────────────────────────────┘
```

**为什么不用 YAML 库**：目标文件里可能有用户注释和 cordis 私有的 `!!js` tag，任何「解析 → 改对象 → 全量 dump」都会把 `!!js process.env.TOKEN` 静默写成字面量——那是不可逆的用户资产损坏。所以本插件自研了一个**受管段感知的行编辑器**：只在自己的锚点段内做字符串拼接式增删，段外字节不变（这一点由单测逐断言覆盖）。

**为什么停用用 `disabled: true`**：已核实 cordis 的 `@deepseek-ai/cordis-plugin-loader` 在启动前会检查 `fiber.entry.disabled`，原生键可用，比注释搬运更"官方"、也更可逆。

## 开发

```bash
npm install          # 只装 esbuild（devDependency），运行时依赖为 0
npm run build        # 生成 lib/index.js 与 lib/client.js
npm run check        # 构建到临时目录，并与仓库里的 lib/ 逐字节比对（有漂移即非零退出）
npm test             # node:test，不需要任何测试框架
```

`lib/` 是构建产物，但**必须入库**（DSH 从 `github:owner/repo` 安装插件时不执行构建，仓库里没有 `lib/` 就装不起来）。所以 `npm run check` 不只"能构建成功"：它会把本次构建的产物与仓库里现有的 `lib/` 逐字节比对，缺文件、多文件、内容不同都会**非零退出**并点名漂移文件——「改了代码忘了 build，带着陈旧产物发版」正是它拦的情况。

本地试用：

```bash
npm run build
ln -s "$(pwd)" ~/.dsh/profiles/web/node_modules/dsh-mcpserver-manager
```

### 发版流程

```bash
# 1. 改 package.json 的 version，重新构建
npm run build && npm run check && npm test
# 2. 提交推送（lib/ 是构建产物，但**必须随仓库分发**——DSH 从 github:owner/repo
#    安装插件时不执行构建，仓库里没有 lib/ 就装不起来）
# 3. 在 GitHub 上基于该提交创建 Release，tag 用 vX.Y.Z
```

## 已知限制

- 编辑已存在的条目是 P1（后端 `replaceEntry()` 已实现并单测，路由与 UI 未暴露）
- 搜索与状态筛选是 P1（Toolbar 未渲染占位控件）
- 「N 个工具」「测试连接」依赖宿主是否暴露 MCP 运行时查询服务，未暴露则整条不展示
- v0.1.0 只做中文文案
- 只维护**一个** profile（默认 `web`）
- 解析能力边界：只认顶层序列项 + 2 空格键 + 更深的 `config` 子块 + 流样式。块标量、锚点引用、多文档等形状会降级为「无法解析 · 只读」并展示原文，**不报错、不写、不猜**

## 许可

MIT — 见 [LICENSE](./LICENSE)。
