/*
 * Google Apps Script Web App -> JSON bridge for the local dashboard.
 *
 * Set the same spreadsheet URL and a long random DASHBOARD_TOKEN.
 * Deploy as Web app: execute as yourself, access for anyone with the link.
 */

var SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1DIDJ37tPlRiLQACVJXyNvzpTzN8IMc7EOinDGqA8ZhI/edit";
var DASHBOARD_TOKEN = "59bf683414464623662375667a96b3fc8a85285747baeb1b";
var GA4_ACCOUNT_ID = "261091769";
var GA4_PROPERTY_ID = "358972108";

function doGet(request) {
  if (!request || !request.parameter || request.parameter.token !== DASHBOARD_TOKEN) {
    return json({ error: "Unauthorized" });
  }

  var spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  return json({
    source: "google-ads-script",
    generatedAt: new Date().toISOString(),
    campaignRows: readSheet(spreadsheet.getSheetByName("campaign_daily")),
    productRows: readSheet(spreadsheet.getSheetByName("product_daily")),
    keywordRows: readSheet(spreadsheet.getSheetByName("keyword_daily")),
    ga4Rows: ga4Report(
      ["date"],
      ["activeUsers", "totalUsers", "newUsers", "sessions", "engagedSessions", "engagementRate", "conversions", "ecommercePurchases", "totalRevenue"],
      "90daysAgo",
      "yesterday"
    ),
    ga4ChannelRows: ga4Report(
      ["date", "sessionDefaultChannelGroup"],
      ["activeUsers", "totalUsers", "sessions", "engagedSessions", "engagementRate", "conversions", "ecommercePurchases", "totalRevenue"],
      "90daysAgo",
      "yesterday"
    )
  });
}

function ga4Report(dimensions, metrics, startDate, endDate) {
  var url = "https://analyticsdata.googleapis.com/v1beta/properties/" + GA4_PROPERTY_ID + ":runReport";
  var request = {
    dateRanges: [{ startDate: startDate, endDate: endDate }],
    dimensions: dimensions.map(function (name) { return { name: name }; }),
    metrics: metrics.map(function (name) { return { name: name }; }),
    limit: 100000
  };
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(request),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  var body = response.getContentText();
  if (status >= 300) throw new Error("GA4 Data API failed: " + status + " " + body);
  var result = JSON.parse(body);
  var dimensionHeaders = (result.dimensionHeaders || []).map(function (header) { return header.name; });
  var metricHeaders = (result.metricHeaders || []).map(function (header) { return header.name; });
  return (result.rows || []).map(function (row) {
    var item = {};
    (row.dimensionValues || []).forEach(function (value, index) {
      item[dimensionHeaders[index]] = value.value;
    });
    (row.metricValues || []).forEach(function (value, index) {
      item[metricHeaders[index]] = value.value;
    });
    return item;
  });
}

function readSheet(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var headers = values.shift();
  return values.map(function (row) {
    return headers.reduce(function (item, header, index) {
      item[header] = row[index];
      return item;
    }, {});
  });
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
