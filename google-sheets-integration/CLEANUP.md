# Daily heartbeat cleanup

Heartbeats (an `event_type: heartbeat` row logged every ~5 min while a
broadcast is running) are what keep the accountability logging honest — but
left alone forever, they're also the fastest-growing thing in the sheet.
This prunes them once a session is safely over, in a way that never loses
the evidence that matters: if a session never got a proper `final` row (tab
closed, crash, Stop never clicked), the single most recent heartbeat for
that session is kept forever as the last-known record. Only redundant
heartbeats — ones fully superseded by either a `final` row or a later
heartbeat — get deleted.

## The rule

- Session has a `final` row → once its last activity is **48+ hours** old,
  delete *all* its heartbeats (the `final` row already has the complete
  picture, so they're pure redundancy).
- Session has **no** `final` row → once its last activity is **72+ hours**
  old, delete all but the single most recent heartbeat.
- Anything more recent than that (in either case) is left alone — could
  still be live, or a legitimately paused/resumed session.

72 hours (vs. 48) for the no-`final` case is deliberate: with a `final` row
we *know* the session ended; without one we're only inferring it from
elapsed time, so it gets more benefit of the doubt — e.g. a producer pausing
overnight and resuming the next day shouldn't get treated as abandoned.

## Setup

This is a **second file in the same Apps Script project** as `Code.gs` — same
Sheet, same authorization already granted, no new Web App deployment needed.

1. Open your Sheet → **Extensions → Apps Script** (the same project `Code.gs`
   lives in)
2. In the left sidebar, next to "Files," click **+** → **Script**
3. Name the new file `Cleanup` (the `.gs` extension is automatic)
4. Delete the placeholder content, paste in the contents of
   [`Cleanup.gs`](./Cleanup.gs)
5. Save (Ctrl/Cmd+S)

**Before running anything**, make sure `Code.gs` has already been redeployed
with the `Submitted At (Epoch ms)` column (see `SETUP.md` — if you've done
every prior `Code.gs` update, you're set; if not, redeploy that first).

## First run — dry run

`Cleanup.gs` starts with `DRY_RUN = true` at the top, so the first run(s)
only *report* what would be deleted without touching anything:

1. In the Apps Script editor, use the function dropdown (top toolbar, next
   to the Run/Debug buttons) to select **cleanupHeartbeats**
2. Click **Run**
3. First time, you'll get an authorization prompt (same "unverified app"
   flow as before — Advanced → Go to \[project] (unsafe) → Allow)
4. Check your Sheet for a new **Cleanup Log** tab — it logs a row every run:
   timestamp, rows that would be deleted, sessions reviewed, and a note

Read that note. It'll look something like:
`sessions reviewed: 3, skipped (too recent): 12, skipped (no timestamp): 0 — DRY RUN, nothing actually deleted.`

If the numbers look sane (roughly matching how many old broadcasts you'd
expect to have stale heartbeats), you're ready to go live.

## Going live

1. Back in the Apps Script editor, find `var DRY_RUN = true;` near the top
   of `Cleanup.gs` and change it to `var DRY_RUN = false;`
2. Save
3. Run **cleanupHeartbeats** manually once more to confirm it actually
   deletes rows this time (check the Cleanup Log — the note will end in
   "— deleted." instead of "— DRY RUN")

## Scheduling it daily

**First, check the Apps Script project's time zone** — the trigger runs at
4 AM in whatever zone the *project* is set to, not a zone the trigger
specifies itself:

1. In the Apps Script editor, click the gear icon ("Project Settings") in
   the left sidebar
2. Under "General settings," confirm **Time zone** is set to
   `(GMT-06:00) Central Time - Chicago`. If it's set to something else,
   change it to that now — this is an IANA zone name, so it automatically
   adjusts for CST/CDT and stays correct at 4 AM Central year-round.

Then run the trigger installer once, and never again:

1. In the function dropdown, select **installDailyCleanupTrigger**
2. Click **Run**

That's it — `cleanupHeartbeats` will now run automatically every day at
4 AM Central. No further action needed; check the **Cleanup Log** tab
occasionally if you want to keep an eye on it. Running
`installDailyCleanupTrigger` again later (e.g. if you ever want to change
the schedule) safely replaces the old trigger rather than stacking up
duplicates.

## If something looks wrong

Don't flip `DRY_RUN` back to `true` and try to "fix" a mistake by guessing —
tell me exactly what the Cleanup Log shows and what you expected instead,
and we'll fix the logic together. This script deletes rows, so when in
doubt, stop and ask rather than re-running it.
