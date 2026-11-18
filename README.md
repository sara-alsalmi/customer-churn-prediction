# Customer Response Prediction — UCI Bank Marketing

Predict whether a bank customer will subscribe to a term deposit (`y`), using the [UCI Bank Marketing](https://archive.ics.uci.edu/dataset/222/bank+marketing) dataset (`bank-additional-full.csv`, ≈11% "yes").

## Repo Structure

```
customer-churn-prediction/
├── Bank_Marketing_EDA_Preprocessing.ipynb
├── data/
│   └── bank_clean.csv
└── src/
    ├── preprocess.py
    └── evaluate.py
```

| File | Purpose |
|---|---|
| `Bank_Marketing_EDA_Preprocessing.ipynb` | Loads the raw data, explores and cleans it, and saves `bank_clean.csv` |
| `data/bank_clean.csv` | Cleaned dataset used by every model (`duration` removed to avoid leakage) |
| `src/preprocess.py` | Shared train / validation / test split and model inputs, fitted on train only |
| `src/evaluate.py` | Shared evaluation: checks scores against the split and compares all models |

## Model Plan

| # | Role | Description | Notebook |
|---|---|---|---|
| 1 | ANN Regularization | Same network trained with no regularization, then L2, Dropout, BatchNorm and Early Stopping, to compare their effect | Pending |
| 2 | ANN Entity Embeddings | Multi-input ANN with one Embedding layer per categorical column | Pending |
| 3 | ANN Tuning & Class Imbalance | Keras Tuner search; class weights vs. focal loss | Pending |
| 4 | Denoising Autoencoder + Classifier | Denoising autoencoder, then its encoder + a classifier, fine-tuned | Pending |
| 5 | Autoencoder Anomaly Detection | Trained on "no" customers only; reconstruction error is the score | Pending |

## Workflow

1. **Load the shared split** from `src/preprocess.py`. Every notebook gets the same rows.
   - Role 2 (embeddings): `get_embedding_data()`
   - Roles 1, 3, 4, 5: `get_data()`
2. **Build and train** your model in your own Colab notebook.
3. **Pass your validation and test scores** to `evaluate_scores()` in `src/evaluate.py`. Then `python -m src.evaluate` builds the team comparison.

```python
!git clone https://github.com/sara-alsalmi/customer-churn-prediction.git
%cd customer-churn-prediction

from src.preprocess import get_data            # role 2: get_embedding_data
from src.evaluate import evaluate_scores

d = get_data()
# ... build and train your model ...
evaluate_scores("your_model", d["id_val"], d["y_val"], val_scores,
                d["id_test"], d["y_test"], test_scores)
```
