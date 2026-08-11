# Production readiness checklist

> 当前状态：Preview 功能验收完成。此文件只定义 Production 门禁，不授权或执行 Production migration/deployment。

## 必须先完成

- [ ] 在 Neon 明确选择 Production branch，并记录 endpoint、database、migration role 与 runtime role；禁止复用 development 凭据。
- [ ] 在 Production Auth 中配置正式域名、Google OAuth consent/redirect URI，并移除不需要的 Preview trusted domains。
- [ ] 从 Production JWT 核对并设置精确 `NEON_AUTH_ISSUER`；仅在 token 确实包含预期 audience 时设置 `NEON_AUTH_AUDIENCE`。
- [ ] 决定多设备同时编辑配置的策略。当前行为是最后写入者覆盖；如需多人协作，必须先加入 revision conflict（HTTP 409）处理。
- [ ] 为 Production 数据库创建备份/恢复点并约定回滚负责人和维护窗口。
- [ ] 使用 owner migration connection 审阅并依次执行 `drizzle/0000_cuddly_secret_warriors.sql`、`drizzle/0001_lying_chronomancer.sql`。
- [ ] 验证 Production runtime role 只有 `public` 业务表所需的 SELECT/INSERT/UPDATE/DELETE 权限，没有 owner、CREATE、DROP 或 `neon_auth` schema 修改权限。

## Vercel Production 环境变量

- `DATABASE_URL`：Production pooled runtime-role URL，Sensitive，server only。
- `VITE_NEON_AUTH_URL`：Production Neon Auth URL，可公开给浏览器。
- `NEON_AUTH_JWKS_URL`：Production JWKS URL，server only。
- `NEON_AUTH_ISSUER`：Production JWT 的精确 issuer，server only。
- `NEON_AUTH_AUDIENCE`：仅在 Production token 和验证策略要求时设置。

不得向 Vercel Production 添加 `MIGRATION_DATABASE_URL`，不得创建 `VITE_DATABASE_URL`，不得把 Google Client Secret 写入仓库或任何 `VITE_*` 变量。

## 部署门禁

- [ ] TypeScript、全部测试和 Production build 通过。
- [ ] Preview 再完成一次 Google 登录、云配置加载、autosave、General/Chapanda 导出及 History snapshot 验证。
- [ ] 检查 Vercel Production scope 中没有 development URL 或 development database endpoint。
- [ ] 明确批准 Production migration。
- [ ] migration 成功并只读核对表、索引、权限后，另行批准 Production deployment。

## 上线后 smoke test

- 登录、退出与 token 过期处理。
- 首次 workspace 初始化；配置修改后刷新仍存在。
- 自动排班结果与当前基线一致。
- 未导出不创建 History；正式导出恰好创建一个 Revision。
- History 详情、Employee Stats、Download again 和 Excel 文件均来自历史 snapshot。
- 监控 Vercel API 401/403/413/500、Neon latency、连接数与数据库错误；不得记录 Authorization、数据库 URL 或完整配置 snapshot。

## 回滚原则

- 前端/API 异常：将 Vercel 流量回滚到上一稳定 deployment。
- migration 后异常：优先 forward-fix；若必须恢复，使用维护窗口前的 Neon restore point/branch，不在现场手工删除 Production 表或数据。
- 回滚期间暂停正式 Excel 导出，避免新 History 写入分叉的数据状态。
