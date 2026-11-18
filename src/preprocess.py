"""Shared data preparation for all five notebooks.

Input: data/bank_clean.csv (saved by the EDA notebook).

Every notebook gets the SAME train / validation / test rows, in the same order:
    get_data()            -> dense inputs: scaled numeric + one-hot categories
    get_embedding_data()  -> embedding inputs: scaled numeric + one integer-ID array per categorical column

Rows are identified by their row number in bank_clean.csv (`id_train`, `id_val`, `id_test`).
"""
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.utils.class_weight import compute_class_weight

CLEAN_PATH = "data/bank_clean.csv"
TARGET = "y"
SEED = 42
SPLIT_SIZES = {"train": 0.70, "val": 0.15, "test": 0.15}
UNSEEN_ID = 0          # embedding ID for categories not seen in train


# ---------- loading and split ----------
def load_split(path=CLEAN_PATH):
    """Load the clean data and split it about 70/15/15.

    Rows with identical feature values (ignoring y) form one group, and a whole group always goes
    to the same split, so the same feature profile never appears in two splits. Groups are shuffled
    with a fixed seed, separately for groups with and without a "yes" (keeps the "yes" rate similar).

    Returns (df, splits) with splits = {"train": row_ids, "val": row_ids, "test": row_ids} (sorted).
    """
    df = pd.read_csv(path)
    features = df.drop(columns=TARGET)
    group = features.groupby(list(features.columns), sort=True, dropna=False).ngroup().to_numpy()

    groups = pd.DataFrame({"group": group, "y": df[TARGET]}).groupby("group")["y"].agg(["size", "max"])
    rng = np.random.RandomState(SEED)
    group_split = {}
    for _, stratum in groups.groupby("max"):                       # groups without / with a "yes"
        order = rng.permutation(stratum.index.to_numpy())
        share = stratum.loc[order, "size"].cumsum().to_numpy() / stratum["size"].sum()
        names = np.where(share <= SPLIT_SIZES["train"], "train",
                         np.where(share <= SPLIT_SIZES["train"] + SPLIT_SIZES["val"], "val", "test"))
        group_split.update(zip(order, names))

    row_split = pd.Series(group).map(group_split).to_numpy()
    splits = {name: np.flatnonzero(row_split == name) for name in SPLIT_SIZES}
    return df, splits


def get_columns(df):
    """Categorical (text) and numeric feature columns."""
    X = df.drop(columns=TARGET)
    return X.select_dtypes(exclude="number").columns.tolist(), X.select_dtypes("number").columns.tolist()


def _labels_and_ids(df, splits):
    out = {}
    for name, ids in splits.items():
        out[f"y_{name}"] = df[TARGET].to_numpy()[ids]
        out[f"id_{name}"] = ids
    return out


# ---------- dense inputs (ANN 1, ANN 3, AE 1, AE 2) ----------
def get_data(path=CLEAN_PATH):
    """Scaled numeric + one-hot categories. Scaler and encoder are fitted on train only."""
    df, splits = load_split(path)
    cat_cols, num_cols = get_columns(df)
    X = df.drop(columns=TARGET)

    preprocessor = ColumnTransformer([
        ("num", StandardScaler(), num_cols),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat_cols),  # unseen -> all zeros
    ]).fit(X.iloc[splits["train"]])

    data = {f"X_{name}": preprocessor.transform(X.iloc[ids]).astype("float32") for name, ids in splits.items()}
    data.update(_labels_and_ids(df, splits))
    data["preprocessor"] = preprocessor
    data["feature_names"] = preprocessor.get_feature_names_out().tolist()
    return data


# ---------- embedding inputs (ANN 2) ----------
def fit_category_ids(X_train, cat_cols):
    """Category -> integer ID, learned from train. IDs start at 1; 0 is reserved for unseen categories."""
    return {col: {cat: i + 1 for i, cat in enumerate(sorted(X_train[col].unique()))} for col in cat_cols}


def encode_embedding(X, scaler, category_ids, num_cols):
    """Raw feature rows -> {"numeric": float32 (n, n_num), "<cat column>": int32 (n,), ...}."""
    inputs = {"numeric": scaler.transform(X[num_cols]).astype("float32")}
    for col, mapping in category_ids.items():
        inputs[col] = X[col].map(mapping).fillna(UNSEEN_ID).astype("int32").to_numpy()
    return inputs


def get_embedding_data(path=CLEAN_PATH):
    """Scaled numeric array + one integer-ID array per categorical column (same rows as get_data)."""
    df, splits = load_split(path)
    cat_cols, num_cols = get_columns(df)
    X = df.drop(columns=TARGET)
    X_train = X.iloc[splits["train"]]

    scaler = StandardScaler().fit(X_train[num_cols])
    category_ids = fit_category_ids(X_train, cat_cols)

    data = {f"X_{name}": encode_embedding(X.iloc[ids], scaler, category_ids, num_cols)
            for name, ids in splits.items()}
    data.update(_labels_and_ids(df, splits))
    data.update({
        "scaler": scaler,
        "category_ids": category_ids,
        "vocab_sizes": {col: len(m) + 1 for col, m in category_ids.items()},   # +1 for the unseen ID
        "num_cols": num_cols,
        "cat_cols": cat_cols,
    })
    return data


def get_class_weights(y):
    """Errors on the rare "yes" class (11%) cost more during training."""
    w = compute_class_weight("balanced", classes=np.array([0, 1]), y=y)
    return {0: float(w[0]), 1: float(w[1])}
