"""AE 1: denoising learned features, frozen classifier, then fine-tuning.

Run from the repository root: python -m src.ae1
The same functions are used by AE1_Learned_Features.ipynb.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_NUM_INTEROP_THREADS", "2")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "4")

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.metrics import (ConfusionMatrixDisplay, accuracy_score, average_precision_score,
                             classification_report, precision_recall_curve, roc_auc_score, roc_curve)
from tensorflow import keras

from src.evaluate import evaluate_scores
from src.preprocess import SEED, get_class_weights, get_columns, get_data, load_split

WEIGHTS = Path("weights/AE1_Learned_Features")
RESULTS = Path("results/ae1")
COLORS = ["#2a78d6", "#eb6834"]
TRIALS = [(8, 0.10), (16, 0.10), (16, 0.20)]


def reset_seed():
    keras.utils.set_random_seed(SEED)


def dataset(x, y, training=False, batch_size=256, weights=None):
    """Bound tf.data threads so the notebook also runs on small machines."""
    values = (x, y) if weights is None else (x, y, weights)
    ds = tf.data.Dataset.from_tensor_slices(values)
    if training:
        ds = ds.shuffle(len(x), seed=SEED, reshuffle_each_iteration=True)
    options = tf.data.Options()
    options.threading.private_threadpool_size = 2
    return ds.batch(batch_size).with_options(options).prefetch(1)


def predict(model, x):
    return np.asarray(model.predict(dataset(x, np.zeros(len(x))), verbose=0))


def build_autoencoder(n_features, latent_dim=16, noise=0.10):
    """Noise is active only during training. Targets remain the clean inputs."""
    encoder = keras.Sequential([
        keras.Input(shape=(n_features,)),
        keras.layers.Dense(64, activation="relu", kernel_regularizer=keras.regularizers.l2(1e-4)),
        keras.layers.Dense(32, activation="relu"),
        keras.layers.Dense(latent_dim, activation="linear", name="latent"),
    ], name="encoder")
    inputs = keras.Input(shape=(n_features,))
    encoded = encoder(keras.layers.GaussianNoise(noise)(inputs))
    decoded = keras.layers.Dense(32, activation="relu")(encoded)
    decoded = keras.layers.Dense(64, activation="relu")(decoded)
    # StandardScaler produces negative values, so a sigmoid decoder is unsuitable.
    outputs = keras.layers.Dense(n_features, activation="linear")(decoded)
    autoencoder = keras.Model(inputs, outputs, name=f"denoising_ae_{latent_dim}")
    autoencoder.compile(optimizer=keras.optimizers.Adam(1e-3), loss="mse")
    return autoencoder, encoder


def build_classifier(encoder):
    inputs = keras.Input(shape=encoder.input_shape[1:])
    x = encoder(inputs)
    x = keras.layers.Dense(16, activation="relu", kernel_regularizer=keras.regularizers.l2(1e-4))(x)
    x = keras.layers.Dropout(0.20)(x)
    return keras.Model(inputs, keras.layers.Dense(1, activation="sigmoid")(x), name="ae1_classifier")


def compile_classifier(model, learning_rate):
    model.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="binary_crossentropy",
                  metrics=[keras.metrics.AUC(curve="PR", name="pr_auc")])


def fit_autoencoder(model, d, epochs):
    return model.fit(dataset(d["X_train"], d["X_train"], training=True),
                     validation_data=dataset(d["X_val"], d["X_val"]), epochs=epochs,
                     callbacks=[keras.callbacks.EarlyStopping(monitor="val_loss", patience=5,
                                                              restore_best_weights=True)], verbose=0)


def fit_classifier(model, d, epochs):
    cw = get_class_weights(d["y_train"])
    sample_weights = np.array([cw[int(y)] for y in d["y_train"]], dtype="float32")
    return model.fit(dataset(d["X_train"], d["y_train"], training=True, weights=sample_weights),
                     validation_data=dataset(d["X_val"], d["y_val"]), epochs=epochs,
                     callbacks=[keras.callbacks.EarlyStopping(monitor="val_pr_auc", mode="max", patience=6,
                                                              restore_best_weights=True)], verbose=0)


def train_trial(d, latent_dim, noise, epochs):
    reset_seed()
    ae, encoder = build_autoencoder(d["X_train"].shape[1], latent_dim, noise)
    ae_history = fit_autoencoder(ae, d, epochs)
    encoder.trainable = False
    classifier = build_classifier(encoder)
    compile_classifier(classifier, 1e-3)
    before = [w.copy() for w in encoder.get_weights()]
    frozen_history = fit_classifier(classifier, d, epochs)
    assert all(np.array_equal(a, b) for a, b in zip(before, encoder.get_weights())), "Frozen encoder changed"
    frozen = keras.models.clone_model(classifier)
    frozen.set_weights(classifier.get_weights())
    frozen_scores = predict(frozen, d["X_val"]).ravel()
    # Recompile after unfreezing so Keras updates the encoder weights too.
    encoder.trainable = True
    compile_classifier(classifier, 1e-4)
    fine_history = fit_classifier(classifier, d, epochs)
    fine_scores = predict(classifier, d["X_val"]).ravel()
    summary = {"latent_dim": latent_dim, "noise_std": noise,
               "frozen_val_ap": float(average_precision_score(d["y_val"], frozen_scores)),
               "finetuned_val_ap": float(average_precision_score(d["y_val"], fine_scores)),
               "ae_epochs": len(ae_history.history["loss"]),
               "frozen_epochs": len(frozen_history.history["loss"]),
               "finetune_epochs": len(fine_history.history["loss"])}
    return {"summary": summary, "frozen": frozen, "finetuned": classifier,
            "autoencoder": ae, "pretrained_weights": before,
            "histories": {"denoising": ae_history.history, "frozen": frozen_history.history,
                          "finetuned": fine_history.history}}


def plot_curves(d, models, histories):
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.5))
    for ax, (name, history) in zip(axes, histories.items()):
        key = "loss" if name == "denoising" else "pr_auc"
        ax.plot(history[key], label="Train", color=COLORS[0])
        ax.plot(history["val_" + key], label="Validation", color=COLORS[1])
        ax.set(title=name.capitalize(), xlabel="Epoch", ylabel="MSE" if key == "loss" else "Keras PR-AUC")
        ax.legend()
        ax.grid(alpha=.2)
    fig.tight_layout()
    fig.savefig(RESULTS / "learning_curves.png", dpi=150)
    plt.close(fig)
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    for name, scores in models.items():
        fpr, tpr, _ = roc_curve(d["y_test"], scores)
        axes[0].plot(fpr, tpr, label=f"{name}: {roc_auc_score(d['y_test'], scores):.3f}")
        p, r, _ = precision_recall_curve(d["y_test"], scores)
        axes[1].plot(r, p, label=f"{name}: AP {average_precision_score(d['y_test'], scores):.3f}")
    axes[0].plot([0, 1], [0, 1], "k--", alpha=.4)
    axes[1].axhline(d["y_test"].mean(), color="gray", ls="--", label="Random")
    axes[0].set(title="Test ROC", xlabel="False positive rate", ylabel="True positive rate")
    axes[1].set(title="Test precision-recall", xlabel="Recall", ylabel="Precision")
    for ax in axes:
        ax.legend(fontsize=8)
        ax.grid(alpha=.2)
    fig.tight_layout()
    fig.savefig(RESULTS / "test_curves.png", dpi=150)
    plt.close(fig)


def dense_layers(model):
    """Flatten the nested encoder for portable inference; dropout is inactive."""
    out = []
    for layer in model.layers:
        if isinstance(layer, keras.Model):
            out.extend(dense_layers(layer))
        elif isinstance(layer, keras.layers.Dense):
            kernel, bias = layer.get_weights()
            out.append({"kernel": kernel.tolist(), "bias": bias.tolist(),
                        "activation": layer.activation.__name__})
    return out


def export_browser(model, preprocessor, meta):
    num_cols = list(preprocessor.transformers_[0][2])
    cat_cols = list(preprocessor.transformers_[1][2])
    scaler = preprocessor.named_transformers_["num"]
    onehot = preprocessor.named_transformers_["cat"]
    export = {"meta": meta, "numeric": num_cols, "mean": scaler.mean_.tolist(),
              "scale": scaler.scale_.tolist(), "categorical": cat_cols,
              "categories": [c.tolist() for c in onehot.categories_], "layers": dense_layers(model)}
    (WEIGHTS / "browser_model.json").write_text(json.dumps(export, separators=(",", ":")))


def run(epochs=50, trials=None):
    WEIGHTS.mkdir(parents=True, exist_ok=True)
    RESULTS.mkdir(parents=True, exist_ok=True)
    d = get_data()
    df, splits = load_split()
    cat_cols, num_cols = get_columns(df)
    print("Shared split:", {k: len(v) for k, v in splits.items()}, flush=True)
    candidates, best, best_ap = [], None, -1
    for latent_dim, noise in (trials or TRIALS):
        trial = train_trial(d, latent_dim, noise, epochs)
        candidates.append(trial["summary"])
        score = max(trial["summary"]["frozen_val_ap"], trial["summary"]["finetuned_val_ap"])
        print(trial["summary"], flush=True)
        if score > best_ap:
            best, best_ap = trial, score
    pd.DataFrame(candidates).to_csv(RESULTS / "tuning.csv", index=False)
    chosen_stage = "finetuned" if best["summary"]["finetuned_val_ap"] >= best["summary"]["frozen_val_ap"] else "frozen"
    selected = best[chosen_stage]

    # Freeze all choices before looking at the test set.
    rows, test_scores = [], {}
    for stage in ["frozen", "finetuned"]:
        model = best[stage]
        val_s = predict(model, d["X_val"]).ravel()
        test_s = predict(model, d["X_test"]).ravel()
        metrics = evaluate_scores(f"ae1_{stage}", d["id_val"], d["y_val"], val_s,
                                  d["id_test"], d["y_test"], test_s)
        metrics["test_accuracy"] = float(accuracy_score(d["y_test"], test_s >= metrics["threshold"]))
        rows.append({"model": stage, **metrics})
        test_scores[stage] = test_s
        model.save(WEIGHTS / f"{stage}.keras")
    table = pd.DataFrame(rows)
    table.to_csv(RESULTS / "comparison.csv", index=False)
    chosen_metrics = next(r for r in rows if r["model"] == chosen_stage)
    selected.save(WEIGHTS / "model.keras")
    selected.save(WEIGHTS / "model.h5")  # legacy format requested by the assignment
    # Restore pretrained encoder in the reconstruction model: fine-tuning shares its encoder.
    shared_encoder = best["autoencoder"].get_layer("encoder")
    finetuned_weights = shared_encoder.get_weights()
    shared_encoder.set_weights(best["pretrained_weights"])
    best["autoencoder"].save(WEIGHTS / "denoising_autoencoder.keras")
    shared_encoder.set_weights(finetuned_weights)
    joblib.dump(d["preprocessor"], WEIGHTS / "preprocessor.joblib")

    # Extra model with a true 2-unit bottleneck, trained without labels.
    reset_seed()
    ae2d, encoder2d = build_autoencoder(d["X_train"].shape[1], 2, best["summary"]["noise_std"])
    fit_autoencoder(ae2d, d, epochs)
    encoder2d.save(WEIGHTS / "encoder_2d.keras")
    ae2d.save(WEIGHTS / "autoencoder_2d.keras")
    z = predict(encoder2d, d["X_test"])
    np.savez(RESULTS / "latent_2d.npz", row_ids=d["id_test"], y=d["y_test"], latent=z)
    fig, ax = plt.subplots(figsize=(9, 6))
    for label, name, color in [(0, "No", COLORS[0]), (1, "Yes", COLORS[1])]:
        mask = d["y_test"] == label
        ax.scatter(z[mask, 0], z[mask, 1], s=12, alpha=.35 if label == 0 else .7, color=color, label=name, rasterized=True)
    ax.set(title="AE1: 2D latent space (held-out test customers)", xlabel="Latent unit 1", ylabel="Latent unit 2")
    ax.legend(title="Subscribed?")
    ax.grid(alpha=.15)
    fig.tight_layout()
    fig.savefig(RESULTS / "latent_space_2d.png", dpi=170)
    plt.close(fig)
    plot_curves(d, test_scores, best["histories"])
    threshold = chosen_metrics["threshold"]
    pred = test_scores[chosen_stage] >= threshold
    ConfusionMatrixDisplay.from_predictions(d["y_test"], pred, display_labels=["No", "Yes"], cmap="Blues")
    plt.title(f"AE1 {chosen_stage}: validation F1 threshold {threshold:.3f}")
    plt.tight_layout()
    plt.savefig(RESULTS / "confusion_matrix.png", dpi=150)
    plt.close()
    report = classification_report(d["y_test"], pred, target_names=["No", "Yes"], output_dict=True, zero_division=0)
    (RESULTS / "classification_report.json").write_text(json.dumps(report, indent=2))
    (RESULTS / "history.json").write_text(json.dumps(best["histories"], indent=2))
    import hashlib
    meta = {"name": f"AE1 Denoising Encoder + Classifier ({chosen_stage})",
            "dataset": "UCI Bank Marketing / bank-additional-full (cleaned)",
            "target": "term-deposit subscription (y=1 means yes)", "positive_class": "subscribe",
            "features": df.drop(columns="y").columns.tolist(), "numeric": num_cols,
            "categorical": cat_cols, "seed": SEED, "selected_stage": chosen_stage,
            "selection_metric": "validation average precision", "config": best["summary"],
            "test_auc": chosen_metrics["test_roc_auc"], "metrics": chosen_metrics,
            "split_sizes": {k: len(v) for k, v in splits.items()},
            "data_sha256": hashlib.sha256(Path("data/bank_clean.csv").read_bytes()).hexdigest(),
            "duration_used": False, "tensorflow_version": tf.__version__,
            "sklearn_version": __import__("sklearn").__version__,
            "probability_note": "Class-weighted scores are not calibrated probabilities.",
            "simulation_note": "Non-subscription is not measured customer attrition. Conversation effects are simulated."}
    (WEIGHTS / "meta.json").write_text(json.dumps(meta, indent=2))
    export_browser(selected, d["preprocessor"], meta)
    print(table.to_string(index=False), flush=True)
    print("Selected on validation:", chosen_stage, flush=True)
    return table


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=50)
    args = parser.parse_args()
    run(epochs=args.epochs)
