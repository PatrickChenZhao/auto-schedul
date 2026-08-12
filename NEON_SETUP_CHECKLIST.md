# Neon development setup checklist

本清单只用于 **Neon development branch + Vercel Preview**。在本阶段不要对 Production branch 执行 migration，也不要把 Production 环境变量指向 development 数据库。

## 1. 创建隔离的 Neon 开发环境

1. 在 Neon Project 中从当前正式分支创建 `development` branch。
2. 确认 Console 顶部当前选中的确是 `development`，再进行后续操作。
3. 在该 branch 启用 Neon Auth。
4. 复制该 branch 的 Auth URL；格式通常类似：

   ```text
   https://<endpoint>.neonauth.<region>.aws.neon.build/<database>/auth
   ```

5. 暂时不要在 Production branch 启用或修改配置。

## 2. 配置 Google OAuth

如果 Neon Console 的 Google provider 显示 `Shared keys`，development 可以直接使用 Neon 提供的共享 OAuth 配置，不需要创建或填写 Google Client ID/Secret。

只有准备 Production 品牌、配额或独立 OAuth consent screen 时，才在 Google Cloud Console：

1. 配置 OAuth consent screen。
2. 创建 `OAuth client ID`，Application type 选择 `Web application`。
3. 在 Neon Console 的 Auth → Providers → Google 页面复制其显示的**精确 callback / redirect URI**，原样加入 Google 的 Authorized redirect URIs。不要手工猜路径。
4. 将 Google Client ID 和 Client Secret 填回 Neon Auth 的 Google provider。
5. 在 Neon Auth 的 trusted origins 中加入：
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - 当前 Vercel Preview URL
6. Google Client Secret 只保存在 Google/Neon 的受保护设置中，不写进前端变量，也不要提交到 GitHub。

如果使用 Neon 与 Vercel 的官方集成，Preview branch 的 Auth endpoint 和 trusted origin 可由集成自动配置；仍需确认 Google provider 中的 redirect URI 与 Neon Console 完全一致。

## 3. 准备数据库连接

从 Neon Console 的 Connect 面板选择 `development` branch：

- `MIGRATION_DATABASE_URL`：使用 owner/migration role 的连接串，只放本地受保护环境或专门的 migration CI；不放浏览器。
- `DATABASE_URL`：Vercel Function 使用的 **pooled** 连接串。推荐创建权限受限的 runtime role，不使用 owner role。

development branch 当前已依次执行以下 migration：

```text
drizzle/0000_cuddly_secret_warriors.sql
drizzle/0001_lying_chronomancer.sql
```

`0001` 为 History 增加同周 `revision`、请求 `idempotency_key` 和唯一索引；已有记录按保存时间安全回填 Revision。Production 尚未执行任何上述 migration。

迁移完成后，可为 runtime role（示例名 `auto_schedul_app`）授予最小权限：

```sql
GRANT USAGE ON SCHEMA public TO auto_schedul_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO auto_schedul_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auto_schedul_app;
```

不要给 runtime role `CREATE`, `DROP`, database owner 或 Neon Auth schema 修改权限。

## 4. 本地环境变量

复制 `.env.example` 为 `.env.local`，仅填写 development branch 的值：

```dotenv
VITE_NEON_AUTH_URL=<development Auth URL>
DATABASE_URL=<development pooled runtime-role URL>
MIGRATION_DATABASE_URL=<development owner URL>
NEON_AUTH_JWKS_URL=<从 Neon Auth Configuration 复制的完整 JWKS URL>
# NEON_AUTH_ISSUER=<确认 development JWT 的 iss 后再设置>
```

`NEON_AUTH_ISSUER` 和 `NEON_AUTH_AUDIENCE` 首次联调时默认不设置。取得 development JWT 后确认其 `iss` / `aud`，再添加精确值。

先在浏览器直接访问 `NEON_AUTH_JWKS_URL`，应返回含 `keys` 数组的 JSON；若 404，不要改代码猜路径，应重新从 Neon Auth → Configuration 的复制按钮取得完整地址。

## 5. 只在 development branch 应用 migration

由项目负责人确认连接串后手工运行：

```bash
pnpm db:migrate
```

该命令会明确从被 `.gitignore` 排除的 `.env.local` 读取连接串；如果文件不存在会直接失败，不会回退到任何线上配置。

运行前必须再次确认：

- `MIGRATION_DATABASE_URL` 指向 `development`；
- 主机、database 和 role 与 Neon Connect 面板一致；
- 当前没有设置 Production connection string。

## 6. Vercel Preview 变量

只给 Preview / Development 环境配置：

| Variable | Scope | Value |
|---|---|---|
| `VITE_NEON_AUTH_URL` | Preview + Development | branch-specific Auth URL |
| `DATABASE_URL` | Preview + Development | branch-specific pooled runtime-role URL |
| `NEON_AUTH_JWKS_URL` | Preview + Development | branch-specific JWKS URL |
| `NEON_AUTH_ISSUER` | optional | exact issuer after inspecting a development JWT |
| `NEON_AUTH_AUDIENCE` | optional | only if JWT requires it |

不要在 Vercel 配置 `MIGRATION_DATABASE_URL`。`VITE_` 变量会进入浏览器 bundle，所以其中只能放公开 Auth endpoint，绝不能放数据库连接串或 Google Client Secret。

Neon/Vercel managed integration 可自动向每个 Preview 注入 `DATABASE_URL`、`NEON_AUTH_BASE_URL` 和 `VITE_NEON_AUTH_URL`；本项目仍需从对应 Preview Auth configuration 取得精确 `NEON_AUTH_JWKS_URL`。确认 token issuer 后再设置 `NEON_AUTH_ISSUER`。

## 7. Preview 验收顺序

1. 使用 `vercel dev` 或 Vercel Preview（普通 `vite` dev server 不执行 `/api` Functions）。
2. Google 登录成功。
3. 首次登录出现 localStorage migration 选择，不会自动上传旧数据。
4. 选择导入后，刷新页面能从数据库恢复全部配置。
5. 修改任一员工、availability、preference、demand、shift template 或 special setting，页面显示保存状态，刷新后值不丢失。
6. 自动排班、切换方案、手工编辑、不导出 Excel：History 数量不变。
7. 主 Schedule 选择 Excel format：配置先 flush，History 成功后才下载 Excel，History 恰好增加一条。
8. 模拟 API/数据库失败：Excel 不下载，History 不产生半条记录。
9. 修改当前配置后查看旧 History：历史班表、工时统计和再次下载的 Excel 保持不变。
10. History 的“Download again”不新增 History。

完成以上 Preview 验收后停止，另行制定 Production migration、回滚与切换窗口。

## 8. 2026-08-12 Preview 验收结果

- Google 登录与退出：通过。
- 首次浏览器配置导入及自动保存：通过。
- 新无痕窗口登录后直接从 Neon 加载配置与 History：通过。
- 自动排班但不导出时不创建 History：通过。
- General 正式导出创建 Revision 1：通过。
- Chapanda 正式导出创建 Revision 2：通过。
- 两版均为 23 assignments、5 名员工、224 小时，且 snapshot 完整：通过。
- History `Download again` 不创建新 Revision：通过。
- 修改当前员工名称不影响旧 History snapshot：通过。
- Production migration / Production deployment：未执行。

Production 前仍需单独确认 JWT issuer/audience、配置并发冲突策略、备份/回滚窗口及 Production 环境变量隔离。
