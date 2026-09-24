import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.request

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# The live Google Sheet's Apps Script deployment. Passed to templates/index.html at render time
# (so the page and the /api/library proxy always agree) and never read from the client, so a
# request here can't be pointed at an arbitrary URL by anything the client sends.
PRODUCTION_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwpfXOs0gc9f2TGnLyFk0R02Lsa_bred18-3AtaX9-bQGtjZPawnvM_Nf52v6KbPX1b-Q/exec"
# A Render service can point at a different Sheet (e.g. the testing service → the test copy) by
# setting the SHEETS_WEBHOOK_URL environment variable. The live service doesn't set it.
SHEETS_WEBHOOK_URL = os.environ.get("SHEETS_WEBHOOK_URL", "").strip() or PRODUCTION_SHEETS_WEBHOOK_URL
IS_TEST_SHEET = SHEETS_WEBHOOK_URL != PRODUCTION_SHEETS_WEBHOOK_URL


@app.route("/api/library")
def get_library():
    """Proxies the Apps Script webhook's read-only library lookup. A direct browser fetch to
    script.google.com is blocked by CORS (the /exec endpoint sends no Access-Control-Allow-
    Origin header) — this server-to-server request isn't subject to that, since CORS is a
    browser-enforced rule, not a server one."""
    try:
        with urllib.request.urlopen(f"{SHEETS_WEBHOOK_URL}?action=library", timeout=8) as resp:
            body = resp.read()
        json.loads(body)  # validate before forwarding — a malformed/HTML error page shouldn't pass as JSON
        return app.response_class(body, mimetype="application/json")
    except Exception:
        return jsonify(local=[], promo=[], schedule=[]), 200


# ═══════════════════════════════════════════════════════════════════════════
#  MULTI-PRODUCER LIVE SYNC (in-memory only — no database)
#
# Opt-in: a broadcast only gets an entry here if the host enables "multi-
# producer sync" on the setup screen. Each session lives only as long as this
# process does; a Render redeploy/restart during a live broadcast loses it
# (each browser keeps its own locally-tracked data regardless).
# ═══════════════════════════════════════════════════════════════════════════

_sessions = {}
_sessions_lock = threading.Lock()

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I — easier to read aloud
_SESSION_TTL_SECONDS = 3 * 60 * 60  # purge a session 3h after its last request
_HEARTBEAT_OWNER_TIMEOUT_SECONDS = 20  # owner presumed disconnected after this long


def _new_session_code():
    while True:
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        if code not in _sessions:
            return code


def _cleanup_stale_sessions_locked():
    cutoff = time.time() - _SESSION_TTL_SECONDS
    for code in [c for c, s in _sessions.items() if s["lastActivity"] < cutoff]:
        del _sessions[code]


def _touch_locked(session, client_id=None):
    session["lastActivity"] = time.time()
    if not client_id:
        return
    session["clients"][client_id] = session["lastActivity"]
    owner = session.get("heartbeatOwner")
    owner_last_seen = session["clients"].get(owner, 0)
    if owner is None or session["lastActivity"] - owner_last_seen > _HEARTBEAT_OWNER_TIMEOUT_SECONDS:
        session["heartbeatOwner"] = client_id


def _public_state(session, client_id):
    return {
        "config": session["config"],
        "libraries": session["libraries"],
        "events": [_public_event(e) for e in session["events"] if not e["removed"]],
        "paused": session["paused"],
        "stopped": session["stopped"],
        "stopKind": session["stopKind"],
        "maxSeq": session["seq"],
        "isHeartbeatOwner": session["heartbeatOwner"] == client_id,
    }


def _public_event(e):
    return {
        "id": e["id"],
        "type": e["type"],
        "seconds": e["seconds"],
        "name": e["name"],
        "spotId": e.get("spotId"),
        "timestamp": e["timestamp"],
        "seq": e["seq"],
    }


@app.route("/")
def index():
    return render_template("index.html", sheets_webhook_url=SHEETS_WEBHOOK_URL, is_test_sheet=IS_TEST_SHEET)


@app.route("/api/sessions", methods=["POST"])
def create_session():
    data = request.get_json(force=True, silent=True) or {}
    client_id = data.get("clientId")
    if not client_id:
        return jsonify(error="clientId required"), 400
    with _sessions_lock:
        _cleanup_stale_sessions_locked()
        code = _new_session_code()
        now = time.time()
        _sessions[code] = {
            "config": data.get("config") or {},
            "libraries": data.get("libraries") or {"local": [], "promo": [], "schedule": []},
            "events": [],
            "seq": 0,
            "paused": False,
            "stopped": False,
            "stopKind": None,
            "clients": {client_id: now},
            "heartbeatOwner": client_id,
            "lastActivity": now,
        }
        return jsonify(code=code)


