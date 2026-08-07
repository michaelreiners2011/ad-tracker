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

// [Column header, payload key OR function(data)] — edit freely; add a pair to
// log a new field, remove one to drop a column. Order here is the order in
// the sheet. New columns should generally be added at the END so existing
// rows/headers don't shift out of alignment.
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
  ['Week Label', weekLabelFromData_], // computed server-side, e.g. "2026-W32" — used for the dashboard's week filter
  ['Event Type', 'event_type'], // 'final' (Stop Broadcast clicked), 'heartbeat' (periodic, every few min while running), 'unload' (tab closed mid-broadcast), 'reset' (Reset clicked mid-broadcast)
  ['Session ID', 'session_id'], // same value for every row (heartbeats + final) from one broadcast session — use to spot sessions with heartbeats but no 'final' row
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getOrCreateSheet_();
    var row = COLUMNS.map(function (c) {
      var accessor = c[1];
      var v = typeof accessor === 'function' ? accessor(data) : data[accessor];
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
  var headers = COLUMNS.map(function (c) { return c[0]; });
  var existing = sheet.getLastRow() > 0 && sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    : [];
  var headersMatch = existing.length === headers.length &&
    existing.every(function (h, i) { return h === headers[i]; });
  if (!headersMatch) {
    // Rewrites only row 1 — safe to run again after editing COLUMNS (e.g. to
    // add a new field). Existing data rows are untouched; just add new
    // columns at the END of the COLUMNS list above so old rows stay aligned.
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
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

/** ISO-8601 week number + year for a given Date, in UTC. */
function getIsoWeek_(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/** e.g. "2026-W32". Falls back to submitted_at if broadcast_start is missing/invalid. */
function weekLabelFromData_(data) {
  var raw = data.broadcast_start || data.submitted_at;
  if (!raw) return '';
  var d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  var iso = getIsoWeek_(d);
  return iso.year + '-W' + (iso.week < 10 ? '0' : '') + iso.week;
}

/** Optional: run manually once (select this function, then Run) to sanity-check the sheet/header exist. */
function setup() {
  getOrCreateSheet_();
}
