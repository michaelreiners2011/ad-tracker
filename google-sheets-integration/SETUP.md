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
created automatically the first time a broadcast is logged. You can re-run
**Deploy → Manage deployments → Edit → New version** any time you change the
script (e.g. adding/removing a column in the `COLUMNS` list at the top of
`Code.gs`).

## 3. Dashboard tab

Add a new sheet tab named `Dashboard` and paste these formulas in (adjust
cell references as you like — these all just read from `Broadcasts`):

| Cell | Formula | What it shows |
|---|---|---|
| B2 | `=COUNTA(Broadcasts!A2:A)` | Total broadcasts logged |
| B3 | `=SUM(Broadcasts!X2:X)` | Total ad minutes tracked across all broadcasts |
| B4 | `=COUNTIF(Broadcasts!L2:L,TRUE)/COUNTA(Broadcasts!L2:L)` | % of broadcasts that hit the Fullscreen goal (format as %) |
| B5 | `=COUNTIFS(Broadcasts!M2:M,TRUE,Broadcasts!Q2:Q,TRUE)/COUNTIF(Broadcasts!M2:M,TRUE)` | % of SxS-enabled broadcasts that hit the SxS goal (format as %) |

**Broadcasts by Producer** (paste in, say, `D2`):
```
=QUERY(Broadcasts!A:Z,"select F, count(A) where A is not null group by F order by count(A) desc label F 'Producer', count(A) 'Broadcasts'",1)
```

**Broadcasts by Vertical** (paste in `G2`):
```
=QUERY(Broadcasts!A:Z,"select E, count(A), sum(X) where A is not null group by E order by count(A) desc label E 'Vertical', count(A) 'Broadcasts', sum(X) 'Total Ad Min'",1)
```

**Most recent 10 broadcasts** (paste in `K2`):
```
=QUERY(Broadcasts!A:Z,"select A,C,E,F,X,L order by A desc limit 10 label A 'Submitted', C 'Event', E 'Vertical', F 'Producer', X 'Total Min', L 'Goal Met'",1)
```

To add a chart: select the output range of the "Broadcasts by Vertical" query
→ **Insert → Chart** → pick a column/bar chart. Sheets will keep it live as
new rows come in.

## Column reference (`Broadcasts` tab, A–Z)

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

Times are logged in UTC (`submitted_at`/`broadcast_start`) since that's what
the browser gives us — convert in a formula if you want local time, e.g.
`=A2 - TIME(5,0,0)` for Eastern during standard time.

## Once deployed

Send the `/exec` URL back and it'll be added as the app's
`SHEETS_WEBHOOK_URL` constant (currently blank, so logging is a no-op until
then) — no other code changes needed.
