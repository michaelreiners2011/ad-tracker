# Google Sheets reporting setup

Every time someone clicks "Stop Broadcast" in Virtual AD, the app silently posts a
summary of that broadcast to a Google Apps Script Web App bound to your Sheet,
which appends one row to a `Broadcasts` tab. Nothing about this appears in the
app's UI.

## 1. Add the script to your existing Sheet

1. Open your Google Sheet.
2. **Extensions → Apps Script**.
3. Delete any placeholder code in `Code.gs`, paste in the contents of
   [`Code.gs`](./Code.gs) from this folder.
4. Save (Ctrl/Cmd+S). Name the project something like "Virtual AD Logger".

## 2. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**, authorize the requested permissions (it's your own script
   touching your own Sheet — the "unverified app" warning is expected for a
   personal script; click through **Advanced → Go to \[project name] (unsafe)**
   if prompted).
5. Copy the **Web app URL** (ends in `/exec`) — send that back so it can be
   wired into the app.

That's it on the code side — the `Broadcasts` tab and its header row are
created automatically the first time a broadcast is logged. If you edit the
`COLUMNS` list in `Code.gs` later (to add/remove a tracked field), re-paste
the updated script, **Deploy → Manage deployments → Edit → New version**, and
the header row will auto-update to match on the next log (existing data rows
are left alone).

## 3. Interactive dashboard

For the filterable dashboard (by Producer, Vertical, Week, Fullscreen/SxS
goal met) with charts, see **[DASHBOARD.md](./DASHBOARD.md)**.

## 4. Daily heartbeat cleanup

Heartbeats (logged every ~5 min while a broadcast runs) will otherwise grow
the sheet indefinitely toward Google Sheets' 10M-cell limit. See
**[CLEANUP.md](./CLEANUP.md)** to set up automatic daily pruning.

## Column reference (`Broadcasts` tab)

| Col | Field |
|---|---|
| A | Submitted At (UTC) |
| B | Broadcast Start (UTC) |
| C | Event Name |
| D | Event Day |
| E | Vertical |
| F | Lead Producer |
| G | Assistant Director |
| H | Elapsed Today |
| I | Fullscreen Goal |
| J | Fullscreen Rate Today |
| K | Fullscreen Rate Cumulative |
| L | Fullscreen Goal Met |
| M | SxS Enabled |
| N | SxS Goal |
| O | SxS Rate Today |
| P | SxS Rate Cumulative |
| Q | SxS Goal Met |
| R | Overall Goal |
| S | Overall Rate Today |
| T | Overall Rate Cumulative |
| U | Cloud Min Today |
| V | Direct Sold Min Today |
| W | SxS Min Today |
| X | Total Min Today |
| Y | Total Min Cumulative |
| Z | App Version |
| AA | Week Label (e.g. "2026-W32", computed automatically) |
| AB | Event Type — `final` (Stop Broadcast clicked), `heartbeat` (periodic snapshot every ~5 min while running), `unload` (tab closed mid-broadcast), `reset` (Reset clicked mid-broadcast) |
| AC | Session ID — same value across every row (heartbeats + final) from one broadcast session |
| AD | Time Zone — the zone the producer selected when starting the broadcast (Eastern/Central/Mountain/Pacific) |
| AE | Submitted At (Epoch ms) — plain number version of column A, immune to Sheets' date auto-conversion; used by `Cleanup.gs` (see [CLEANUP.md](./CLEANUP.md)) |
| AF | Broadcast Mode — `internal` (Flo Internal Production) or `feed_provider` (simplified partner version) |

**After this update, redeploy `Code.gs` and then run `setup()` once** (function
dropdown in the Apps Script editor → `setup` → Run) — redeploying alone does
not retroactively rewrite an existing sheet's header row; that only happens
the next time the script actually executes.

## Column reference (`Ad Events` tab)

A second tab, created automatically the first time a Direct Sold/Promo/Upcoming
Schedule ad break is logged (or by running `setup()`). One row per individual
ad break — not per broadcast — so exact run timestamps can be cross-referenced
against concurrent viewership data.

| Col | Field |
|---|---|
| A | Submitted At (UTC) |
| B | Broadcast Start (UTC) |
| C | Session ID |
| D | Event Name |
| E | Event Day |
| F | Vertical |
| G | App Version |
| H | Category — `local` (Direct Sold), `promo`, or `schedule` |
| I | Spot Name |
| J | Duration Seconds |
| K | Duration Minutes |
| L | Break Timestamp (UTC) — when the ad break itself ran (not when this row was submitted) |
| M | Submitted At (Epoch ms) |

Cloud and Side-by-Side ad breaks are intentionally not logged here — this tab
exists specifically for the named/identifiable spots (Direct Sold, Promo,
Upcoming Schedule) that get compared against viewership numbers.

Times are logged in UTC (`submitted_at`/`broadcast_start`) — the app converts
whatever the producer enters (in the zone they picked, DST-aware) into the
correct absolute UTC instant before sending it. Column AD tells you which
zone that was. If you want a column showing local wall-clock time, factor in
both the zone *and* whether DST was in effect on that date — a fixed offset
like `=A2 - TIME(5,0,0)` is only correct for Eastern Standard Time (winter);
during Eastern Daylight Time it should be `-TIME(4,0,0)` instead.

## Once deployed

Send the `/exec` URL back and it'll be added as the app's
`SHEETS_WEBHOOK_URL` constant — no other code changes needed.
