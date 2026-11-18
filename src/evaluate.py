"""Shared evaluation: the same metrics for every model.

In each notebook, after training:
    from src.evaluate import evaluate_scores
    metrics = evaluate_scores("ann1_regularization", d["id_val"], d["y_val"], val_scores,
                              d["id_test"], d["y_test"], test_scores)

Scores must be HIGHER for clients more likely to say "yes":
the predicted probability for classifiers, the reconstruction error for the anomaly autoencoder.

The threshold is chosen on validation (best F1) and applied to test.
Each call saves results/scores/<name>.npz. To compare all saved models:
    python -m src.evaluate        -> results/comparison.csv, results/test_curves.png
"""
import functools
import glob
import os

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (average_precision_score, f1_score, precision_recall_curve,
                             precision_score, recall_score, roc_auc_score, roc_curve)

from src.preprocess import CLEAN_PATH, TARGET, load_split

SCORES_DIR = "results/scores"
OUT_DIR = "results"


# ---------- checks against the shared split ----------
@functools.lru_cache(maxsize=None)
def _shared_split(path):
    df, splits = load_split(path)
    return df[TARGET].to_numpy(), splits


def check_scores(split, ids, y, scores, path=CLEAN_PATH):
    """Make sure row ids, labels and scores match the shared split. Returns (ids, y, scores) as arrays."""
    y_all, splits = _shared_split(path)
    ids, y = np.asarray(ids), np.asarray(y)
    scores = np.asarray(scores, dtype="float64").ravel()

    if not (len(ids) == len(y) == len(scores)):
        raise ValueError(f"{split}: ids ({len(ids)}), labels ({len(y)}) and scores ({len(scores)}) differ in length")
    if len(ids) != len(splits[split]) or not np.array_equal(np.sort(ids), splits[split]):
        raise ValueError(f"{split}: row ids do not match the shared {split} split (use d['id_{split}'])")
    if not np.array_equal(y, y_all[ids]):
        raise ValueError(f"{split}: labels do not match bank_clean.csv for these row ids")
    if not np.isfinite(scores).all():
        raise ValueError(f"{split}: scores contain NaN or inf")
    return ids, y, scores


# ---------- metrics ----------
def best_threshold(y, scores):
    """Threshold with the highest F1 (chosen on validation)."""
    p, r, t = precision_recall_curve(y, scores)
    f1 = 2 * p * r / (p + r + 1e-12)
    return t[np.argmax(f1[:-1])]


def compute_metrics(y_val, val_scores, y_test, test_scores):
    """Threshold from validation, applied to test."""
    th = best_threshold(y_val, val_scores)
    pred = (test_scores >= th).astype(int)
    return {"val_avg_precision": average_precision_score(y_val, val_scores),
            "test_avg_precision": average_precision_score(y_test, test_scores),
            "test_roc_auc": roc_auc_score(y_test, test_scores),
            "test_precision": precision_score(y_test, pred, zero_division=0),
            "test_recall": recall_score(y_test, pred, zero_division=0),
            "test_f1": f1_score(y_test, pred, zero_division=0),
            "threshold": float(th)}


def evaluate_scores(name, id_val, y_val, val_scores, id_test, y_test, test_scores, scores_dir=SCORES_DIR):
    """Check one model's scores, compute its metrics and save them to results/scores/<name>.npz."""
    id_val, y_val, val_scores = check_scores("val", id_val, y_val, val_scores)
    id_test, y_test, test_scores = check_scores("test", id_test, y_test, test_scores)
    os.makedirs(scores_dir, exist_ok=True)
    np.savez(os.path.join(scores_dir, f"{name}.npz"), id_val=id_val, y_val=y_val, val_scores=val_scores,
             id_test=id_test, y_test=y_test, test_scores=test_scores)
    return compute_metrics(y_val, val_scores, y_test, test_scores)


# ---------- comparison of all saved models ----------
def compare(scores_dir=SCORES_DIR, out_dir=OUT_DIR):
    files = sorted(glob.glob(os.path.join(scores_dir, "*.npz")))
    if not files:
        raise FileNotFoundError(f"no score files in {scores_dir}/ (call evaluate_scores in each notebook)")

    rows, curves = [], {}
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        s = np.load(f)
        _, y_val, val_s = check_scores("val", s["id_val"], s["y_val"], s["val_scores"])
        _, y_test, test_s = check_scores("test", s["id_test"], s["y_test"], s["test_scores"])
        rows.append({"model": name, **compute_metrics(y_val, val_s, y_test, test_s)})
        curves[name] = (y_test, test_s)

    # ranked on validation; test is only reported
    table = pd.DataFrame(rows).sort_values("val_avg_precision", ascending=False).round(4)
    os.makedirs(out_dir, exist_ok=True)
    table.to_csv(os.path.join(out_dir, "comparison.csv"), index=False)

    # ROC and Precision-Recall curves on the test set
    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    for name, (y, s) in curves.items():
        fpr, tpr, _ = roc_curve(y, s)
        axes[0].plot(fpr, tpr, label=f"{name} ({roc_auc_score(y, s):.3f})")
        p, r, _ = precision_recall_curve(y, s)
        axes[1].plot(r, p, label=f"{name} ({average_precision_score(y, s):.3f})")
    axes[0].plot([0, 1], [0, 1], "k--")
    axes[1].axhline(y.mean(), color="k", ls="--", label="random")
    axes[0].set(title="ROC curve", xlabel="False positive rate", ylabel="True positive rate")
    axes[1].set(title="Precision-Recall curve", xlabel="Recall", ylabel="Precision")
    axes[0].legend()
    axes[1].legend()
    plt.tight_layout()
    plt.savefig(os.path.join(out_dir, "test_curves.png"), dpi=110)
    plt.close()
    return table


if __name__ == "__main__":
    print(compare().to_string(index=False))
