"""Load AE1 once and score raw Bank Marketing feature rows."""
from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd
from tensorflow import keras


class AE1Predictor:
    def __init__(self, model_dir="weights/AE1_Learned_Features"):
        folder = Path(model_dir)
        self.meta = json.loads((folder / "meta.json").read_text())
        self.preprocessor = joblib.load(folder / "preprocessor.joblib")
        self.model = keras.models.load_model(folder / "model.keras", compile=False)

    def predict(self, rows):
        frame = pd.DataFrame(rows)
        missing = set(self.meta["features"]) - set(frame.columns)
        if missing:
            raise ValueError("Missing features: " + ", ".join(sorted(missing)))
        frame = frame[self.meta["features"]].copy()
        if frame.empty or frame.isna().any().any():
            raise ValueError("Provide nonempty rows without missing values")
        frame[self.meta["numeric"]] = frame[self.meta["numeric"]].astype(float)
        if not np.isfinite(frame[self.meta["numeric"]].to_numpy()).all():
            raise ValueError("Numeric features must be finite")
        x = self.preprocessor.transform(frame).astype("float32")
        scores = np.asarray(self.model(x, training=False)).ravel()
        threshold = self.meta["metrics"]["threshold"]
        return [{"subscription_score": float(p), "prediction": "yes" if p >= threshold else "no",
                 "threshold": threshold} for p in scores]
