/**
 * FloSports Virtual AD — daily heartbeat cleanup.
 *
 * Google Sheets has a hard cell-count limit (10M cells) across the whole
 * spreadsheet. Heartbeat rows (logged every ~5 min while a broadcast runs)
 * are the main volume driver — this prunes them once a session is safely
 * over, while preserving evidence of sessions that never got a proper
 * "final" row (tab closed, crash, Stop never clicked):
 *
 *   - Session has a 'final' row  → delete ALL its heartbeats (redundant,
 *     the final row already has the complete picture). Only touched once
 *     the session's last activity is at least FINAL_STALE_HOURS old.
 *   - Session has NO 'final' row → keep only the single MOST RECENT
 *     heartbeat as the last-known record; delete the rest. Only touched
 *     once the session's last activity is at least NO_FINAL_STALE_HOURS
 *     old (longer than the final case — we're inferring "probably over"
 *     from elapsed time alone here, not a definitive signal, so this
 *     leaves more room for things like an overnight pause-and-resume).
 *
 * Add this as a SECOND FILE in the same Apps Script project as Code.gs
 * (same Sheet, same authorization — no new deployment needed). To add a
 * file: in the Apps Script editor, Files → + → Script, name it "Cleanup".
 *
 * DRY_RUN starts true — first run(s) only report what WOULD be deleted
 * (see the "Cleanup Log" tab) without deleting anything. Flip to false
 * once you've checked the log and it looks right.
 */

var DRY_RUN = true;

var CLEANUP_SHEET_NAME = 'Broadcasts';
var CLEANUP_LOG_SHEET_NAME = 'Cleanup Log';
var FINAL_STALE_HOURS = 48;    // session has a 'final' row — just a settling buffer, not a guess
var NO_FINAL_STALE_HOURS = 72; // session has only heartbeats — inferred "probably over", more margin

function cleanupHeartbeats() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CLEANUP_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    logCleanupRun_(0, 0, 'No data to process.');
    return;
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colEventType = headers.indexOf('Event Type');
  var colSessionId = headers.indexOf('Session ID');
  var colEpochMs = headers.indexOf('Submitted At (Epoch ms)');

  if (colEventType === -1 || colSessionId === -1 || colEpochMs === -1) {
    logCleanupRun_(0, 0, 'Could not find Event Type / Session ID / Submitted At (Epoch ms) columns — skipped. Make sure Code.gs has been redeployed with the epoch-ms column.');
    return;
  }

  var nowMs = Date.now();

  // Group row indices (into `data`; 0 = header row) by session id.
  var sessions = {}; // sessionId -> { rows: [{idx, eventType, ms}], hasFinal, mostRecentMs }
  for (var i = 1; i < data.length; i++) {
    var sessionId = data[i][colSessionId];
    if (!sessionId) continue; // rows logged before Session ID existed — leave alone
    var eventType = data[i][colEventType];
    var rawMs = data[i][colEpochMs];
    var ms = typeof rawMs === 'number' ? rawMs : parseFloat(rawMs);
    if (!sessions[sessionId]) {
      sessions[sessionId] = { rows: [], hasFinal: false, mostRecentMs: -Infinity };
    }
    var s = sessions[sessionId];
    s.rows.push({ idx: i, eventType: eventType, ms: isNaN(ms) ? -Infinity : ms });
    if (eventType === 'final') s.hasFinal = true;
    if (!isNaN(ms) && ms > s.mostRecentMs) s.mostRecentMs = ms;
  }

  var rowsToDelete = []; // 0-based indices into `data`
  var sessionsReviewed = 0;
  var sessionsSkippedTooRecent = 0;
  var sessionsSkippedNoTimestamp = 0;

  Object.keys(sessions).forEach(function (sessionId) {
    var s = sessions[sessionId];

    // Couldn't determine recency at all for this session (no parseable
    // timestamp on any row) — don't guess, leave it alone.
    if (s.mostRecentMs === -Infinity) { sessionsSkippedNoTimestamp++; return; }

    var staleHours = s.hasFinal ? FINAL_STALE_HOURS : NO_FINAL_STALE_HOURS;
    var staleMs = staleHours * 60 * 60 * 1000;
    if (nowMs - s.mostRecentMs < staleMs) { sessionsSkippedTooRecent++; return; } // still recent/possibly live

    var heartbeatRows = s.rows.filter(function (r) { return r.eventType === 'heartbeat'; });
    if (!heartbeatRows.length) return; // nothing to prune for this session

    sessionsReviewed++;

    if (s.hasFinal) {
      heartbeatRows.forEach(function (r) { rowsToDelete.push(r.idx); });
    } else {
      // Keep only the single most recent heartbeat.
      heartbeatRows.sort(function (a, b) { return b.ms - a.ms; });
      for (var j = 1; j < heartbeatRows.length; j++) rowsToDelete.push(heartbeatRows[j].idx);
    }
  });

  var note = 'sessions reviewed: ' + sessionsReviewed +
    ', skipped (too recent): ' + sessionsSkippedTooRecent +
    ', skipped (no timestamp): ' + sessionsSkippedNoTimestamp;

  if (!rowsToDelete.length) {
    logCleanupRun_(0, sessionsReviewed, note + ' — nothing to delete.');
    return;
  }

  if (DRY_RUN) {
    logCleanupRun_(rowsToDelete.length, sessionsReviewed, note + ' — DRY RUN, nothing actually deleted. Set DRY_RUN = false in Cleanup.gs once this looks right.');
    return;
  }

  // Sheet rows are 1-based and offset by the header row, so `data` index i -> sheet row i+1.
  // Delete descending so earlier deletions don't shift the row numbers of ones still queued.
  rowsToDelete.sort(function (a, b) { return b - a; });
  rowsToDelete.forEach(function (idx) { sheet.deleteRow(idx + 1); });

  logCleanupRun_(rowsToDelete.length, sessionsReviewed, note + ' — deleted.');
}

function logCleanupRun_(deletedCount, sessionsReviewed, note) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = ss.getSheetByName(CLEANUP_LOG_SHEET_NAME);
  if (!log) {
    log = ss.insertSheet(CLEANUP_LOG_SHEET_NAME);
    log.appendRow(['Run At (UTC)', 'Rows Deleted', 'Sessions Reviewed', 'Note']);
    log.getRange(1, 1, 1, 4).setFontWeight('bold');
    log.setFrozenRows(1);
  }
  log.appendRow([new Date().toISOString(), deletedCount, sessionsReviewed, note]);
}

/**
 * Run this once (select it in the function dropdown, click Run) to schedule
 * cleanupHeartbeats() daily at 4am.
 *
 * IMPORTANT: atHour() runs in the Apps Script PROJECT's time zone, not a
 * zone passed to the trigger itself. For this to actually mean 4am Central,
 * the project's time zone must be set to America/Chicago (an IANA zone
 * name, so it auto-adjusts for CST/CDT). Check/set it in the Apps Script
 * editor: Project Settings (gear icon, left sidebar) → "Time zone".
 */
function installDailyCleanupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cleanupHeartbeats') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupHeartbeats')
    .timeBased()
    .everyDays(1)
    .atHour(4)
    .create();
}
