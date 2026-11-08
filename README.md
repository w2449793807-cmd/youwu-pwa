# 有物

个人物品资产 + 极简记账 PWA。iPhone Safari 打开后，分享 → 添加到主屏幕即可使用。

## 本地运行

```bash
npm run serve
```

打开 `http://localhost:4173`。

## 云端同步

1. 在 [Supabase](https://supabase.com/) 创建一个免费项目。
2. 在 SQL Editor 执行 `supabase/schema.sql`。
3. 在 Authentication → Providers 开启 Email。
4. 从 Project Settings → API 取得 `Project URL` 和 `anon public` key。
5. 填入 `config.js` 的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`。
6. 部署到 HTTPS 静态托管后，在“设置 → 云端 → 登录同步”用邮箱验证码登录。

`anon public` key 可以放在前端；数据安全由 `supabase/schema.sql` 中的 RLS 根据 `auth.uid()` 隔离。不要使用 `service_role` key。

## 部署到 GitHub Pages

仓库根目录就是发布目录。推送后：

1. Settings → Pages
2. Source 选择 `Deploy from a branch`
3. Branch 选择 `main`，目录选择 `/ (root)`
4. 用 Pages 发布的 HTTPS 地址打开，Safari 添加到主屏幕

## 功能

- 物品：照片、价格、日期、分类、状态、使用次数、日均/次均、附加费、卖出价、搜索与分类筛选
- 记账：收入/支出、金额、分类、账户、日期、备注、月份、汇总、分类统计、搜索、编辑删除
- 数据：本地 IndexedDB、JSON 全量备份/合并/覆盖恢复、CSV 导出
- 云端：Supabase 邮箱验证码登录、跨设备同步、记录级 last-write-wins 合并
