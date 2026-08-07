# Interactive Dashboard setup

This builds a `Dashboard` tab with 5 dropdown filters (Producer, Vertical,
Week, Fullscreen Goal Met, SxS Goal Met) that all feed the same set of
tables/charts — change any dropdown and everything on the page updates
together.

**Before starting:** make sure you've re-deployed the script with the updated
`Code.gs` (the one with the `Week Label` column) and logged at least one
broadcast, so `Broadcasts!AA` has data to build the dropdowns from. If you
already have test rows from before, that's fine — Week Label just won't be
filled in for rows logged before this update.

This is a first pass built without being able to test-run it live, so if a
formula looks broken or shows an error, tell me exactly what cell and what
error and I'll fix it.

## Step 1: Add two tabs

Create two new sheet tabs (right-click the tab bar → Insert sheet):
- `Dashboard` — the visible page
- `Dashboard Helpers` — hidden scratch space for dropdown lists and the
  filter logic (keeps the visible Dashboard tab clean)

## Step 2: Dashboard Helpers tab

Paste these into `Dashboard Helpers`:

| Cell | Content |
|---|---|
| A1 | `Producer list (for dropdown)` |
| A2 | `All Producers` |
| A3 | `=SORT(UNIQUE(FILTER(Broadcasts!F2:F,Broadcasts!F2:F<>"")))` |
| B1 | `Week list (for dropdown)` |
| B2 | `All Weeks` |
| B3 | `=SORT(UNIQUE(FILTER(Broadcasts!AA2:AA,Broadcasts!AA2:AA<>"")))` |
| D1 | `WHERE clause (built from the filters on Dashboard — don't edit)` |
| D2 | see formula below |

**D2** (this is the one formula everything else depends on — it turns the 5
dropdown selections on the `Dashboard` tab into one WHERE-clause string):
```
=IF(Dashboard!$B$4="All Producers","","and F = '"&Dashboard!$B$4&"' ")&IF(Dashboard!$B$5="All Verticals","","and E = '"&Dashboard!$B$5&"' ")&IF(Dashboard!$B$6="All Weeks","","and AA = '"&Dashboard!$B$6&"' ")&IF(Dashboard!$B$7="All","","and L = "&LOWER(Dashboard!$B$7)&" ")&IF(Dashboard!$B$8="All","","and Q = "&LOWER(Dashboard!$B$8)&" ")
```

Once this tab is set up, right-click its tab → **Hide sheet** (you can always
unhide it later to tweak something).

## Step 3: Dashboard tab — filters

| Cell | Content |
|---|---|
| A1 | `FloSports Virtual AD — Dashboard` (make it bold, size 16) |
| A3 | `FILTERS` (bold) |
| A4 | `Producer` |
| B4 | dropdown — see below |
| A5 | `Vertical` |
| B5 | dropdown — see below |
| A6 | `Week` |
| B6 | dropdown — see below |
| A7 | `Fullscreen Goal Met` |
| B7 | dropdown — see below |
| A8 | `SxS Goal Met` |
| B8 | dropdown — see below |

Set up each dropdown with **Data → Data validation** (right-click the cell →
Data validation), criteria **Dropdown (from a range)** unless noted:
- **B4**: range `'Dashboard Helpers'!A2:A200`
- **B5**: criteria **Dropdown** (list of items, typed directly), value:
  `All Verticals, Baseball, Bikes, Cheer, College, Combat, Elite, FC, Football, Grappling, Hockey, Hoops, Lacrosse, Marching, Milesplit, Racing, Rugby, Softball, Swimming, Track, Varsity, Volleyball, Wrestling`
- **B6**: range `'Dashboard Helpers'!B2:B200`
- **B7**: criteria **Dropdown** (list of items): `All, TRUE, FALSE`
- **B8**: same as B7: `All, TRUE, FALSE`

Set B4, B5, B6, B7, B8 to their "All ..." value initially.

## Step 4: Dashboard tab — summary numbers

