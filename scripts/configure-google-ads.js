import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const scope = "https://www.googleapis.com/auth/adwords";
const callbackPort = 8799;
const redirectUri = `http://127.0.0.1:${callbackPort}/oauth2callback`;
const envPath = new URL("../.env", import.meta.url);

const rl = createInterface({ input, output });

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...value] = line.split("=");
        return [key, value.join("=")];
      })
  );
}

function serializeEnv(values) {
  return [
    `PORT=${values.PORT || "8787"}`,
    `VITE_API_BASE=${values.VITE_API_BASE || "http://localhost:8787"}`,
    "",
    "DATA_MODE=auto",
    `GOOGLE_ADS_API_VERSION=${values.GOOGLE_ADS_API_VERSION || "v25"}`,
    `GOOGLE_ADS_DEVELOPER_TOKEN=${values.GOOGLE_ADS_DEVELOPER_TOKEN || ""}`,
    `GOOGLE_ADS_CLIENT_ID=${values.GOOGLE_ADS_CLIENT_ID || ""}`,
    `GOOGLE_ADS_CLIENT_SECRET=${values.GOOGLE_ADS_CLIENT_SECRET || ""}`,
    `GOOGLE_ADS_REFRESH_TOKEN=${values.GOOGLE_ADS_REFRESH_TOKEN || ""}`,
    `GOOGLE_ADS_CUSTOMER_ID=${values.GOOGLE_ADS_CUSTOMER_ID || ""}`,
    `GOOGLE_ADS_LOGIN_CUSTOMER_ID=${values.GOOGLE_ADS_LOGIN_CUSTOMER_ID || ""}`,
    ""
  ].join("\n");
}

async function ask(name, label, existing, required = true) {
  const suffix = existing ? ` [已有: ${mask(existing)}]` : "";
  while (true) {
    const answer = (await rl.question(`${label}${suffix}: `)).trim();
    if (answer) return answer;
    if (existing) return existing;
    if (!required) return "";
    console.log(`${name} 必填。`);
  }
}

function mask(value) {
  if (!value || value.length <= 8) return value ? "****" : "";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function exchangeCode({ clientId, clientSecret, code }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new Error(`换取 refresh token 失败: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  if (!payload.refresh_token) {
    throw new Error("Google 没有返回 refresh_token。请确认授权 URL 带 access_type=offline，并在同意页选择允许。");
  }
  return payload.refresh_token;
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url, redirectUri);
      if (url.pathname !== "/oauth2callback") {
        response.writeHead(404).end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (error) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end(`Google authorization failed: ${error}`);
        server.close();
        reject(new Error(`Google authorization failed: ${error}`));
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<h1>Google Ads authorization complete</h1><p>You can close this tab and return to Codex.</p>");
      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(callbackPort, "127.0.0.1");
  });
}

async function main() {
  const current = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};

  console.log("\nGoogle Ads 看板配置向导\n");
  console.log("需要 Google Ads developer token、OAuth client id/secret、客户 ID。");
  console.log("这些密钥只会写入本机 .env，不会提交到代码里。\n");

  const values = { ...current };
  values.GOOGLE_ADS_DEVELOPER_TOKEN = await ask(
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "Google Ads developer token（暂时没有可直接回车）",
    current.GOOGLE_ADS_DEVELOPER_TOKEN,
    false
  );
  values.GOOGLE_ADS_CLIENT_ID = await ask("GOOGLE_ADS_CLIENT_ID", "OAuth client ID", current.GOOGLE_ADS_CLIENT_ID);
  values.GOOGLE_ADS_CLIENT_SECRET = await ask(
    "GOOGLE_ADS_CLIENT_SECRET",
    "OAuth client secret",
    current.GOOGLE_ADS_CLIENT_SECRET
  );
  values.GOOGLE_ADS_CUSTOMER_ID = await ask(
    "GOOGLE_ADS_CUSTOMER_ID",
    "Google Ads customer ID，例如 1234567890",
    current.GOOGLE_ADS_CUSTOMER_ID
  );
  values.GOOGLE_ADS_LOGIN_CUSTOMER_ID = await ask(
    "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    "MCC login customer ID，没有可直接回车",
    current.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    false
  );

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: values.GOOGLE_ADS_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent"
  }).toString();

  console.log("\n请打开下面链接，用有 Google Ads 权限的 Google 账号授权：\n");
  console.log(authUrl.toString());
  console.log("\n授权完成后，浏览器会自动回到本机回调地址。");

  const codePromise = waitForCode();
  const code = await codePromise;
  values.GOOGLE_ADS_REFRESH_TOKEN = await exchangeCode({
    clientId: values.GOOGLE_ADS_CLIENT_ID,
    clientSecret: values.GOOGLE_ADS_CLIENT_SECRET,
    code
  });

  writeFileSync(envPath, serializeEnv(values));
  console.log("\n配置完成，已写入 .env。请重启后端，然后刷新看板。");
}

main()
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
