# ElevenLabs voice backend

The public GitHub Pages app keeps AE1 inference and scripted conversation in the browser. This small hosted Worker provides ElevenLabs speech generation and Arabic transcription. It needs no Python/TensorFlow server and never exposes its API key to the browser.

- Public app: https://majed-codes.github.io/churn-desk-ae1/
- Voice readiness: https://churn-desk-ae1.majedx10.chatgpt.site/voice/config
- Health: https://churn-desk-ae1.majedx10.chatgpt.site/api/health

Runtime secrets and voice IDs are configured on the hosting service. `.env.example` lists the names. Never place an API key in this repository, GitHub Pages, a URL, or the HTML. The service needs an active key with TTS and speech-to-text access. A temporary key stops working when it expires; replace the runtime secret and redeploy to apply it.

The deployed male voice is Abu Fahad (Saudi Arabic Customer Care), and the female voice is Hala (native Arabic). TTS uses `eleven_multilingual_v2`, and transcription uses `scribe_v2` with Arabic language selection. The browser shows the actual playback provider, including when it falls back to browser speech.

## Build and test

From the repository root:

```bash
python scripts/prepare_voice_backend.py
node deployment/voice-backend/scripts/build.mjs
node deployment/voice-backend/scripts/validate-artifact.mjs
node --test deployment/voice-backend/tests/worker.test.mjs
```

The speech catalog is generated from the simulator's scripted customer responses and campaign values in `bank_clean.csv`. The backend accepts only these approved phrases for TTS. New scripted replies require rebuilding the catalog. It attempts to cache repeated TTS audio when the runtime Cache API is available, uses signed 10-minute voice sessions, allows the GitHub Pages origin, limits upload size to 1 MB, and applies per-isolate request limits. These limits suit a class demo; they are not a durable account-wide spending quota. Microphone recording stops after 30 seconds. Audio/transcripts are passed through to ElevenLabs and are not logged or stored by the application; the provider's retention settings still apply.

The frontend uses `/voice/config` to discover readiness, `/voice/session` for a short-lived token, and `/api/tts` or `/api/stt` for audio. The signing secret is derived from the server-only ElevenLabs key, so changing the key invalidates previous sessions. If the service is unavailable, the simulator keeps running and uses browser speech.

The `.openai/hosting.json` identity is retained from the earlier private Site, which now hosts this public voice backend. Its root redirects to GitHub Pages.

Real integration smoke test (consumes provider credits):

```bash
python scripts/test_live_voice.py --live --output-dir work/voice-live-test
```

This generates male/female MP3 samples, decodes them with FFmpeg, checks duration with FFprobe, and transcribes the female clip back to Arabic through the deployed Scribe endpoint.
