/*
 * Google Ads Script -> Google Sheet
 *
 * 1. Create a blank Google Sheet and paste its URL below.
 * 2. In Google Ads, open Tools -> Bulk actions -> Scripts.
 * 3. Create a script, paste this file, authorize it, and schedule it daily.
 */

var SPREADSHEET_URL = "PASTE_GOOGLE_SHEET_URL_HERE";
var LOOKBACK_DAYS = 90;

function main() {
  if (SPREADSHEET_URL.indexOf("PASTE_") === 0) {
    throw new Error("Set SPREADSHEET_URL before running this script.");
  }

  var spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  var dates = getDateRanges(LOOKBACK_DAYS);

  writeCampaignRows(spreadsheet, dates);
  writeProductRows(spreadsheet, dates);
  writeKeywordRows(spreadsheet, dates);
  Logger.log("Google Ads dashboard sync complete.");
}

function writeCampaignRows(spreadsheet, dates) {
  var sheet = getSheet(spreadsheet, "campaign_daily");
  var headers = [
    "period", "date", "campaign_id", "campaign_name", "channel_type",
    "impressions", "clicks", "ctr", "average_cpc", "cost",
    "conversions", "conversion_value"
  ];
  resetSheet(sheet, headers);

  var rows = [];
  rows = rows.concat(queryRows(campaignQuery(dates.current), "current"));
  rows = rows.concat(queryRows(campaignQuery(dates.previous), "previous"));
  appendRows(sheet, rows);
}

function writeProductRows(spreadsheet, dates) {
  var sheet = getSheet(spreadsheet, "product_daily");
  var headers = [
    "period", "date", "product_id", "product_title", "campaign_id",
    "campaign_name", "channel_type", "impressions", "clicks", "ctr",
    "average_cpc", "cost", "conversions", "conversion_value"
  ];
  resetSheet(sheet, headers);

  var rows = [];
  rows = rows.concat(queryRows(productQuery(dates.current), "current"));
  rows = rows.concat(queryRows(productQuery(dates.previous), "previous"));
  appendRows(sheet, rows);
}

function writeKeywordRows(spreadsheet, dates) {
  var sheet = getSheet(spreadsheet, "keyword_daily");
  var headers = [
    "period", "date", "campaign_id", "campaign_name", "channel_type",
    "ad_group_id", "ad_group_name", "keyword", "match_type",
    "impressions", "clicks", "ctr", "average_cpc", "cost",
    "conversions", "conversion_value"
  ];
  resetSheet(sheet, headers);

  var rows = [];
  rows = rows.concat(queryKeywordRows(keywordQuery(dates.current), "current"));
  rows = rows.concat(queryKeywordRows(keywordQuery(dates.previous), "previous"));
  appendRows(sheet, rows);
}

function queryRows(query, period) {
  var rows = [];
  var results = AdsApp.search(query);

  while (results.hasNext()) {
    var row = results.next();
    var metrics = row.metrics || {};
    var campaign = row.campaign || {};
    var segments = row.segments || {};
    var cost = Number(metrics.costMicros || 0) / 1000000;
    var clicks = Number(metrics.clicks || 0);
    var impressions = Number(metrics.impressions || 0);
    var conversions = Number(metrics.conversions || 0);
    var conversionValue = Number(metrics.conversionsValue || 0);
    var averageCpc = Number(metrics.averageCpc || 0) / 1000000;
    var ctr = Number(metrics.ctr || (impressions ? clicks / impressions : 0));

    if (row.shoppingPerformanceView) {
      rows.push([
        period, segments.date, segments.productItemId || "",
        segments.productTitle || "", String(campaign.id || ""),
        campaign.name || "", campaign.advertisingChannelType || "",
        impressions, clicks, ctr, averageCpc, cost, conversions, conversionValue
      ]);
    } else {
      rows.push([
        period, segments.date, String(campaign.id || ""),
        campaign.name || "", campaign.advertisingChannelType || "",
        impressions, clicks, ctr, averageCpc, cost, conversions, conversionValue
      ]);
    }
  }

  return rows;
}

function queryKeywordRows(query, period) {
  var rows = [];
  var results = AdsApp.search(query);

  while (results.hasNext()) {
    var row = results.next();
    var metrics = row.metrics || {};
    var campaign = row.campaign || {};
    var adGroup = row.adGroup || {};
    var criterion = row.adGroupCriterion || {};
    var keyword = criterion.keyword || {};
    var segments = row.segments || {};
    var cost = Number(metrics.costMicros || 0) / 1000000;
    var clicks = Number(metrics.clicks || 0);
    var impressions = Number(metrics.impressions || 0);
    var conversions = Number(metrics.conversions || 0);
    var conversionValue = Number(metrics.conversionsValue || 0);
    var averageCpc = Number(metrics.averageCpc || 0) / 1000000;
    var ctr = Number(metrics.ctr || (impressions ? clicks / impressions : 0));

    rows.push([
      period, segments.date, String(campaign.id || ""),
      campaign.name || "", campaign.advertisingChannelType || "",
      String(adGroup.id || ""), adGroup.name || "",
      keyword.text || "", keyword.matchType || "",
      impressions, clicks, ctr, averageCpc, cost, conversions, conversionValue
    ]);
  }

  return rows;
}

function campaignQuery(range) {
  return [
    "SELECT segments.date, campaign.id, campaign.name,",
    "campaign.advertising_channel_type, metrics.impressions, metrics.clicks,",
    "metrics.ctr, metrics.average_cpc, metrics.cost_micros,",
    "metrics.conversions, metrics.conversions_value",
    "FROM campaign",
    "WHERE segments.date BETWEEN '" + range.start + "' AND '" + range.end + "'",
    "AND campaign.status != 'REMOVED'",
    "ORDER BY segments.date"
  ].join(" ");
}

function productQuery(range) {
  return [
    "SELECT segments.date, segments.product_item_id, segments.product_title,",
    "campaign.id, campaign.name, campaign.advertising_channel_type,",
    "metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,",
    "metrics.cost_micros, metrics.conversions, metrics.conversions_value",
    "FROM shopping_performance_view",
    "WHERE segments.date BETWEEN '" + range.start + "' AND '" + range.end + "'",
    "ORDER BY segments.date"
  ].join(" ");
}

function keywordQuery(range) {
  return [
    "SELECT segments.date, campaign.id, campaign.name,",
    "campaign.advertising_channel_type, ad_group.id, ad_group.name,",
    "ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,",
    "metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,",
    "metrics.cost_micros, metrics.conversions, metrics.conversions_value",
    "FROM keyword_view",
    "WHERE segments.date BETWEEN '" + range.start + "' AND '" + range.end + "'",
    "AND campaign.advertising_channel_type = 'SEARCH'",
    "AND campaign.status != 'REMOVED'",
    "ORDER BY segments.date"
  ].join(" ");
}

function getDateRanges(days) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var end = new Date(today.getTime() - 86400000);
  var start = new Date(end.getTime() - (days - 1) * 86400000);
  var previousEnd = new Date(start.getTime() - 86400000);
  var previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);
  return {
    current: { start: dateString(start), end: dateString(end) },
    previous: { start: dateString(previousStart), end: dateString(previousEnd) }
  };
}

function dateString(date) {
  return Utilities.formatDate(date, AdsApp.currentAccount().getTimeZone(), "yyyy-MM-dd");
}

function getSheet(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function resetSheet(sheet, headers) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function appendRows(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}
