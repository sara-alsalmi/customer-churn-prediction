"""Train the 3 ANN models and the 2 autoencoder models.

Usage (from the project folder):
    python -m src.train                    # all 5 models
    python -m src.train --model tuned      # one model

Needs: pip install keras-tuner
Saves:  models/<name>.keras, models/<name>.weights.h5, results/<name>_history.json
"""
import argparse
import json
import os

import joblib
import keras
import keras_tuner as kt

from src.models import build_ann, build_autoencoder, build_encoder_classifier
from src.preprocess import SEED, get_class_weights, get_data

EPOCHS = 100
BATCH_SIZE = 256

# Settings of the 2 fixed ANN models
ANN_CONFIGS = {
    "plain":       dict(hidden_units=[64, 32], dropout=0.0, l2=0.0, batchnorm=False),   # no regularization
    "regularized": dict(hidden_units=[64, 32], dropout=0.3, l2=1e-3, batchnorm=True),   # L2 + Dropout + BatchNorm
}

# Search space for the tuned ANN
SEARCH_SPACE = dict(n_layers=[1, 2, 3], units=[32, 64, 128], dropout=[0.1, 0.2, 0.3, 0.4, 0.5],
                    l2=[1e-4, 1e-3, 1e-2], learning_rate=[1e-3, 3e-4])
TUNER_TRIALS = 15

MODELS = ["plain", "regularized", "tuned", "ae_classifier", "ae_anomaly"]


def early_stopping(monitor="val_pr_auc", mode="max"):
    """Stop when the validation score stops improving and keep the best weights."""
    return keras.callbacks.EarlyStopping(monitor=monitor, mode=mode, patience=10, restore_best_weights=True)


def fit(model, d, callbacks):
    """Train a classifier with class weights; validate on the validation set."""
    return model.fit(d["X_train"], d["y_train"], validation_data=(d["X_val"], d["y_val"]),
                     epochs=EPOCHS, batch_size=BATCH_SIZE, class_weight=get_class_weights(d["y_train"]),
                     callbacks=callbacks, verbose=0)


# ---------- ANN 1 & 2 ----------
def train_ann(name, d):
    model = build_ann(d["X_train"].shape[1], **ANN_CONFIGS[name])
    callbacks = [] if name == "plain" else [early_stopping()]   # plain model trains all epochs
    return model, fit(model, d, callbacks).history


# ---------- ANN 3: Keras Tuner ----------
def train_tuned(d):
    n = d["X_train"].shape[1]

    def build(hp):
        units = hp.Choice("units", SEARCH_SPACE["units"])
        n_layers = hp.Choice("n_layers", SEARCH_SPACE["n_layers"])
        return build_ann(n, [max(units // 2 ** i, 16) for i in range(n_layers)],   # e.g. 128 -> 64 -> 32
                         dropout=hp.Choice("dropout", SEARCH_SPACE["dropout"]),
                         l2=hp.Choice("l2", SEARCH_SPACE["l2"]), batchnorm=True,
                         learning_rate=hp.Choice("learning_rate", SEARCH_SPACE["learning_rate"]))

    tuner = kt.RandomSearch(build, objective=kt.Objective("val_pr_auc", direction="max"),
                            max_trials=TUNER_TRIALS, seed=SEED, directory="tuner_logs",
                            project_name="ann", overwrite=True)
    tuner.search(d["X_train"], d["y_train"], validation_data=(d["X_val"], d["y_val"]),
                 epochs=EPOCHS, batch_size=BATCH_SIZE, class_weight=get_class_weights(d["y_train"]),
                 callbacks=[early_stopping()], verbose=0)

    best_hp = tuner.get_best_hyperparameters(1)[0]
    print("  best hyperparameters:", best_hp.values)
    keras.utils.set_random_seed(SEED)
    model = build(best_hp)                          # retrain the best settings from scratch
    return model, fit(model, d, [early_stopping()]).history


# ---------- Autoencoder 1: pretraining + classifier ----------
def train_ae_classifier(d):
    n = d["X_train"].shape[1]
    autoencoder, encoder = build_autoencoder(n)
    # step 1: learn to rebuild the inputs (no labels)
    autoencoder.fit(d["X_train"], d["X_train"], validation_data=(d["X_val"], d["X_val"]),
                    epochs=EPOCHS, batch_size=BATCH_SIZE, verbose=0,
                    callbacks=[early_stopping("val_loss", "min")])
    # step 2: use the trained encoder + a classifier head
    model = build_encoder_classifier(encoder, n)
    return model, fit(model, d, [early_stopping()]).history


# ---------- Autoencoder 2: anomaly detection ----------
def train_ae_anomaly(d):
    # train only on "no" clients -> "yes" clients are harder to rebuild (higher error)
    X_no_train = d["X_train"][d["y_train"] == 0]
    X_no_val = d["X_val"][d["y_val"] == 0]
    autoencoder, _ = build_autoencoder(d["X_train"].shape[1])
    history = autoencoder.fit(X_no_train, X_no_train, validation_data=(X_no_val, X_no_val),
                              epochs=EPOCHS, batch_size=BATCH_SIZE, verbose=0,
                              callbacks=[early_stopping("val_loss", "min")])
    return autoencoder, history.history


def train(names):
    os.makedirs("models", exist_ok=True)
    os.makedirs("results", exist_ok=True)
    d = get_data()
    joblib.dump(d["preprocessor"], "models/preprocessor.joblib")

    for name in names:
        print(f"Training {name} ...")
        keras.utils.set_random_seed(SEED)
        if name in ANN_CONFIGS:
            model, history = train_ann(name, d)
        else:
            model, history = {"tuned": train_tuned, "ae_classifier": train_ae_classifier,
                              "ae_anomaly": train_ae_anomaly}[name](d)

        model.save(f"models/{name}.keras")                  # full model
        model.save_weights(f"models/{name}.weights.h5")     # weights only
        with open(f"results/{name}_history.json", "w") as f:
            json.dump({k: [float(v) for v in vals] for k, vals in history.items()}, f)
        print(f"  saved models/{name}.keras + .weights.h5 ({len(history['loss'])} epochs)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="all", choices=MODELS + ["all"])
    args = parser.parse_args()
    train(MODELS if args.model == "all" else [args.model])
