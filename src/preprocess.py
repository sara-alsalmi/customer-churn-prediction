"""Prepare the cleaned data for training: split, encode, scale.

Input: data/bank_clean.csv (saved by the EDA notebook).
"""
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.utils.class_weight import compute_class_weight

CLEAN_PATH = "data/bank_clean.csv"
TARGET = "y"
SEED = 42


def get_data(path=CLEAN_PATH):
    """Load the clean data, split 70/15/15 and encode/scale it (fit on train only)."""
    df = pd.read_csv(path)
    X, y = df.drop(columns=TARGET), df[TARGET].values

    # stratified split: same yes/no ratio in train, validation and test; fixed seed = same rows for everyone
    X_train, X_tmp, y_train, y_tmp = train_test_split(X, y, test_size=0.30, stratify=y, random_state=SEED)
    X_val, X_test, y_val, y_test = train_test_split(X_tmp, y_tmp, test_size=0.50, stratify=y_tmp, random_state=SEED)

    # one-hot encode text columns, scale numeric columns
    cat_cols = X.select_dtypes(exclude="number").columns.tolist()
    num_cols = X.select_dtypes("number").columns.tolist()
    preprocessor = ColumnTransformer([
        ("num", StandardScaler(), num_cols),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat_cols),
    ]).fit(X_train)                                   # fit on train only (no leakage)

    return {
        "X_train": preprocessor.transform(X_train).astype("float32"),
        "X_val": preprocessor.transform(X_val).astype("float32"),
        "X_test": preprocessor.transform(X_test).astype("float32"),
        "y_train": y_train, "y_val": y_val, "y_test": y_test,
        "preprocessor": preprocessor,
    }


def get_class_weights(y):
    """Errors on the rare "yes" class (11%) cost more during training."""
    w = compute_class_weight("balanced", classes=np.array([0, 1]), y=y)
    return {0: float(w[0]), 1: float(w[1])}
