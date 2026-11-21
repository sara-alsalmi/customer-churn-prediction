"""Load the real AE1 model and train-fitted preprocessing.
The model outputs a subscription score; the desk uses its complement as the
base non-subscription score. Conversation effects are simulated separately.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ART = Path(__file__).resolve().parents[3] / "weights" / "AE1_Learned_Features"

NUMERIC_DEFAULT = ["age", "balance", "day", "duration", "campaign", "pdays", "previous"]


class ChurnModel:
    def __init__(self, art_dir: Path = ART):
        self.meta = json.loads((art_dir / "meta.json").read_text()) if (art_dir / "meta.json").exists() else {}
        self.features: list[str] = self.meta.get("features") or []
        self.numeric = set(self.meta.get("numeric") or NUMERIC_DEFAULT)
        self.positive = self.meta.get("positive_class", "churn")
        self.kind = None
        self.pre = None
        if (art_dir / "model.keras").exists():
            import joblib
            from tensorflow import keras  # only needed for a Keras model
            self.model = keras.models.load_model(art_dir / "model.keras", compile=False)
            self.pre = joblib.load(art_dir / "preprocessor.joblib")
            self.kind = "keras"
        elif (art_dir / "model.joblib").exists():
            import joblib
            self.model = joblib.load(art_dir / "model.joblib")
            self.kind = "sklearn"
        else:
            raise FileNotFoundError(f"No model in {art_dir}. Run: python model/train_placeholder.py")

    @property
    def name(self) -> str:
        return self.meta.get("name", "Team ANN")

    def _frame(self, rows: list[dict]) -> pd.DataFrame:
        df = pd.DataFrame(rows)
        if self.features:
            missing = set(self.features) - set(df.columns)
            if missing:
                raise ValueError("Missing features: " + ", ".join(sorted(missing)))
            df = df[self.features]
        if df.empty or df.isna().any().any():
            raise ValueError("Provide nonempty rows without missing values")
        for c in df.columns:
            if c in self.numeric:
                df[c] = df[c].astype(float)
                if not np.isfinite(df[c].to_numpy()).all():
                    raise ValueError(f"Nonfinite numeric feature: {c}")
        return df

    def predict_many(self, rows: list[dict]) -> np.ndarray:
        X = self._frame(rows)
        if self.kind == "keras":
            p = np.asarray(self.model(self.pre.transform(X).astype("float32"), training=False)).reshape(len(rows), -1)
            p = p[:, -1]
        else:
            p = self.model.predict_proba(X)[:, 1]
        p = np.clip(p.astype(float), 0.0, 1.0)
        return p if self.positive == "churn" else 1.0 - p

    def predict(self, row: dict) -> float:
        return float(self.predict_many([row])[0])


def logit(p: float) -> float:
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))
