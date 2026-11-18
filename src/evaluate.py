"""Compare the 5 trained models.

Usage:
    python -m src.evaluate

Saves: results/comparison.csv, results/learning_curves.png, results/test_curves.png
"""
import json
import os

import keras
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (average_precision_score, f1_score, precision_recall_curve,
                             precision_score, recall_score, roc_auc_score, roc_curve)

from src.preprocess import get_data
from src.train import MODELS


def get_scores(name, model, X):
    """Probability of "yes"; for the anomaly autoencoder: reconstruction error."""
    if name == "ae_anomaly":
        return np.mean((X - model.predict(X, verbose=0)) ** 2, axis=1)   # high error = likely "yes"
    return model.predict(X, verbose=0).ravel()


def best_threshold(y, scores):
    """Threshold with the highest F1 (chosen on validation)."""
    p, r, t = precision_recall_curve(y, scores)
    f1 = 2 * p * r / (p + r + 1e-12)
    return t[np.argmax(f1[:-1])]


def evaluate():
    d = get_data()
    rows, test_scores = [], {}
    names = [n for n in MODELS if os.path.exists(f"models/{n}.keras")]

    for name in names:
        model = keras.models.load_model(f"models/{name}.keras", compile=False)
        val_s, test_s = get_scores(name, model, d["X_val"]), get_scores(name, model, d["X_test"])
        th = best_threshold(d["y_val"], val_s)            # threshold from validation...
        pred = (test_s >= th).astype(int)                 # ...applied to test
        test_scores[name] = test_s
        rows.append({"model": name,
                     "val_pr_auc": average_precision_score(d["y_val"], val_s),
                     "test_pr_auc": average_precision_score(d["y_test"], test_s),
                     "test_roc_auc": roc_auc_score(d["y_test"], test_s),
                     "test_f1": f1_score(d["y_test"], pred),
                     "test_precision": precision_score(d["y_test"], pred),
                     "test_recall": recall_score(d["y_test"], pred),
                     "threshold": th})

    table = pd.DataFrame(rows).sort_values("val_pr_auc", ascending=False).round(4)
    table.to_csv("results/comparison.csv", index=False)

    # learning curves: train vs validation loss
    fig, axes = plt.subplots(1, len(names), figsize=(4.5 * len(names), 3.5), squeeze=False)
    for ax, name in zip(axes[0], names):
        h = json.load(open(f"results/{name}_history.json"))
        ax.plot(h["loss"], label="train")
        ax.plot(h["val_loss"], label="validation")
        ax.set_title(name)
        ax.set_xlabel("epoch")
        ax.legend()
    plt.tight_layout()
    plt.savefig("results/learning_curves.png", dpi=110)
    plt.close()

    # ROC and Precision-Recall curves on the test set
    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    for name, s in test_scores.items():
        fpr, tpr, _ = roc_curve(d["y_test"], s)
        axes[0].plot(fpr, tpr, label=f"{name} ({roc_auc_score(d['y_test'], s):.3f})")
        p, r, _ = precision_recall_curve(d["y_test"], s)
        axes[1].plot(r, p, label=f"{name} ({average_precision_score(d['y_test'], s):.3f})")
    axes[0].plot([0, 1], [0, 1], "k--")
    axes[1].axhline(d["y_test"].mean(), color="k", ls="--", label="random")
    axes[0].set(title="ROC curve", xlabel="False positive rate", ylabel="True positive rate")
    axes[1].set(title="Precision-Recall curve", xlabel="Recall", ylabel="Precision")
    axes[0].legend()
    axes[1].legend()
    plt.tight_layout()
    plt.savefig("results/test_curves.png", dpi=110)
    plt.close()

    return table


if __name__ == "__main__":
    print(evaluate().to_string(index=False))
