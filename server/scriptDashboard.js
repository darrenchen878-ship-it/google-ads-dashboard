import { parseRange } from "./dateRanges.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let payloadCache = null;
let payloadCachedAt = 0;
const PAYLOAD_CACHE_MS = 60 * 1000;
let refreshPromise = null;
const CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".google-ads-payload-cache.json");

try {
  payloadCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  payloadCachedAt = fs.statSync(CACHE_FILE).mtimeMs;
} catch {
  payloadCache = null;
}

export function hasScriptDashboardConfig() {
  return Boolean(process.env.SHEETS_SYNC_URL && process.env.SHEETS_SYNC_TOKEN);
}

function number(value) {
  return Number(value || 0);
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ga4Number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  if (!value) return "";
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function normalize(row, product = false, keyword = false) {
  const cost = number(row.cost);
  const clicks = number(row.clicks);
  const impressions = number(row.impressions);
  const conversionValue = number(row.conversion_value);
  const impressionShare = nullableNumber(row.impression_share);
  return {
    date: dateOnly(row.date),
    period: row.period,
    campaignId: String(row.campaign_id || ""),
    campaignName: row.campaign_name || "",
    channelType: row.channel_type || "UNKNOWN",
    productId: product ? String(row.product_id || "") : undefined,
    productTitle: product ? row.product_title || row.product_id || "Unknown product" : undefined,
    adGroupId: keyword ? String(row.ad_group_id || "") : undefined,
    adGroupName: keyword ? row.ad_group_name || "" : undefined,
    keyword: keyword ? row.keyword || "" : undefined,
    matchType: keyword ? row.match_type || "" : undefined,
    impressions,
    clicks,
    cost,
    ctr: impressions ? clicks / impressions : 0,
    impressionShare,
    cpc: clicks ? cost / clicks : 0,
    conversions: number(row.conversions),
    conversionValue,
    roas: cost ? conversionValue / cost : 0
  };
}

function derive(row) {
  return {
    ...row,
    ctr: row.impressions ? row.clicks / row.impressions : 0,
    cpc: row.clicks ? row.cost / row.clicks : 0,
    roas: row.cost ? row.conversionValue / row.cost : 0,
    impressionShare: row.impressionShareWeight
      ? row.impressionShareWeighted / row.impressionShareWeight
      : null
  };
}

function sumRows(rows) {
  const totals = rows.reduce(
    (sum, row) => ({
      impressions: sum.impressions + row.impressions,
      clicks: sum.clicks + row.clicks,
      cost: sum.cost + row.cost,
      conversions: sum.conversions + row.conversions,
      conversionValue: sum.conversionValue + row.conversionValue,
      impressionShareWeighted: sum.impressionShareWeighted
        + (row.impressionShare === null || row.impressionShare === undefined
          ? 0
          : row.impressionShare * row.impressions),
      impressionShareWeight: sum.impressionShareWeight
        + (row.impressionShare === null || row.impressionShare === undefined ? 0 : row.impressions)
    }),
    {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversionValue: 0,
      impressionShareWeighted: 0,
      impressionShareWeight: 0
    }
  );
  return derive(totals);
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  return groups;
}

function percentDelta(current, previous) {
  return previous ? (current - previous) / previous : null;
}

function aggregate(currentRows, previousRows, keyFn, labelFn) {
  const previousGroups = groupBy(previousRows, keyFn);
  return Array.from(groupBy(currentRows, keyFn).entries())
    .map(([id, rows]) => {
      const current = sumRows(rows);
      const previous = sumRows(previousGroups.get(id) || []);
      return { id, name: labelFn(rows[0]), ...current, previous, delta: percentDelta(current.roas, previous.roas) };
    })
    .sort((a, b) => b.cost - a.cost);
}

function aggregateCampaigns(currentRows, previousRows) {
  const rows = aggregate(currentRows, previousRows, (row) => row.campaignId, (row) => row.campaignName);
  return rows.map((row) => {
    const source = currentRows.find((item) => item.campaignId === row.id);
    return {
      ...row,
      channelType: source?.channelType || "UNKNOWN"
    };
  });
}

function aggregateCampaignGroups(currentRows, previousRows) {
  const groupRows = aggregate(
    currentRows,
    previousRows,
    (row) => row.channelType,
    (row) => row.channelType
  );
  const campaigns = aggregateCampaigns(currentRows, previousRows);
  return groupRows.map((group) => ({
    ...group,
    name: group.name === "PERFORMANCE_MAX" ? "PMax" : group.name.replace("_", " "),
    children: campaigns.filter((campaign) => campaign.channelType === group.id)
  }));
}

function aggregateChannels(currentRows, previousRows) {
  const rows = aggregate(currentRows, previousRows, (row) => row.channelType, (row) => row.channelType);
  const classify = (row) => (/brand/i.test(row.campaignName) ? "brand" : "non_brand");
  return rows.map((row) => {
    const currentChannelRows = currentRows.filter((item) => item.channelType === row.id);
    const previousChannelRows = previousRows.filter((item) => item.channelType === row.id);
    const brandRows = currentChannelRows.filter((item) => classify(item) === "brand");
    const nonBrandRows = currentChannelRows.filter((item) => classify(item) === "non_brand");
    const previousBrandRows = previousChannelRows.filter((item) => classify(item) === "brand");
    const previousNonBrandRows = previousChannelRows.filter((item) => classify(item) === "non_brand");
    return {
      ...row,
      brand: {
        ...sumRows(brandRows),
        previous: sumRows(previousBrandRows),
        share: row.cost ? sumRows(brandRows).cost / row.cost : 0,
        previousShare: row.previous?.cost ? sumRows(previousBrandRows).cost / row.previous.cost : 0
      },
      nonBrand: {
        ...sumRows(nonBrandRows),
        previous: sumRows(previousNonBrandRows),
        share: row.cost ? sumRows(nonBrandRows).cost / row.cost : 0,
        previousShare: row.previous?.cost ? sumRows(previousNonBrandRows).cost / row.previous.cost : 0
      }
    };
  });
}

function aggregateBrand(currentRows, previousRows) {
  const classify = (row) => (/brand/i.test(row.campaignName) ? "brand" : "non_brand");
  const currentTotal = sumRows(currentRows);
  const previousTotal = sumRows(previousRows);
  const previousGroups = groupBy(previousRows, classify);
  const searchCampaigns = new Set([
    "*BM | DTC | Search | Tapo Category Brand Germany",
    "*BM | DTC | Search | Tapo Pure Brand Germany",
    "*BM | DTC | Search | Tapo Pure Brand Austria"
  ]);

  return ["brand", "non_brand"].map((id) => {
    const rows = currentRows.filter((row) => classify(row) === id);
    const current = sumRows(rows);
    const previous = sumRows(previousGroups.get(id) || []);
    let channels = [];
    if (id === "brand") {
      const shoppingRows = rows.filter((row) => row.channelType === "SHOPPING");
      const previousShoppingRows = (previousGroups.get(id) || []).filter((row) => row.channelType === "SHOPPING");
      const shopping = aggregate(
        shoppingRows,
        previousShoppingRows,
        () => "shopping",
        () => "SHOPPING"
      );
      const search = aggregate(
        rows.filter((row) => row.channelType === "SEARCH" && searchCampaigns.has(row.campaignName)),
        (previousGroups.get(id) || []).filter((row) => row.channelType === "SEARCH" && searchCampaigns.has(row.campaignName)),
        (row) => row.campaignId,
        (row) => row.campaignName
      ).concat(
        aggregate(
          rows.filter((row) => row.channelType === "SEARCH" && !searchCampaigns.has(row.campaignName)),
          (previousGroups.get(id) || []).filter((row) => row.channelType === "SEARCH" && !searchCampaigns.has(row.campaignName)),
          () => "other_brand_search",
          () => "其他Search产品词"
        )
      );
      channels = [...shopping, ...search].map((row) => ({
        ...row,
        parentId: id,
        isChild: true,
        isCampaign: row.name !== "SHOPPING",
        costShare: current.cost ? row.cost / current.cost : 0,
        valueShare: current.conversionValue ? row.conversionValue / current.conversionValue : 0,
        previousCostShare: previous.cost ? row.previous?.cost / previous.cost : 0,
        previousValueShare: previous.conversionValue ? row.previous?.conversionValue / previous.conversionValue : 0
      }));
    }
    return {
      id,
      name: id === "brand" ? "品牌词" : "非品牌词",
      ...current,
      previous,
      costShare: currentTotal.cost ? current.cost / currentTotal.cost : 0,
      valueShare: currentTotal.conversionValue ? current.conversionValue / currentTotal.conversionValue : 0,
      previousCostShare: previousTotal.cost ? previous.cost / previousTotal.cost : 0,
      previousValueShare: previousTotal.conversionValue ? previous.conversionValue / previousTotal.conversionValue : 0,
      delta: percentDelta(current.roas, previous.roas),
      channels
    };
  }).filter((row) => row.cost > 0 || row.conversionValue > 0);
}

function dailySeries(rows) {
  return Array.from(groupBy(rows, (row) => row.date))
    .map(([date, items]) => ({ date, ...sumRows(items) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function channelDailySeries(rows) {
  const result = { all: { current: dailySeries(rows.filter((row) => row.period === "current")), previous: dailySeries(rows.filter((row) => row.period === "previous")) } };
  const channels = Array.from(new Set(rows.map((row) => row.channelType).filter(Boolean)));
  channels.forEach((channel) => {
    const selected = rows.filter((row) => row.channelType === channel);
    result[channel] = {
      current: dailySeries(selected.filter((row) => row.period === "current")),
      previous: dailySeries(selected.filter((row) => row.period === "previous"))
    };
  });
  return result;
}

function classifiedDailySeries(rows) {
  const classify = (row) => (/brand/i.test(row.campaignName) ? "brand" : "non_brand");
  const result = {};
  ["brand", "non_brand"].forEach((key) => {
    const selected = rows.filter((row) => classify(row) === key);
    result[key] = {
      current: dailySeries(selected.filter((row) => row.period === "current")),
      previous: dailySeries(selected.filter((row) => row.period === "previous"))
    };
  });
  return result;
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

function dateWindow(rows, parsed) {
  if (parsed.explicit) return { current: parsed.current, previous: parsed.previous };
  const dates = rows.map((row) => row.date).filter(Boolean).sort();
  const currentEnd = dates.at(-1);
  if (!currentEnd) {
    return {
      current: { start: parsed.current.start, end: parsed.current.end },
      previous: { start: parsed.previous.start, end: parsed.previous.end }
    };
  }

  const end = new Date(`${currentEnd}T00:00:00Z`);
  const currentStart = new Date(end);
  currentStart.setUTCDate(currentStart.getUTCDate() - parsed.days + 1);
  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - parsed.days + 1);

  const format = (date) => date.toISOString().slice(0, 10);
  return {
    current: { start: format(currentStart), end: format(end) },
    previous: { start: format(previousStart), end: format(previousEnd) }
  };
}

function within(date, window) {
  return date >= window.start && date <= window.end;
}

async function fetchPayload() {
  const response = await fetch(
    `${process.env.SHEETS_SYNC_URL}?token=${encodeURIComponent(process.env.SHEETS_SYNC_TOKEN)}`
  );
  if (!response.ok) throw new Error(`Apps Script bridge failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  payloadCache = payload;
  payloadCachedAt = Date.now();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(payload));
  return payload;
}

function refreshPayload() {
  if (!refreshPromise) {
    refreshPromise = fetchPayload().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function viewForRows(campaignRows, productRows) {
  const current = campaignRows.filter((row) => row.period === "current");
  const previous = campaignRows.filter((row) => row.period === "previous");
  const currentProducts = productRows.filter((row) => row.period === "current");
  const previousProducts = productRows.filter((row) => row.period === "previous");

  return {
    summary: comparison(current, previous),
    series: { current: dailySeries(current), previous: dailySeries(previous) },
    channelSeries: channelDailySeries(campaignRows),
    brandSeries: {
      all: { current: dailySeries(current), previous: dailySeries(previous) },
      ...classifiedDailySeries(campaignRows)
    },
    byChannel: aggregateChannels(current, previous),
    byBrand: aggregateBrand(current, previous),
    byCampaign: aggregateCampaigns(current, previous),
    byCampaignGroups: aggregateCampaignGroups(current, previous),
    byProduct: aggregate(currentProducts, previousProducts, (row) => row.productId, (row) => row.productTitle),
    productSeries: { current: dailySeries(currentProducts), previous: dailySeries(previousProducts) }
  };
}

function productViewForRows(productRows) {
  const current = productRows.filter((row) => row.period === "current");
  const previous = productRows.filter((row) => row.period === "previous");
  return {
    summary: comparison(current, previous),
    series: { current: dailySeries(current), previous: dailySeries(previous) },
    byProduct: aggregate(current, previous, (row) => row.productId, (row) => row.productTitle),
    productSeries: { current: dailySeries(current), previous: dailySeries(previous) }
  };
}

function keywordViewForRows(keywordRows) {
  const current = keywordRows.filter((row) => row.period === "current");
  const previous = keywordRows.filter((row) => row.period === "previous");
  const keyFn = (row) => `${row.campaignId}::${row.adGroupId}::${row.keyword}::${row.matchType}`;
  const byKeyword = aggregate(current, previous, keyFn, (row) => row.keyword || "Unknown keyword").map((row) => {
    const source = current.find((item) => keyFn(item) === row.id);
    return {
      ...row,
      campaignName: source?.campaignName || "",
      campaignId: source?.campaignId || "",
      adGroupName: source?.adGroupName || "",
      adGroupId: source?.adGroupId || "",
      matchType: source?.matchType || ""
    };
  });

  return {
    summary: comparison(current, previous),
    series: { current: dailySeries(current), previous: dailySeries(previous) },
    byKeyword
  };
}

function normalizeGa4(row) {
  return {
    date: dateOnly(row.date),
    channel: row.sessionDefaultChannelGroup || "",
    activeUsers: ga4Number(row.activeUsers),
    totalUsers: ga4Number(row.totalUsers),
    newUsers: ga4Number(row.newUsers),
    sessions: ga4Number(row.sessions),
    engagedSessions: ga4Number(row.engagedSessions),
    engagementRate: ga4Number(row.engagementRate),
    conversions: ga4Number(row.conversions),
    purchases: ga4Number(row.ecommercePurchases),
    revenue: ga4Number(row.totalRevenue)
  };
}

function ga4Totals(rows) {
  const totals = rows.reduce((sum, row) => ({
    activeUsers: sum.activeUsers + row.activeUsers,
    totalUsers: sum.totalUsers + row.totalUsers,
    newUsers: sum.newUsers + row.newUsers,
    sessions: sum.sessions + row.sessions,
    engagedSessions: sum.engagedSessions + row.engagedSessions,
    conversions: sum.conversions + row.conversions,
    purchases: sum.purchases + row.purchases,
    revenue: sum.revenue + row.revenue,
    engagementRateWeighted: sum.engagementRateWeighted + row.engagementRate * row.sessions
  }), {
    activeUsers: 0,
    totalUsers: 0,
    newUsers: 0,
    sessions: 0,
    engagedSessions: 0,
    conversions: 0,
    purchases: 0,
    revenue: 0,
    engagementRateWeighted: 0
  });
  return {
    ...totals,
    engagementRate: totals.sessions ? totals.engagementRateWeighted / totals.sessions : 0
  };
}

function ga4DailySeries(rows) {
  const groups = groupBy(rows, (row) => row.date);
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({ date, ...ga4Totals(values) }));
}

function ga4ViewForRows(ga4Rows, ga4ChannelRows, window) {
  const periodize = (rows) => rows.map((row) => ({
    ...row,
    period: within(row.date, window.current) ? "current" : "previous"
  })).filter((row) => within(row.date, window.current) || within(row.date, window.previous));
  const rows = periodize(ga4Rows);
  const channels = periodize(ga4ChannelRows);
  const current = rows.filter((row) => row.period === "current");
  const previous = rows.filter((row) => row.period === "previous");
  const currentChannels = channels.filter((row) => row.period === "current");
  const previousChannels = channels.filter((row) => row.period === "previous");
  const channelKey = (row) => row.channel || "Unassigned";
  return {
    summary: {
      current: ga4Totals(current),
      previous: ga4Totals(previous),
      delta: Object.fromEntries(["activeUsers", "totalUsers", "newUsers", "sessions", "engagedSessions", "engagementRate", "conversions", "purchases", "revenue"].map((key) => [
        key,
        percentDelta(ga4Totals(current)[key], ga4Totals(previous)[key])
      ]))
    },
    series: {
      current: ga4DailySeries(current),
      previous: ga4DailySeries(previous)
    },
    byChannel: Array.from(groupBy(currentChannels, channelKey).entries()).map(([name, values]) => {
      const currentTotal = ga4Totals(values);
      const previousTotal = ga4Totals(groupBy(previousChannels, channelKey).get(name) || []);
      return {
        id: name,
        name,
        ...currentTotal,
        previous: previousTotal,
        delta: Object.fromEntries(["sessions", "activeUsers", "engagementRate", "conversions", "revenue"].map((key) => [
          key,
          percentDelta(currentTotal[key], previousTotal[key])
        ]))
      };
    }).sort((a, b) => b.sessions - a.sessions)
  };
}

export async function getScriptDashboard({
  range = "last_30_days",
  startDate = "",
  endDate = "",
  campaignId = "all"
}) {
  let payload = payloadCache;
  const stale = !payload || Date.now() - payloadCachedAt > PAYLOAD_CACHE_MS;
  if (!payload) {
    payload = await refreshPayload();
  } else if (stale) {
    refreshPayload().catch((error) => console.warn(error.message));
  }

  const parsed = parseRange(range, startDate, endDate);
  const rawCampaignRows = (payload.campaignRows || [])
    .map((row) => normalize(row))
    .filter((row) => row.campaignName.includes("*BM"));
  const rawProductRows = (payload.productRows || [])
    .map((row) => normalize(row, true))
    .filter((row) => row.campaignName.includes("*BM"));
  const rawKeywordRows = (payload.keywordRows || [])
    .map((row) => normalize(row, false, true))
    .filter((row) => row.campaignName.includes("*BM"));
  const rawGa4Rows = (payload.ga4Rows || []).map(normalizeGa4);
  const rawGa4ChannelRows = (payload.ga4ChannelRows || []).map(normalizeGa4);
  const window = dateWindow(rawCampaignRows, parsed);
  const campaignRows = rawCampaignRows.filter(
    (row) => within(row.date, window.current) || within(row.date, window.previous)
  );
  const productRows = rawProductRows.filter(
    (row) => within(row.date, window.current) || within(row.date, window.previous)
  );
  const keywordRows = rawKeywordRows.filter(
    (row) => within(row.date, window.current) || within(row.date, window.previous)
  );
  const ga4View = ga4ViewForRows(rawGa4Rows, rawGa4ChannelRows, window);
  const campaigns = Array.from(
    new Map(
      campaignRows
        .filter((row) => within(row.date, window.current))
        .map((row) => [row.campaignId, { id: row.campaignId, name: row.campaignName, channelType: row.channelType }])
    ).values()
  );
  const overall = viewForRows(campaignRows.map((row) => ({
    ...row,
    period: within(row.date, window.current) ? "current" : "previous"
  })), productRows.map((row) => ({
    ...row,
    period: within(row.date, window.current) ? "current" : "previous"
  })));
  const selectedCampaignRows = campaignId === "all"
    ? campaignRows
    : campaignRows.filter((row) => row.campaignId === String(campaignId));
  const selectedProductRows = campaignId === "all"
    ? productRows
    : productRows.filter((row) => row.campaignId === String(campaignId));
  const selectedKeywordRows = campaignId === "all"
    ? keywordRows
    : keywordRows.filter((row) => row.campaignId === String(campaignId));
  const campaignView = viewForRows(selectedCampaignRows.map((row) => ({
    ...row,
    period: within(row.date, window.current) ? "current" : "previous"
  })), selectedProductRows.map((row) => ({
    ...row,
    period: within(row.date, window.current) ? "current" : "previous"
  })));
  const periodizedProducts = selectedProductRows.map((row) => ({
    ...row,
    period: within(row.date, window.current) ? "current" : "previous"
  }));
  const productViews = {
    all: productViewForRows(periodizedProducts),
    shopping: productViewForRows(periodizedProducts.filter((row) => row.channelType === "SHOPPING")),
    pmax: productViewForRows(periodizedProducts.filter((row) => row.channelType === "PERFORMANCE_MAX"))
  };
  const keywordView = keywordViewForRows(selectedKeywordRows.map((row) => ({
    ...row,
    period: within(row.date, window.current) ? "current" : "previous"
  })));

  return {
    source: "google-ads-script",
    generatedAt: payload.generatedAt,
    range: { ...parsed, current: window.current, previous: window.previous },
    campaigns,
    ...overall,
    campaignView,
    productViews,
    keywordView,
    ga4View,
    warnings: []
  };
}
