# 安装 Token Stats

把真实 Token 用量、会话排行、成本估算和月度预算，放进 DeepSeek Harness 的侧边栏。

**[npm 包](https://www.npmjs.com/package/@jiashengfu/token-stats)** · **[下载 ZIP](https://github.com/FelixJiashengFu/token-stats/archive/refs/heads/main.zip)** · **[返回项目介绍](README.md)**

## 通过 npm 安装（推荐）

已安装 Harness 的 `dsh` CLI 时，运行：

```bash
dsh plugin --profile web add @jiashengfu/token-stats
```

将 `web` 替换为实际使用的 profile 名称；插件只安装到指定 profile。安装后重启对应 profile，并刷新界面。

若已安装旧的 `@local/token-stats`，请先在同一 profile 中移除旧插件，避免两个版本重复注册同一面板与接口。新包名为 `@jiashengfu/token-stats`，浏览器设置使用的存储键保持不变。

如需固定此版本，可使用：

```bash
dsh plugin --profile web add @jiashengfu/token-stats@1.8.1
```

没有 CLI 或希望使用本地文件夹时，按下面的步骤安装。

## 1. 确认运行环境

- 已安装并运行支持本地插件安装的 **DeepSeek Harness**。
- 支持 **Windows / macOS**。GPU 监测仅在 macOS 且系统返回可用指标时显示。
- `dsh-better-sidebar` 为可选集成，无需提前安装。

本项目是 Harness 插件，不能作为独立应用直接运行。

## 2. 下载并解压

点击上方 **下载 ZIP**，或在仓库首页选择 **Code → Download ZIP**，然后解压。

安装时请选择同时包含下面这些文件的文件夹，通常叫 `token-stats-main`：

```text
token-stats-main/
├── package.json
├── cordis.patch.yml
├── index.js
├── client.js
├── stats-core.js
├── stats-pricing.js
├── icon.svg
└── locale/
```

不要选择 ZIP 文件本身，也不要选择解压目录的上一级。

也可以通过 Git 获取：

```bash
git clone https://github.com/FelixJiashengFu/token-stats.git
```

这种方式安装时选择克隆得到的 `token-stats` 文件夹。

## 3. 安装到 Harness

任选一种方式：

**通过插件管理安装：** 在 Harness 的插件管理中选择「安装本地插件 / Install local bundle」或对应的本地安装入口，指向上一步的文件夹。具体入口名称以宿主版本为准。

**让 Harness 中的 AI 帮你安装：** 将下面的占位内容替换为实际完整路径后发送：

```text
安装这个本地插件包：<解压后的文件夹完整路径>
```

## 4. 刷新并打开统计

安装完成后刷新页面：Windows 按 `Ctrl+R`，macOS 按 `Cmd+R`。

- **左侧栏 → Token 统计：** 完整面板，查看趋势、模型分布、会话明细与设置。
- **右侧栏 → Token 统计：** 紧凑面板，在当前对话旁随时查看用量。

首次打开会索引已有历史会话，界面有进度提示。会话越多、日志越大，等待时间可能越长；完成后会增量更新。

## 5. 设置你的月度预算

在完整面板中打开设置，选择计价模式并填写月度预算。

- **内置价格表模式：** 总成本、本月成本和预算以 **加元（CA$）** 为单位；DeepSeek 模型行显示人民币，Google 模型行换算为加元。价格与汇率来自项目内置快照，不会实时更新。
- **自定义单价模式：** 按你输入的单价和货币符号计算。仅修改货币符号不会自动换算金额。

设置保存在当前浏览器的 `localStorage` 中。更换浏览器或清理站点数据后，可能需要重新设置。

成本与月底预测均为估算；未计价的模型不代表免费，实际结算以服务商账单为准。详细规则见 [成本说明](README.md#成本有依据预算更直观) 和 [`stats-pricing.js`](stats-pricing.js)。

## 常见问题

| 遇到的情况 | 可以先这样检查 |
| --- | --- |
| 安装时找不到插件文件 | 确认所选目录内直接包含 `package.json` 与 `cordis.patch.yml`，没有多套一层文件夹 |
| 安装后没有入口 | 刷新页面，并在插件管理中确认 `@jiashengfu/token-stats` 已启用；再检查宿主是否支持本地插件 |
| 首次打开还没有完整统计 | 查看索引进度并等待完成；大量历史日志需要更长时间 |
| 某些会话用量为空 | 确认 Harness 仍保留对应日志，且服务商响应中包含用量数据；插件不能补回缺失记录 |
| 某些模型显示「未计价」 | 当前内置表没有匹配该模型或请求时段的规则；可查看价格文件或使用自定义单价模式 |
| Windows 看不到 GPU | GPU 监测仅支持 macOS，这是当前的平台差异 |
| 桌面端提示读取失败 | 若页面以 Electron `file://` 加载，相对路径请求可能失败；请改用 Harness 的 Web 界面 |

仍有问题？请 [提交 Issue](https://github.com/FelixJiashengFu/token-stats/issues)，附上操作系统、Harness 版本、插件版本和复现步骤。截图与日志请先脱敏。

## 更新与卸载

**更新 npm 安装：** 将命令中的 `web` 替换为实际 profile 名称，再运行：

```bash
dsh plugin --profile web add @jiashengfu/token-stats@latest
```

更新后重启对应 profile 并刷新界面。

**更新本地安装：** 下载新版并解压到新的文件夹，再通过宿主提供的更新或本地安装入口加载。若宿主不支持直接替换同名插件，可先移除旧插件再安装新版；请保留原文件夹，便于需要时回退。

**卸载：** 在插件管理中移除 `@jiashengfu/token-stats`，刷新页面。插件不会删除你的会话记录。

## 数据与访问范围

插件通过 Harness 的会话服务读取日志，在 Host 侧计算统计，不主动向外部统计服务上传会话数据。统计接口包含用量、会话标题等聚合信息，不包含聊天正文。

统计接口复用宿主 Web 服务，没有插件独立的访问认证；同机进程可能读取统计，远程部署时请使用宿主的访问控制。
