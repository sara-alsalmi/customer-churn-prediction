"""Opt-in smoke test of real ElevenLabs TTS and Arabic STT through the hosted backend.

This test uses provider credits. Run explicitly with --live.
No API key is needed locally: the backend owns its credential.
"""
import argparse
from email.parser import BytesHeaderParser
import hashlib
import io
import json
from pathlib import Path
import subprocess

BASE = "https://churn-desk-ae1.majedx10.chatgpt.site"
ORIGIN = "https://majed-codes.github.io"
PHRASE = "مرحباً، هذا اختبار صوت مكتب رصين باستخدام إلفن لابز."


def request(path, data=None, token=None, file=None):
    # curl's HTTP transport works with the hosting edge; urllib can be rejected there.
    # Authentication headers are passed on stdin, never in process arguments or files.
    quote = lambda value: json.dumps(str(value), ensure_ascii=False)
    config = ["url = " + quote(BASE + path), "header = " + quote("Origin: " + ORIGIN)]
    if token:
        config.append("header = " + quote("Authorization: Bearer " + token))
    if data is not None:
        config.extend(["header = " + quote("Content-Type: application/json"),
                       "data = " + quote(json.dumps(data, ensure_ascii=False))])
    if file:
        config.append("form = " + quote("file=@" + str(file) + ";type=audio/mpeg"))
    result = subprocess.run(["curl", "--silent", "--show-error", "--include", "--max-time", "90", "--config", "-"],
                            input=("\n".join(config) + "\n").encode(), stdout=subprocess.PIPE, check=True)
    raw = result.stdout
    while raw.startswith(b"HTTP/"):
        header, _, raw = raw.partition(b"\r\n\r\n")
        status = int(header.splitlines()[0].split()[1])
        headers = BytesHeaderParser().parsebytes(header.partition(b"\r\n")[2])
    if status != 200:
        raise RuntimeError(f"Voice endpoint {path} returned {status}: {raw[:200].decode(errors='replace')}")
    response = io.BytesIO(raw)
    response.headers = headers
    return response


def run(output):
    output.mkdir(parents=True, exist_ok=True)
    with request("/voice/config") as response:
        config = json.load(response)
    assert config["configured"], "Backend voice credentials are not configured"
    with request("/voice/session", {}) as response:
        token = json.load(response)["token"]
    recordings = []
    for gender, name in [("m", "male"), ("f", "female")]:
        with request("/api/tts", {"text": PHRASE, "gender": gender}, token) as response:
            assert response.headers.get("X-Voice-Provider") == "elevenlabs"
            audio = response.read()
        path = output / ("elevenlabs-" + name + ".mp3")
        path.write_bytes(audio)
        probe = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name", "-of", "json", str(path)
        ]))
        duration = float(probe["format"]["duration"])
        assert duration > 1.0 and any(s["codec_name"] == "mp3" for s in probe["streams"])
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"], check=True)
        recordings.append({"gender": name, "bytes": len(audio), "duration_seconds": duration,
                           "sha256": hashlib.sha256(audio).hexdigest(), "file": path.name})
    assert recordings[0]["sha256"] != recordings[1]["sha256"], "Both gender requests returned identical audio"
    with request("/api/stt", token=token, file=output / "elevenlabs-female.mp3") as response:
        transcript = json.load(response)
    assert transcript["provider"] == "elevenlabs"
    assert "اختبار" in transcript["text"] and "صوت" in transcript["text"], "Arabic round-trip transcription did not match"
    report = {"passed": True, "backend": BASE, "config": config, "recordings": recordings,
              "arabic_round_trip": transcript, "source_phrase": PHRASE}
    (output / "live-test.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Run real provider requests, consuming API credits")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if not args.live:
        parser.error("Pass --live to confirm real provider requests")
    run(args.output_dir)
