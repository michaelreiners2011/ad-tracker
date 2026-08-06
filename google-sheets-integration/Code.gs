/**
 * FloSports Virtual AD — post-broadcast logging endpoint.
 *
 * Paste this into the Apps Script editor of the target Google Sheet
 * (Extensions > Apps Script), then deploy as a Web App:
 *   Execute as:    Me
 *   Who has access: Anyone
 * Copy the resulting /exec URL and send it back so it can be wired
 * into the app's SHEETS_WEBHOOK_URL constant.
 *
 * Every completed broadcast appends one row to the "Broadcasts" tab
 * (created automatically on first run, header row included).
 */

var SHEET_NAME = 'Broadcasts';

// [Column header, payload key] — edit freely; add a pair to log a new field,
// remove one to drop a column. Order here is the order in the sheet.
var COLUMNS = [
  ['Submitted At (UTC)', 'submitted_at'],
  ['Broadcast Start (UTC)', 'broadcast_start'],
  ['Event Name', 'event_name'],
  ['Event Day', 'event_day'],
  ['Vertical', 'vertical'],
  ['Lead Producer', 'lead_producer'],
  ['Assistant Director', 'assistant_director'],
  ['Elapsed Today (h:mm:ss)', 'elapsed_today_hms'],
  ['Fullscreen Goal (min/hr)', 'fullscreen_goal'],
  ['Fullscreen Rate Today', 'fullscreen_rate_today'],
  ['Fullscreen Rate Cumulative', 'fullscreen_rate_cumulative'],
  ['Fullscreen Goal Met', 'fullscreen_goal_met'],
  ['SxS Enabled', 'sxs_enabled'],
  ['SxS Goal (min/hr)', 'sxs_goal'],
  ['SxS Rate Today', 'sxs_rate_today'],
  ['SxS Rate Cumulative', 'sxs_rate_cumulative'],
  ['SxS Goal Met', 'sxs_goal_met'],
  ['Overall Goal (min/hr)', 'overall_goal'],
  ['Overall Rate Today', 'overall_rate_today'],
  ['Overall Rate Cumulative', 'overall_rate_cumulative'],
  ['Cloud Min Today', 'cloud_minutes_today'],
  ['Direct Sold Min Today', 'direct_sold_minutes_today'],
  ['SxS Min Today', 'sxs_minutes_today'],
  ['Total Min Today', 'total_minutes_today'],
  ['Total Min Cumulative', 'total_minutes_cumulative'],
  ['App Version', 'app_version'],
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getOrCreateSheet_();
    var row = COLUMNS.map(function (c) {
      var v = data[c[1]];
      return v === undefined || v === null ? '' : v;
    });
    sheet.appendRow(row);
    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    var headers = COLUMNS.map(function (c) { return c[0]; });
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0c0c0c')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Optional: run manually once (Run > doGet, or just call this) to sanity-check the sheet exists. */
function setup() {
  getOrCreateSheet_();
}
