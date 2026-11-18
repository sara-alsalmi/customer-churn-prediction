# Customer Response Prediction — UCI Bank Marketing

An end-to-end deep learning pipeline that predicts whether a bank client will subscribe to a term deposit after a direct marketing call. The model ranks clients by their likelihood to respond, so marketing calls can be focused where they matter most.

**Dataset:** [UCI Bank Marketing](https://archive.ics.uci.edu/dataset/222/bank+marketing) (`bank-additional-full.csv`): 41,188 calls, 20 features, binary target `y` (≈11% positive).

## Project Structure

```
customer-churn-prediction/
├── Bank_Marketing_EDA_Preprocessing.ipynb
├── data/
│   └── bank_clean.csv
├── src/
│   ├── preprocess.py
│   ├── models.py
│   ├── train.py
│   └── evaluate.py
└── README.md
```

| Path | Description |
|---|---|
| `Bank_Marketing_EDA_Preprocessing.ipynb` | Data loading, exploratory data analysis, cleaning and feature preparation. Produces `data/bank_clean.csv`. |
| `data/bank_clean.csv` | Cleaned dataset: duplicates removed, `previously_contacted` feature added, `duration` excluded (target leakage), target encoded as 0/1. |
| `src/preprocess.py` | Stratified train / validation / test split (70/15/15), one-hot encoding and standard scaling fitted on the training set only, and class weights for the imbalanced target. |
| `src/models.py` | Model architectures: a configurable ANN (L2, Dropout, BatchNorm), an autoencoder, and an encoder-based classifier. |
| `src/train.py` | Trains the models and saves each trained model (`.keras`), its weights (`.weights.h5`) and its training history. |
| `src/evaluate.py` | Compares the trained models on the validation and test sets (PR-AUC, ROC-AUC, F1, precision, recall) and generates learning curves and ROC / precision-recall plots. |
