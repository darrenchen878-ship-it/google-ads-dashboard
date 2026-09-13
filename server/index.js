import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGoogleAdsDashboard, hasGoogleAdsConfig } from "./googleAdsClient.js";
import { getMockDashboard } from "./mockData.js";
import { getScriptDashboard, hasScriptDashboardConfig } from "./scriptDashboard.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

app.use(express.json());
app.use((_request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    googleConfigured: hasGoogleAdsConfig(),
    dataMode: process.env.DATA_MODE || "auto"
  });
});

app.get("/api/dashboard", async (request, response) => {
  const params = {
    range: request.query.range || "last_30_days",
    startDate: request.query.startDate || "",
    endDate: request.query.endDate || "",
    campaignId: request.query.campaignId || "all"
  };
  const mode = process.env.DATA_MODE || "auto";

  try {
    if ((mode === "script" || mode === "auto") && hasScriptDashboardConfig()) {
      response.json(await getScriptDashboard(params));
      return;
    }

    if ((mode === "google" || mode === "auto") && hasGoogleAdsConfig()) {
      response.json(await getGoogleAdsDashboard(params));
      return;
    }

    const data = getMockDashboard(params);
    data.warnings.push("Google Ads credentials are not configured. Showing mock data.");
    response.json(data);
  } catch (error) {
    const message = error.message || "";
    if (mode === "google") {
      response.status(502).json({ error: message });
      return;
    }

    const data = getMockDashboard(params);
    if (message.includes("CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION")) {
      data.warnings.push(
        "Google Ads OAuth is configured, but the Cloud project is still approved only for test accounts. Explorer access is required before this production account can be queried."
      );
    } else {
      data.warnings.push(`Live Google Ads request failed, showing mock data: ${message}`);
    }
    response.json(data);
  }
});

app.use(express.static(publicDir));
app.get("/{*splat}", (_request, response) => {
  response.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Google Ads dashboard API listening on http://localhost:${port}`);
});
