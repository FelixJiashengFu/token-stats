# 更新记录

## 1.8.1

### 分发与安装

- 以 `@jiashengfu/token-stats` 提供 npm 分发，支持通过 `dsh plugin` 安装到指定 profile。
- 包名、Host 配置和客户端注册统一使用正式名称，替代本地包名 `@local/token-stats`。
- 完善项目首页、安装与更新指南、价格币种说明及常见问题。

### 从本地版迁移

在同一 profile 中移除旧的 `@local/token-stats`，再安装 `@jiashengfu/token-stats`，避免重复注册。Token 统计路由、面板标识和浏览器设置存储键保持不变。
