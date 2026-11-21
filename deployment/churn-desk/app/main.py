"""Churn Desk: FastAPI server for the call simulator.

Run:  uvicorn app.main:app --reload --port 8000   then open http://localhost:8000
"""
from __future__ import annotations

import logging
import os
import random
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load_env():
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()

from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import FileResponse, Response  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from . import voice  # noqa: E402
from .customers import SCENARIOS, CustomerBank  # noqa: E402
from .engine import SIGNAL_AR, SIGNALS, CallSession, offline_signals, quality  # noqa: E402
from .model_service import ChurnModel  # noqa: E402

log = logging.getLogger("churn-desk")

MODEL = ChurnModel()
BANK = CustomerBank(MODEL)
SESSIONS: dict[str, CallSession] = {}

LIVE_BRAIN = bool(os.getenv("ANTHROPIC_API_KEY") and os.getenv("CUSTOMER_CLAUDE_MODEL")) and os.getenv("FORCE_OFFLINE") != "1"
LIVE_VOICE = bool(voice.key()) and os.getenv("FORCE_OFFLINE") != "1"
BRAIN = None
if LIVE_BRAIN:
    from .claude_brain import ClaudeCustomer
    BRAIN = ClaudeCustomer()

app = FastAPI(title="Churn Desk")


class PredictRows(BaseModel):
    rows: list[dict] = Field(min_length=1, max_length=100)


@app.post("/api/predict")
def predict_rows(body: PredictRows):
    try:
        risk = MODEL.predict_many(body.rows)
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    threshold = MODEL.meta["metrics"]["threshold"]
    return {"target": MODEL.meta["target"], "calibrated": False,
            "predictions": [{"subscription_score": float(1 - p),
                             "prediction": "yes" if 1 - p >= threshold else "no"}
                            for p in risk], "threshold": threshold}


@app.get("/results.html")
def model_results():
    return FileResponse(ROOT / "web" / "results.html")


@app.middleware("http")
async def revalidate_static(request, call_next):
    # The UI is plain ES modules; make browsers re-check them so updates show at once.
    resp = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/api/config")
def config():
    return {
        "brain": "claude" if LIVE_BRAIN else "offline",
        "voice": "elevenlabs" if LIVE_VOICE else "browser",
        "model": {"name": MODEL.name, "auc": MODEL.meta.get("test_auc"), "features": MODEL.features,
                  "kind": MODEL.kind, "dataset": MODEL.meta.get("dataset")},
        "pool": len(BANK.pool),
        "signals": [{"key": k, "label": SIGNAL_AR[k], "negative": k in ("pressure", "rudeness")} for k in SIGNALS],
    }


@app.post("/api/session")
async def new_session():
    c = BANK.draw(random.Random())
    s = CallSession(customer=c, model=MODEL, mode="live" if LIVE_BRAIN else "offline")
    SESSIONS[s.id] = s
    opening = None
    if BRAIN:
        try:
            opening = await BRAIN.opening(c)
        except Exception as e:  # keep the call going on any API problem
            log.warning("opening fell back to offline: %s", e)
    opening = opening or s.opening()
    s.turns.append({"role": "customer", "text": opening})
    sc = s.score(0)
    s.timeline.append({"t": 0, **sc, "label": "بداية المكالمة"})
    return {"session_id": s.id, "customer": c.public(), "opening": opening, "score": sc,
            "hint": s.hint(None), "model_row": c.row}


class Turn(BaseModel):
    text: str
    elapsed: float = 0


