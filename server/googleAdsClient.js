import { parseRange } from "./dateRanges.js";

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v25";

export function hasGoogleAdsConfig() {
  return Boolean(
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}

async function getAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).access_token;
}

async function searchStream(query) {
  const accessToken = await getAccessToken();
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID.replaceAll("-", "");
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json"
  };

  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    headers["developer-token"] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  }

  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replaceAll("-", "");
  }

  const response = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query })
    }
  );

  if (!response.ok) {
    throw new Error(`Google Ads query failed: ${response.status} ${await response.text()}`);
  }

  const batches = await response.json();
  return batches.flatMap((batch) => batch.results ?? []);
}

function metricValue(metrics = {}) {
  const cost = Number(metrics.costMicros ?? 0) / 1_000_000;
  const clicks = Number(metrics.clicks ?? 0);
  const impressions = Number(metrics.impressions ?? 0);
  const conversions = Number(metrics.conversions ?? 0);
  const conversionValue = Number(metrics.conversionsValue ?? 0);
  return {
    impressions,
    clicks,
    cost,
    ctr: Number(metrics.ctr ?? (impressions ? clicks / impressions : 0)),
    cpc: Number(metrics.averageCpc ?? 0) / 1_000_000 || (clicks ? cost / clicks : 0),
    conversions,
    conversionValue,
    roas: cost ? conversionValue / cost : 0
  };
}

function normalizeCampaignRow(row) {
  return {
    date: row.segments?.date,
    campaignId: String(row.campaign?.id ?? ""),
    campaignName: row.campaign?.name ?? "Unnamed campaign",
    channelType: row.campaign?.advertisingChannelType ?? "UNKNOWN",
    ...metricValue(row.metrics)
  };
}

function normalizeProductRow(row) {
  return {
    date: row.segments?.date,
    productId: row.segments?.productItemId ?? row.shoppingPerformanceView?.resourceName ?? "Unknown product",
    productTitle: row.segments?.productTitle ?? row.segments?.productItemId ?? "Unknown product",
    campaignId: String(row.campaign?.id ?? ""),
    campaignName: row.campaign?.name ?? "Unnamed campaign",
    channelType: row.campaign?.advertisingChannelType ?? "SHOPPING",
    ...metricValue(row.metrics)
  };
}

function sumRows(rows) {
  const totals = rows.reduce(
    (sum, row) => ({
      impressions: sum.impressions + row.impressions,
      clicks: sum.clicks + row.clicks,
      cost: sum.cost + row.cost,
      conversions: sum.conversions + row.conversions,
      conversionValue: sum.conversionValue + row.conversionValue
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 }
  );
  return derive(totals);
}

function derive(row) {
  return {
    ...row,
    cost: Number(row.cost.toFixed(2)),
    conversionValue: Number(row.conversionValue.toFixed(2)),
    ctr: row.impressions ? row.clicks / row.impressions : 0,
    cpc: row.clicks ? row.cost / row.clicks : 0,
    roas: row.cost ? row.conversionValue / row.cost : 0
  };
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

function toSeries(rows, label) {
  return Array.from(groupBy(rows, (row) => row.date)).map(([date, items]) => ({
    date,
    label,
    ...sumRows(items)
  }));
}

function percentDelta(current, previous) {
  if (!previous) return null;
  return (current - previous) / previous;
}

function comparison(currentRows, previousRows) {
  const current = sumRows(currentRows);
  const previous = sumRows(previousRows);
  return {
    current,
    previous,
    delta: {
      cost: percentDelta(current.cost, previous.cost),
      ctr: percentDelta(current.ctr, previous.ctr),
      cpc: percentDelta(current.cpc, previous.cpc),
      roas: percentDelta(current.roas, previous.roas),
      conversions: percentDelta(current.conversions, previous.conversions)
    }
  };
}

function aggregate(rows, previousRows, keyFn, labelFn) {
  const previousGroups = groupBy(previousRows, keyFn);
  return Array.from(groupBy(rows, keyFn).entries())
    .map(([key, currentItems]) => {
      const current = sumRows(currentItems);
      const previous = sumRows(previousGroups.get(key) ?? []);
      return {
        id: key,
        name: labelFn(currentItems[0]),
        ...current,
        previous,
        delta: percentDelta(current.roas, previous.roas)
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

function campaignQuery(start, end) {
  return `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `;
}

function shoppingQuery(start, end) {
  return `
    SELECT
      segments.date,
      segments.product_item_id,
      segments.product_title,
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `;
}

export async function getGoogleAdsDashboard({ range = "last_30_days", campaignId = "all" }) {
  const parsed = parseRange(range);
  const [currentRaw, previousRaw] = await Promise.all([
    searchStream(campaignQuery(parsed.current.start, parsed.current.end)),
    searchStream(campaignQuery(parsed.previous.start, parsed.previous.end))
  ]);

  const filterCampaign = (row) => campaignId === "all" || String(row.campaignId) === String(campaignId);
  const currentRows = currentRaw.map(normalizeCampaignRow).filter(filterCampaign);
  const previousRows = previousRaw.map(normalizeCampaignRow).filter(filterCampaign);
  const warnings = [];
  let productRows = [];
  let previousProductRows = [];

  try {
    const [currentProductsRaw, previousProductsRaw] = await Promise.all([
      searchStream(shoppingQuery(parsed.current.start, parsed.current.end)),
      searchStream(shoppingQuery(parsed.previous.start, parsed.previous.end))
    ]);
    productRows = currentProductsRaw.map(normalizeProductRow).filter(filterCampaign);
    previousProductRows = previousProductsRaw.map(normalizeProductRow).filter(filterCampaign);
  } catch (error) {
    warnings.push(`Shopping product query failed: ${error.message}`);
  }

  const campaignMap = new Map();
  for (const row of currentRows) {
    campaignMap.set(row.campaignId, {
      id: row.campaignId,
      name: row.campaignName,
      channelType: row.channelType
    });
  }

  return {
    source: "google",
    generatedAt: new Date().toISOString(),
    range: parsed,
    campaigns: Array.from(campaignMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    summary: comparison(currentRows, previousRows),
    series: {
      current: toSeries(currentRows, "current"),
      previous: toSeries(previousRows, "previous")
    },
    byChannel: aggregate(currentRows, previousRows, (row) => row.channelType, (row) => row.channelType),
    byCampaign: aggregate(currentRows, previousRows, (row) => row.campaignId, (row) => row.campaignName),
    byProduct: aggregate(productRows, previousProductRows, (row) => row.productId, (row) => row.productTitle),
    productSeries: {
      current: toSeries(productRows, "current"),
      previous: toSeries(previousProductRows, "previous")
    },
    warnings
  };
}
