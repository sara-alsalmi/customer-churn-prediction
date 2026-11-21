import importlib
import json
from pathlib import Path

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from tensorflow import keras

from src.preprocess import get_data, load_split
from src.predict import AE1Predictor


def test_split_has_no_shared_profiles_and_scaler_uses_train_only():
    df, splits = load_split()
    d = get_data()
    profiles = df.drop(columns="y").astype(str).agg("|".join, axis=1)
    sets = {name: set(profiles.iloc[ids]) for name, ids in splits.items()}
    assert not sets["train"] & sets["val"]
    assert not sets["train"] & sets["test"]
    assert not sets["val"] & sets["test"]
    cols = d["preprocessor"].transformers_[0][2]
    np.testing.assert_allclose(d["preprocessor"].named_transformers_["num"].mean_, df.iloc[splits["train"]][cols].mean())
    assert "duration" not in df.columns


def test_reload_matches_reported_test_scores_and_inference():
    d = get_data()
    folder = Path("weights/AE1_Learned_Features")
    meta = json.loads((folder / "meta.json").read_text())
    model = keras.models.load_model(folder / "model.keras", compile=False)
    actual = np.asarray(model(d["X_test"], training=False)).ravel()
    saved = np.load(f"results/scores/ae1_{meta['selected_stage']}.npz")
    np.testing.assert_allclose(actual, saved["test_scores"], atol=2e-6)
    df, splits = load_split()
    raw = df.iloc[splits["test"][:3]].drop(columns="y")
    predictor = AE1Predictor()
    result = predictor.predict(raw.to_dict("records"))
    np.testing.assert_allclose([x["subscription_score"] for x in result], actual[:3], atol=2e-6)
    bad = raw.iloc[0].to_dict()
    bad.pop("job")
    with pytest.raises(ValueError, match="Missing features"):
        predictor.predict([bad])


def test_api_complete_call_and_input_validation():
    app = importlib.import_module("deployment.churn-desk.app.main").app
    client = TestClient(app)
    assert client.get("/api/health").json()["ok"]
    start = client.post("/api/session").json()
    sid = start["session_id"]
    row = start["model_row"]
    assert "duration" not in row
    pred = client.post("/api/predict", json={"rows": [row]})
    assert pred.status_code == 200
    assert pred.json()["calibrated"] is False
    assert client.post("/api/predict", json={"rows": [{}]}).status_code == 422
    assert client.post("/api/predict", json={"rows": []}).status_code == 422
    bad = dict(row, age="nan")
    assert client.post("/api/predict", json={"rows": [bad]}).status_code == 422
    assert client.post(f"/api/session/{sid}/turn", json={"text": " "}).status_code == 400
    turn = client.post(f"/api/session/{sid}/turn", json={"text": "السلام عليكم، اعتذر عن المشكلة. أفهم وضعك، كيف نقدر نساعدك؟", "elapsed": 30})
    assert turn.status_code == 200
    assert turn.json()["score"]["ann"] == start["score"]["ann"]
    assert turn.json()["score"]["duration_used_by_model"] is False
    report = client.post(f"/api/session/{sid}/end", json={"elapsed": 35})
    assert report.status_code == 200
    assert report.json()["turns"] == 1
    assert client.post(f"/api/session/{sid}/turn", json={"text": "مرحبا"}).status_code == 409