@app.post("/api/session/{sid}/turn")
async def turn(sid: str, body: Turn):
    s = SESSIONS.get(sid)
    if not s:
        raise HTTPException(404, "no such call")
    if s.ended:
        raise HTTPException(409, "call ended")
    text = body.text.strip()[:1200]
    if not text:
        raise HTTPException(400, "empty")
    s.turns.append({"role": "employee", "text": text})
    before = s.timeline[-1]["final"] if s.timeline else None

    reply = end = hint = None
    source = "offline"
    if BRAIN:
        try:
            out = await BRAIN.turn(s.customer, s.turns, {"mood": s.mood, "trust": s.trust, "interest": s.interest})
            sig = dict(out["signals"])
            sig["_fix_hits"] = 1 if out["addressed_core_issue"] else 0
            s.apply(sig)
            reply, hint = out["reply"], out["hint"]
            end = None if out["end_call"] == "no" else out["end_call"]
            source = "claude"
        except Exception as e:
            log.warning("turn fell back to offline: %s", e)
    if reply is None:
        sig = offline_signals(text, s.customer, s.turns)
        s.apply(sig)
        reply, end = s.offline_reply(sig)
        hint = s.hint(sig)

    s.turns.append({"role": "customer", "text": reply})
    if end:
        s.ended, s.end_reason = True, end
        # The customer's decision sets their engagement; the ANN then scores it as usual.
        # Retained: they stay on the line as long as a fully engaged caller.
        # Hung up: the call ends now, so duration is the real elapsed time.
        v = 1.0 if end == "retained" else -1.0
        s.mood = s.trust = s.interest = v
    sc = s.score(body.elapsed, sig)
    s.timeline.append({"t": round(body.elapsed, 1), **sc, "label": text[:60],
                       "signals": {k: round(sig[k], 2) for k in SIGNALS}, "quality": round(quality(sig), 3)})
    return {"reply": reply, "score": sc, "delta": None if before is None else round(sc["final"] - before, 4),
            "signals": {k: round(sig[k], 3) for k in SIGNALS}, "quality": round(quality(sig), 3),
            "hint": hint, "ended": s.ended, "end_reason": s.end_reason, "source": source}


class End(BaseModel):
    elapsed: float = 0


@app.post("/api/session/{sid}/end")
def end(sid: str, body: End):
    s = SESSIONS.get(sid)
    if not s:
        raise HTTPException(404, "no such call")
    if not s.ended:
        s.ended = True
        s.end_reason = "employee_hung_up"
    tl = s.timeline
    steps = [(tl[i]["final"] - tl[i - 1]["final"], tl[i]) for i in range(1, len(tl))]
    best = min(steps, key=lambda x: x[0]) if steps else None
    worst = max(steps, key=lambda x: x[0]) if steps else None
    sigs = [t["signals"] for t in tl if "signals" in t]
    avg = {k: round(sum(x[k] for x in sigs) / len(sigs), 3) for k in SIGNALS} if sigs else {}
    final = tl[-1]["final"]
    outcome = s.end_reason == "retained" or (s.end_reason == "employee_hung_up" and final < 0.5)
    return {
        "outcome": "retained" if outcome else "churned",
        "end_reason": s.end_reason,
        "final": final, "start": tl[0]["final"], "timeline": tl,
        "best": best and {"delta": round(best[0], 4), "text": best[1]["label"]},
        "worst": worst and {"delta": round(worst[0], 4), "text": worst[1]["label"]},
        "avg_signals": avg,
        "turns": len([t for t in s.turns if t["role"] == "employee"]),
        "elapsed": round(body.elapsed),
        "actual": {"y": s.customer.actual_y, "row_index": s.customer.row_index},
        "scenario": SCENARIOS[s.customer.scenario]["title"],
        "transcript": s.turns,
    }


class Speak(BaseModel):
    text: str
    gender: str = "m"


@app.post("/api/tts")
async def tts(body: Speak):
    if not LIVE_VOICE:
        raise HTTPException(404, "voice is offline; the browser speaks instead")
    try:
        audio = await voice.tts(body.text[:600], body.gender)
    except Exception as e:
        raise HTTPException(502, f"tts failed: {e}")
    return Response(audio, media_type="audio/mpeg")


@app.post("/api/stt")
async def stt(file: UploadFile = File(...)):
    if not LIVE_VOICE:
        raise HTTPException(404, "voice is offline; the browser listens instead")
    data = await file.read()
    try:
        return {"text": await voice.stt(data, file.filename or "speech.webm", file.content_type or "audio/webm")}
    except Exception as e:
        raise HTTPException(502, f"stt failed: {e}")


@app.get("/api/health")
def health():
    return {"ok": True, "time": time.time()}


WEB = ROOT / "web"
app.mount("/static", StaticFiles(directory=WEB), name="static")


@app.get("/")
def index():
    return FileResponse(WEB / "index.html")