| Cell | Content |
|---|---|
| A10 | `SUMMARY` (bold) |
| A11 | `Broadcasts` |
| B11 | `=QUERY(Broadcasts!A2:AA,"select count(A) where A is not null "&'Dashboard Helpers'!$D$2,0)` |
| A12 | `Total Ad Minutes` |
| B12 | `=QUERY(Broadcasts!A2:AA,"select sum(X) where A is not null "&'Dashboard Helpers'!$D$2,0)` |
| A13 | `% Fullscreen Goal Met` |
| B13 | `=IFERROR(QUERY(Broadcasts!A2:AA,"select count(A) where A is not null and L = true "&'Dashboard Helpers'!$D$2,0)/B11,0)` — format B13 as **Percent** |
| A14 | `% SxS Goal Met (of SxS-enabled)` |
| B14 | `=IFERROR(QUERY(Broadcasts!A2:AA,"select count(A) where A is not null and M = true and Q = true "&'Dashboard Helpers'!$D$2,0)/QUERY(Broadcasts!A2:AA,"select count(A) where A is not null and M = true "&'Dashboard Helpers'!$D$2,0),0)` — format B14 as **Percent** |

## Step 5: Dashboard tab — breakdown tables

**By Producer** — A16 label `BY PRODUCER` (bold), formula in **A17**:
```
=QUERY(Broadcasts!A2:AA,"select F, count(A), sum(X) where A is not null "&'Dashboard Helpers'!$D$2&" group by F order by count(A) desc label F 'Producer', count(A) 'Broadcasts', sum(X) 'Total Ad Min'",0)
```

**By Vertical** — E16 label `BY VERTICAL` (bold), formula in **E17**:
```
=QUERY(Broadcasts!A2:AA,"select E, count(A), sum(X) where A is not null "&'Dashboard Helpers'!$D$2&" group by E order by count(A) desc label E 'Vertical', count(A) 'Broadcasts', sum(X) 'Total Ad Min'",0)
```

**By Week** (chronological, for a trend chart) — I16 label `BY WEEK` (bold),
formula in **I17**:
```
=QUERY(Broadcasts!A2:AA,"select AA, count(A), sum(X) where A is not null "&'Dashboard Helpers'!$D$2&" group by AA order by AA asc label AA 'Week', count(A) 'Broadcasts', sum(X) 'Total Ad Min'",0)
```

These three tables auto-size to however many rows they need — leave the space
below A17/E17/I17 empty so they have room to spill without overwriting
anything.

**Recent broadcasts** — leave a healthy gap (say, start at row 40 so the
tables above have room), A40 label `RECENT BROADCASTS` (bold), formula in
**A41**:
```
=QUERY(Broadcasts!A2:AA,"select A, C, E, F, X, L where A is not null "&'Dashboard Helpers'!$D$2&" order by A desc limit 15 label A 'Submitted', C 'Event', E 'Vertical', F 'Producer', X 'Total Min', L 'FS Goal Met'",0)
```

## Step 6: Charts

For each, select a generously-sized range (blank trailing rows are fine —
charts just skip them) and **Insert → Chart**:
- **Broadcasts by Producer**: select `A17:B40` → Column chart
- **Broadcasts by Vertical**: select `E17:F40` → Column chart
- **Broadcasts by Week (trend)**: select `I17:J40` (count) or `I17:I40` plus
  `K17:K40` (ad minutes) → Line chart — this is the trend-over-time view
- **Goal met split**: `B13` alone doesn't make a chart, but you can build a
  quick one from `B11` and `B13`, or just watch the two % tiles — up to you
  whether a pie chart adds anything here

Sheets keeps these live as new rows come in and the filters change, since
they're reading directly from the QUERY output ranges.

## Once it's built

Try changing a dropdown (e.g. Vertical → Hoops) and confirm the summary
numbers and tables update. If anything errors out or looks wrong, send me
the cell reference and the error text and I'll fix the formula.

## Ideas for later (not built yet — say the word if you want these)

- A second week-over-week trend line for the **Fullscreen goal-met rate**
  (not just count), to see if compliance is improving over time
- A "last 30 days" quick-filter alternative to picking an exact week
- Conditional formatting on the Recent Broadcasts table (red row background
  when Fullscreen Goal Met = FALSE) for at-a-glance scanning
- A per-producer average rate column (not just count/total) next to the
  Producer breakdown table
