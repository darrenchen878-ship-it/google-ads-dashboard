import { parseRange } from "./dateRanges.js";

const channelTypes = ["PERFORMANCE_MAX", "SHOPPING", "SEARCH", "DISPLAY", "DEMAND_GEN"];
const campaigns = [
  { id: "101", name: "PMax - Hero Products", channelType: "PERFORMANCE_MAX" },
  { id: "102", name: "Shopping - Core Catalog", channelType: "SHOPPING" },
  { id: "103", name: "Search - Brand Defense", channelType: "SEARCH" },
  { id: "104", name: "Search - Non Brand", channelType: "SEARCH" },
  { id: "105", name: "Demand Gen - Prospecting", channelType: "DEMAND_GEN" },
  { id: "106", name: "Display - Retargeting", channelType: "DISPLAY" }
];

const products = [
  { id: "SKU-1001", title: "Aurora Carry-On", campaignId: "101" },
  { id: "SKU-1002", title: "Atlas Weekender", campaignId: "101" },
  { id: "SKU-1003", title: "Nova Backpack", campaignId: "102" },
  { id: "SKU-1004", title: "Transit Tote", campaignId: "102" },
  { id: "SKU-1005", title: "Metro Sling", campaignId: "102" },
  { id: "SKU-1006", title: "Voyager Duffel", campaignId: "101" }
];

function dailySeed(index, salt) {
  return Math.sin(index * 1.7 + salt) * 0.5 + Math.cos(index * 0.43 + salt) * 0.5 + 1.4;
}

function metrics(baseCost, index, salt, previous = false) {
  const trend = previous ? 0.88 : 1;
  const wave = dailySeed(index, salt);
  const cost = Math.max(8, baseCost * wave * trend);
  const impressions = Math.round(cost * (85 + salt * 6));
  const ctr = Math.min(0.082, Math.max(0.009, 0.018 + wave * 0.014 + salt * 0.001));
  const clicks = Math.round(impressions * ctr);
  const cpc = clicks ? cost / clicks : 0;
  const conversions = Math.max(0, Number((clicks * (0.021 + salt * 0.003) * (previous ? 0.9 : 1)).toFixed(1)));
  const conversionValue = Number((conversions * (68 + salt * 13)).toFixed(2));
  return {
    impressions,
    clicks,
    cost: Number(cost.toFixed(2)),
    ctr,
    cpc,
    conversions,
    conversionValue,
    roas: cost ? conversionValue / cost : 0
  };
}

function dateSeries(range, previous = false) {
  const parsed = parseRange(range);
  const start = new Date(previous ? parsed.previous.start : parsed.current.start);
  return Array.from({ length: parsed.days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
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

function buildRows(range, previous = false) {
  const dates = dateSeries(range, previous);
  return dates.flatMap((date, index) =>
    campaigns.map((campaign, cIndex) => ({
      date,
      campaignId: campaign.id,
      campaignName: campaign.name,
      channelType: campaign.channelType,
      ...metrics(42 + cIndex * 14, index, cIndex + 1, previous)
    }))
  );
}

function buildProductRows(range, previous = false) {
  const dates = dateSeries(range, previous);
  return dates.flatMap((date, index) =>
    products.map((product, pIndex) => {
      const campaign = campaigns.find((item) => item.id === product.campaignId);
      return {
        date,
        productId: product.id,
        productTitle: product.title,
        campaignId: campaign.id,
        campaignName: campaign.name,
        channelType: campaign.channelType,
        ...metrics(13 + pIndex * 5, index, pIndex + 2, previous)
      };
    })
  );
}

function toSeries(rows, label = "current") {
  return Array.from(groupBy(rows, (row) => row.date)).map(([date, items]) => ({
    date,
    label,
    ...sumRows(items)
  }));
}

function toComparison(currentRows, previousRows) {
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

function percentDelta(current, previous) {
  if (!previous) return null;
  return (current - previous) / previous;
}

function aggregateDimension(rows, previousRows, keyFn, labelFn) {
  const currentGroups = groupBy(rows, keyFn);
  const previousGroups = groupBy(previousRows, keyFn);
  return Array.from(currentGroups.entries())
    .map(([key, currentItems]) => {
      const previousItems = previousGroups.get(key) ?? [];
      return {
        id: key,
        name: labelFn(currentItems[0]),
        ...sumRows(currentItems),
        previous: sumRows(previousItems),
        delta: percentDelta(sumRows(currentItems).roas, sumRows(previousItems).roas)
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

export function getMockDashboard({ range = "last_30_days", campaignId = "all" }) {
  const currentRows = buildRows(range, false).filter((row) => campaignId === "all" || row.campaignId === campaignId);
  const previousRows = buildRows(range, true).filter((row) => campaignId === "all" || row.campaignId === campaignId);
  const currentProductRows = buildProductRows(range, false).filter(
    (row) => campaignId === "all" || row.campaignId === campaignId
  );
  const previousProductRows = buildProductRows(range, true).filter(
    (row) => campaignId === "all" || row.campaignId === campaignId
  );
  const productView = (currentRowsForView, previousRowsForView) => ({
    summary: toComparison(currentRowsForView, previousRowsForView),
    series: {
      current: toSeries(currentRowsForView, "current"),
      previous: toSeries(previousRowsForView, "previous")
    },
    byProduct: aggregateDimension(
      currentRowsForView,
      previousRowsForView,
      (row) => row.productId,
      (row) => row.productTitle
    )
  });
  const productViews = {
    all: productView(currentProductRows, previousProductRows),
    shopping: productView(
      currentProductRows.filter((row) => row.channelType === "SHOPPING"),
      previousProductRows.filter((row) => row.channelType === "SHOPPING")
    ),
    pmax: productView(
      currentProductRows.filter((row) => row.channelType === "PERFORMANCE_MAX"),
      previousProductRows.filter((row) => row.channelType === "PERFORMANCE_MAX")
    )
  };

  return {
    source: "mock",
    generatedAt: new Date().toISOString(),
    range: parseRange(range),
    campaigns,
    summary: toComparison(currentRows, previousRows),
    series: {
      current: toSeries(currentRows, "current"),
      previous: toSeries(previousRows, "previous")
    },
    byChannel: aggregateDimension(currentRows, previousRows, (row) => row.channelType, (row) => row.channelType),
    byCampaign: aggregateDimension(currentRows, previousRows, (row) => row.campaignId, (row) => row.campaignName),
    byProduct: aggregateDimension(currentProductRows, previousProductRows, (row) => row.productId, (row) => row.productTitle),
    productViews,
    productSeries: {
      current: toSeries(currentProductRows, "current"),
      previous: toSeries(previousProductRows, "previous")
    },
    warnings: []
  };
}
