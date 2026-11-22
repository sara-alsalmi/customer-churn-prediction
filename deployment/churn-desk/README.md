# مكتب رصين — Churn Desk with AE1

The existing Arabic desktop interface is preserved: lock screen, desktop, incoming calls, customer profile, Nabd model monitor and after-call report. The placeholder ANN has been replaced with the actual AE1 model trained on the team dataset.

From the **repository root**:

```bash
pip install -r requirements.txt
python scripts/prepare_deployment.py
uvicorn deployment.churn-desk.app.main:app --host 0.0.0.0 --port 7860
```

Open `http://localhost:7860`; model results are at `/results.html`; API docs are at `/docs`. `POST /api/predict` accepts `{"rows": [raw_customer_features]}` and returns subscription scores and yes/no predictions at the validation-selected threshold. Features must match `weights/AE1_Learned_Features/meta.json`.

The correct data is `data/bank_clean.csv`, derived from `bank-additional-full.csv`. Duration is excluded. All customers in the simulator come from the shared held-out test set. Their names and call reasons are fictional. The dataset records term-deposit subscription, not actual customer churn. The AE1 base score remains fixed for a customer; only the explicitly labeled conversation simulation changes during the call. Scores are not calibrated probabilities.

## Browser deployment

`python scripts/prepare_deployment.py` builds `dist/`, including the original interface, exported weights, train-fitted preprocessing, 120 public held-out profiles and a results page. The browser performs real model inference locally with no ML CDN. Scripted Arabic conversation runs locally. Speech and Arabic transcription use the hosted [ElevenLabs backend](../voice-backend/README.md); the browser falls back to its own voice if the service is unavailable. No language-model service is required.

The source lives under `web/`; generated data and image copies are reproducible and ignored by Git. The original model artifacts and plots are committed at the repository root. The generated `web/results.html` is a user-facing results summary.

## Python deployment

```bash
python scripts/prepare_deployment.py
docker build -f deployment/churn-desk/Dockerfile -t churn-desk-ae1 .
docker run -p 7860:7860 churn-desk-ae1
```

Optional live customer/voice services remain in the Python app. Copy `.env.example` into this directory as `.env`, then configure credentials and a currently supported customer model. Leave keys empty to use local replies and browser voice. Never commit `.env`. Public visitors need no keys: the published browser edition uses the separate hosted voice service, whose credentials stay on the server.

Tests: `python -m pytest tests/test_ae1.py -q` and `node --test deployment/churn-desk/tests/inference.test.mjs` from the repository root.

Public browser deployment (no account required): https://majed-codes.github.io/churn-desk-ae1/

GitHub Pages deployment repository: https://github.com/Majed-Codes/churn-desk-ae1
