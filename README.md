# Google Ads 投放看板

一个本地 React + Express 看板，用于查看：

- 各买法/渠道类型之间的 Cost、CTR、CPC、ROAS 和同期对比
- Campaign 维度流量数据、KPI、曲线和同期对比
- Shopping Product 维度的 Cost、CTR、CPC、ROAS 和趋势

## 启动

本环境没有全局 `npm` 时，可以使用 Codex 内置 Node：

```bash
PATH=/Users/darren/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/darren/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server/index.js
```

另开一个终端启动前端：

```bash
PATH=/Users/darren/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/darren/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vite/bin/vite.js --host 0.0.0.0
```

访问：

```text
http://localhost:5173/
```

## 接入 Google Ads

复制 `.env.example` 为 `.env`，填入：

```dotenv
DATA_MODE=auto
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
```

`DATA_MODE=auto` 会在凭证完整时读取 Google Ads，否则使用 mock 数据；`DATA_MODE=google` 会强制读取真实接口，失败时直接报错。

也可以用配置向导生成 `.env`：

```bash
PATH=/Users/darren/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/darren/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/configure-google-ads.js
```

向导会生成 Google OAuth 授权链接，并把换回来的 `refresh_token` 写入本地 `.env`。

后端使用 Google Ads REST `SearchStream`：

- `campaign` 查询：按日期、campaign 和 advertising channel type 取 Cost、CTR、CPC、Conversions、Conversion Value
- `shopping_performance_view` 查询：按商品 item id/title 聚合 Shopping Product 指标

## 更快方案：Google Ads Script + Google Sheet

如果 Google Ads API 的 Explorer 审核还没通过，可以使用 `integrations/google-ads-script-sync.js`：

1. 新建一个 Google Sheet，把 URL 填进脚本的 `SPREADSHEET_URL`。
2. 在 Google Ads 后台进入“工具 -> 批量操作 -> 脚本”，新建脚本并粘贴该文件。
3. 授权并运行一次，然后设置每天运行。
4. 新建一个 Google Apps Script 项目，粘贴 `integrations/apps-script-dashboard-api.js`，填入同一个 Sheet URL 和随机 token。
5. 部署为 Web app，选择“以自己身份执行”和“任何知道链接的用户”。
6. 把部署后的 Web app URL 和 token 写入 `.env`：

```dotenv
DATA_MODE=script
SHEETS_SYNC_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
SHEETS_SYNC_TOKEN=你的随机token
```

重启后端后，看板会直接读取 Google Ads Script 写入的真实数据。

## 文件结构

```text
server/
  index.js              API 入口
  googleAdsClient.js    Google Ads REST 查询与聚合
  mockData.js           本地演示数据
src/
  main.jsx              看板 UI
  styles.css            样式
```

## 部署到 GitHub + Render

本项目可以部署为一个 Render Web Service：同一个服务同时提供网页和 `/api` 数据接口，其他人通过 Render 网址即可访问。

1. 将项目推送到 GitHub。
2. 在 Render 选择该 GitHub 仓库，使用仓库里的 `render.yaml` 创建 Web Service。
3. 在 Render 的 Environment Variables 中填写：

```dotenv
SHEETS_SYNC_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
SHEETS_SYNC_TOKEN=你的随机token
```

4. 部署完成后访问 Render 提供的网址。

Google Ads 凭证和本地缓存不会提交到 GitHub；线上继续通过 Google Ads Script + Google Sheet 数据桥接读取。
