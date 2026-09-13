/*
 * Google Apps Script Web App -> JSON bridge for the local dashboard.
 *
 * Set the same spreadsheet URL and a long random DASHBOARD_TOKEN.
 * Deploy as Web app: execute as yourself, access for anyone with the link.
 */

var SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/1DIDJ37tPlRiLQACVJXyNvzpTzN8IMc7EOinDGqA8ZhI/edit";
var DASHBOARD_TOKEN = "59bf683414464623662375667a96b3fc8a85285747baeb1b";

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
    keywordRows: readSheet(spreadsheet.getSheetByName("keyword_daily"))
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
