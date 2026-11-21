"""ElevenLabs text-to-speech and speech-to-text (live mode only)."""
from __future__ import annotations

import os

import httpx

API = "https://api.elevenlabs.io/v1"


def key() -> str | None:
    return os.getenv("ELEVENLABS_API_KEY") or None


def voice_for(gender: str) -> str:
    if gender == "f":
        return os.getenv("ELEVENLABS_VOICE_FEMALE") or os.getenv("ELEVENLABS_VOICE_MALE", "")
    return os.getenv("ELEVENLABS_VOICE_MALE") or os.getenv("ELEVENLABS_VOICE_FEMALE", "")


async def tts(text: str, gender: str) -> bytes:
    voice = voice_for(gender)
    if not voice:
        raise RuntimeError("Set ELEVENLABS_VOICE_MALE / ELEVENLABS_VOICE_FEMALE in .env")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{API}/text-to-speech/{voice}",
            params={"output_format": "mp3_44100_128"},
            headers={"xi-api-key": key(), "accept": "audio/mpeg"},
            json={"text": text, "model_id": os.getenv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2"),
                  "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35}},
        )
        r.raise_for_status()
        return r.content


async def stt(audio: bytes, filename: str, mime: str) -> str:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"{API}/speech-to-text",
            headers={"xi-api-key": key()},
            data={"model_id": os.getenv("ELEVENLABS_STT_MODEL", "scribe_v1"), "language_code": "ara"},
            files={"file": (filename, audio, mime)},
        )
        r.raise_for_status()
        return (r.json().get("text") or "").strip()