@app.route("/api/sessions/<code>", methods=["GET"])
def get_session(code):
    client_id = request.args.get("clientId")
    with _sessions_lock:
        session = _sessions.get(code.upper())
        if not session:
            return jsonify(error="not found"), 404
        _touch_locked(session, client_id)
        return jsonify(**_public_state(session, client_id))


@app.route("/api/sessions/<code>/poll", methods=["GET"])
def poll_session(code):
    client_id = request.args.get("clientId")
    try:
        since = int(request.args.get("since", 0))
    except ValueError:
        since = 0
    with _sessions_lock:
        session = _sessions.get(code.upper())
        if not session:
            return jsonify(error="not found"), 404
        _touch_locked(session, client_id)
        new_events = [e for e in session["events"] if e["seq"] > since]
        return jsonify(
            events=[_public_event(e) for e in new_events if not e["removed"]],
            removedIds=[e["id"] for e in new_events if e["removed"]],
            maxSeq=session["seq"],
            paused=session["paused"],
            stopped=session["stopped"],
            stopKind=session["stopKind"],
            libraries=session["libraries"],
            isHeartbeatOwner=session["heartbeatOwner"] == client_id,
        )


@app.route("/api/sessions/<code>/events", methods=["POST"])
def post_event(code):
    data = request.get_json(force=True, silent=True) or {}
    client_id = data.get("clientId")
    event_id = data.get("id")
    if not event_id:
        return jsonify(error="id required"), 400
    with _sessions_lock:
        session = _sessions.get(code.upper())
        if not session:
            return jsonify(error="not found"), 404
        _touch_locked(session, client_id)
        if not any(e["id"] == event_id for e in session["events"]):
            session["seq"] += 1
            session["events"].append({
                "id": event_id,
                "type": data.get("type"),
                "seconds": data.get("seconds"),
                "name": data.get("name"),
                "spotId": data.get("spotId"),
                "timestamp": data.get("timestamp"),
                "seq": session["seq"],
                "removed": False,
            })
        return jsonify(ok=True, maxSeq=session["seq"])


@app.route("/api/sessions/<code>/undo", methods=["POST"])
def undo_event(code):
    data = request.get_json(force=True, silent=True) or {}
    client_id = data.get("clientId")
    event_id = data.get("id")
    with _sessions_lock:
        session = _sessions.get(code.upper())
        if not session:
            return jsonify(error="not found"), 404
        _touch_locked(session, client_id)
        for e in session["events"]:
            if e["id"] == event_id and not e["removed"]:
                session["seq"] += 1
                e["removed"] = True
                e["seq"] = session["seq"]  # bump so the removal itself is visible to pollers
                break
        return jsonify(ok=True, maxSeq=session["seq"])


@app.route("/api/sessions/<code>/pause", methods=["POST"])
def set_pause(code):
    data = request.get_json(force=True, silent=True) or {}
    client_id = data.get("clientId")
    with _sessions_lock:
        session = _sessions.get(code.upper())
        if not session:
            return jsonify(error="not found"), 404
        _touch_locked(session, client_id)
        session["paused"] = bool(data.get("paused"))
        return jsonify(ok=True)


@app.route("/api/sessions/<code>/library", methods=["POST"])
def set_library(code):
    data = request.get_json(force=True, silent=True) or {}
    client_id = data.get("clientId")
    lib_type = data.get("type")
    if lib_type not in ("local", "promo", "schedule"):
        return jsonify(error="invalid type"), 400
    with _sessions_lock:
        session = _sessions.get(code.upper())
        if not session:
            return jsonify(error="not found"), 404
        _touch_locked(session, client_id)
        session["libraries"][lib_type] = data.get("items") or []
        return jsonify(ok=True)


@app.route("/api/sessions/<code>/stop", methods=["POST"])
def stop_session(code):
    data = request.get_json(force=True, silent=True) or {}
    client_id = data.get("clientId")
    kind = data.get("kind") if data.get("kind") in ("stop", "reset") else "stop"
    with _sessions_lock:
        session = _sessions.get(code.upper())
        if not session:
            return jsonify(error="not found"), 404
        _touch_locked(session, client_id)
        session["stopped"] = True
        session["stopKind"] = kind
        return jsonify(ok=True)


if __name__ == "__main__":
    app.run(debug=False)
