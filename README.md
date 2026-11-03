<div align="center">

![Token Stats — 看清每一次 AI 对话的消耗](docs/banner.svg)

# Token Stats

**你的 AI 用量仪表盘，让每一次对话都有数可查。**

为 DeepSeek Harness 打造的会话统计插件。把真实 Token 用量、成本估算、月度预算和系统状态，放进你每天使用的侧边栏。

![版本 1.8.1](https://img.shields.io/badge/version-1.8.1-10b981?style=flat-square)
![适用于 DeepSeek Harness](https://img.shields.io/badge/for-DeepSeek_Harness-334155?style=flat-square)
![Windows 与 macOS](https://img.shields.io/badge/platform-Windows_%7C_macOS-334155?style=flat-square)
![中文与英文](https://img.shields.io/badge/language-中文_%7C_English-334155?style=flat-square)

**[下载插件 ZIP](https://github.com/FelixJiashengFu/token-stats/archive/refs/heads/main.zip)** · **[安装指南](INSTALL.md)** · **[反馈问题](https://github.com/FelixJiashengFu/token-stats/issues)**

</div>

---

## 不用等到看账单，才想起查用量

今天消耗了多少 Token？哪个模型用得最多？哪场长对话占了大头？按现在的使用节奏，这个月会不会超预算？

打开 **Token 统计**，从整体趋势一路看到具体会话。写代码时在侧边栏随手看一眼，复盘时再展开完整面板。

| 你想知道 | Token Stats 帮你看清 |
| --- | --- |
| **Token 都用在哪了？** | 总量与输入、输出、缓存分项；按模型查看用量、占比和估算成本 |
| **哪场对话最耗？** | 会话明细与用量排行，支持搜索，以及按用量、成本、最近活动、创建时间排序 |
| **最近的使用量涨了吗？** | 7 / 30 / 90 / 180 天及全部历史趋势，支持切换 Token 与估算成本，还有今日分时图 |
| **这个月预算还够吗？** | 本月估算成本、预算进度、超支提示，以及按当前节奏推算的月底成本 |
| **机器现在忙不忙？** | 系统与 Harness 进程 CPU、内存、负载和运行时间；macOS 另有 GPU 监测 |

> 费用用于了解消耗、比较会话和规划预算，属于估算值；实际结算请以服务商账单为准。

## 一个插件，两种查看方式

### 随手看：右侧边栏

不用离开当前对话，就能查看总 Token、会话数、估算成本、预算进度、近 30 天趋势、模型分布和高消耗会话。底部按钮可直接打开完整面板。

已安装 `dsh-better-sidebar` 时，插件会注册为它的页签；未安装时使用原生右侧栏。

### 认真看：完整统计面板

从左侧栏进入 **Token 统计**，展开会话明细、切换时间范围、比较模型，并调整预算与自定义单价。适合回看一个项目、一段密集使用期，或一次特别长的对话。

## 三步开始使用

**前提：已安装并运行支持本地插件安装的 DeepSeek Harness。** Token Stats 是 Harness 插件，需要宿主环境运行。

1. **[下载 ZIP](https://github.com/FelixJiashengFu/token-stats/archive/refs/heads/main.zip)** 并解压。找到包含 `package.json` 和 `cordis.patch.yml` 的文件夹，通常是 `token-stats-main`。
2. **安装本地插件。** 在 Harness 的插件管理中选择本地插件安装入口，指向该文件夹；也可以对 Harness 里的 AI 说：

   ```text
   安装这个本地插件包：<解压后的文件夹完整路径>
   ```

3. **刷新页面。** Windows 按 `Ctrl+R`，macOS 按 `Cmd+R`，然后打开侧边栏里的 **Token 统计**。

首次打开会索引已有的历史会话，界面会显示进度；完成后继续增量更新。耗时取决于会话数量、日志大小和机器性能。

习惯用 Git？也可以先克隆，再把克隆目录作为本地插件安装：

```bash
git clone https://github.com/FelixJiashengFu/token-stats.git
```

遇到问题可查看 **[完整安装与排查指南](INSTALL.md)**。

## 真实日志，清楚的统计口径

**用量来自你的会话记录。** 插件通过 Harness 的会话服务读取持久化日志，汇总请求实际返回的用量，不生成演示数据，也不需要你手动填写 Token 数量。

- **重复样本按替换处理：** 同一 turn / step 重复报告的用量不反复累加。
- **分叉会话跳过继承前缀：** 避免把继承自父会话的用量再算一次。
- **推理 Token 单列展示：** 推理 Token 已包含在输出中，不重复加进总量。
- **按实际请求归因模型：** 使用日志中的 provider / model 路由信息，而非只看会话当前选择的模型。

```text
总 Token = 未缓存输入 + 缓存读取 + 缓存写入 + 输出
```

统计的完整程度取决于 Harness 留存的日志，以及服务商是否在响应中提供用量信息。

## 成本有依据，预算更直观

插件提供两种计价方式：

| 模式 | 适合怎么用 |
| --- | --- |
| **内置价格表** | 依据项目内置的厂商价格规则，按每条请求的时间和模型估算；覆盖的 DeepSeek 规则区分峰谷时段，设置面板可查看价格来源 |
| **自定义单价** | 按自己的计价假设设置单价与货币符号，用来比较消耗或规划预算 |

**当前版本的币种：** 内置价格表模式下，汇总成本与月度预算统一按 **加元（CA$）** 展示；DeepSeek 模型行保留人民币（¥），以美元计价的 Google 模型行换算为加元。自定义模式使用你设置的单价和货币符号，修改符号本身不会自动换汇。

**价格与汇率是内置快照，不会实时联网更新。** 当前文件标注的快照日期为 `2026-11-02`，具体覆盖模型、有效时段和来源见 [`stats-pricing.js`](stats-pricing.js)。无匹配价格规则的用量会标记为 **未计价**，不代表免费，也不会凭空补上一个价格。

免费额度、订阅权益、阶梯优惠、代理加价及部分缓存存储费用未纳入完整建模；代理模型的底层价格估算也不等于代理实际收费。月底预测按本月已发生的估算成本线性推算，供规划参考。

## 数据留在你的使用环境里

- 插件在 Harness Host 侧读取会话日志并计算统计，**不主动向外部统计服务上传会话数据**，也无需为插件额外配置 API Key。
- 统计接口返回用量、会话标题等聚合信息，不返回聊天正文。
- 预算、自定义单价等设置保存在当前浏览器的 `localStorage` 中。
- 移除插件不会删除你的会话记录。

统计接口复用 Harness 的 Web 服务。它不提供额外的访问认证；同机进程可能读取聚合统计，远程部署时应使用宿主的访问控制。插件未设置跨域读取许可，这不能替代访问认证。

## 安装前，你可能还想知道

**Windows 和 macOS 都能用吗？**

两者均支持 Token、会话、成本、预算与 CPU / 内存统计。GPU 监测依赖 macOS 的系统接口，Windows 会自动隐藏该区域；macOS 上也需要系统返回可用的 GPU 指标。

**需要先装其他侧边栏插件吗？**

不需要。`dsh-better-sidebar` 是可选集成，未安装时会回退到原生右侧栏。

**能看到安装前的历史记录吗？**

能索引 Harness 中仍然保留且可读取的历史会话。已删除、不可读或未记录用量的内容无法补回。

**支持中文吗？**

支持中文和英文界面。

**桌面端能用吗？**

插件通过同源 Web 接口读取统计。若桌面端以 Electron `file://` 加载页面，相对路径请求可能失败；此时请使用 Harness 的 Web 界面。

## 反馈与参与

如果它帮你看清了 AI 用量，欢迎点一个 **Star**，让更多 Harness 用户发现它。

遇到问题或有功能建议，欢迎 [提交 Issue](https://github.com/FelixJiashengFu/token-stats/issues)。反馈时附上操作系统、Harness 版本、插件版本和复现步骤即可；日志、截图中的会话标题与个人信息请先脱敏。

---

<div align="center">

**下一次打开 Harness，也看看你的 Token 去了哪里。**

**[下载 Token Stats](https://github.com/FelixJiashengFu/token-stats/archive/refs/heads/main.zip)** · **[查看安装指南](INSTALL.md)**

<sub>Token Stats · @local/token-stats · v1.8.1</sub>

</div>
