# The Call: Who Will Say Yes?

A bank in Portugal calls thousands of clients to sell a term deposit. Most of them say no. Only about **1 in 9** says yes.

So we asked: **can a model tell the bank who to call first?**

This is our Deep Learning final project. We built five models (3 neural networks and 2 autoencoders) to predict which clients will say yes, before the bank picks up the phone.

**Try it:** [Live demo](https://majed-codes.github.io/churn-desk-ae1/) · [Presentation](https://sara-alsalmi.github.io/customer-churn-prediction/)

## The Data

We used the [UCI Bank Marketing](https://archive.ics.uci.edu/dataset/222/bank+marketing) dataset: 41,188 phone calls from 2008 to 2010.

What we cleaned in [Bank_Marketing_EDA_Preprocessing.ipynb](Bank_Marketing_EDA_Preprocessing.ipynb):

- Removed 12 duplicate rows, which leaves 41,176 clients.
- Dropped `duration`, the length of the call. You only know it after the call ends, so keeping it would be cheating.
- Kept "unknown" values as their own category, because they are real answers.
- Turned `pdays = 999` ("never contacted before") into a separate yes/no column.

The clean file is [data/bank_clean.csv](data/bank_clean.csv). Every model starts from it.

## The Five Models

| Model | The idea | Notebook |
|---|---|---|
| **ANN 1** Regularization | The same network trained 5 ways (plain, L2, Dropout, BatchNorm, everything + Early Stopping) to see what each technique really does | [ANN1_Regularization.ipynb](ann1/ANN1_Regularization.ipynb) |
| **ANN 2** Entity Embeddings | Each category (job, month...) gets its own embedding layer instead of one-hot encoding | [ANN2.ipynb](ANN2.ipynb) |
| **ANN 3** Keras Tuner | Keras Tuner searches for the best network, then we compare class weights vs focal loss | [ANN3_Keras_Tuner.ipynb](ANN3_Keras_Tuner.ipynb) |
| **AE 1** Learned Features | A denoising autoencoder learns the features, then a classifier is trained on top (frozen, then fine-tuned) | [AE1_Learned_Features.ipynb](AE1_Learned_Features.ipynb) |
| **AE 2** Anomaly Detector | Trained only on clients who said no. A client it can't rebuild well is "unusual", so maybe a yes | [AE2_Anomaly_Detector.ipynb](AE2_Anomaly_Detector.ipynb) |

What every model does:

- Splits the data 70 / 15 / 15 into train, validation and test.
- Fits the encoders and scalers on the training data only.
- Handles the imbalance, because only 11% said yes.
- Uses validation to choose settings, and the test set only once at the end.

## Results

Only 11% of clients say yes, so accuracy is misleading: a model that always says "no" is already 88.7% accurate. That's why we judge the models mainly on **PR-AUC**. A random guess scores 0.113.

| Model | PR-AUC | Recall | ROC-AUC |
|---|---:|---:|---:|
| **ANN 3** Keras Tuner ⭐ | **0.481** | **0.664** | 0.815 |
| ANN 2 Entity Embeddings | 0.480 | 0.654 | n/a |
| AE 1 Learned Features | 0.436 | 0.513 | 0.784 |
| ANN 1 Regularization | 0.430 | 0.539 | 0.766 |
| AE 2 Anomaly Detector | 0.288 | 0.550 | 0.716 |

These are test-set results, each one from its own notebook.

What we learned:

- **ANN 3 is our best model.** It finds 462 of the 696 clients who said yes, and ANN 2 is right behind it.
- **Handling the imbalance matters more than the network size.** Small networks did just as well as big ones.
- **Regularization helps.** Without it, the networks overfit: training keeps improving while validation gets worse.
- **The anomaly detector is the weakest.** Many clients who say yes look just like clients who say no.

Limitations:

- The model ranks clients; it doesn't make anyone say yes.
- The data is from 2008 to 2010, so the model would need to be checked again on new calls.
- The scores are not calibrated probabilities.

## Demo

**[Open the live demo](https://majed-codes.github.io/churn-desk-ae1/)** (no account needed).

It's an Arabic call-center desk: you answer calls from real clients in the test set, and the model shows how likely each one is to say no. The names and call stories are made up; the client data is real.

The code is in [deployment/churn-desk](deployment/churn-desk/README.md). It has a FastAPI app and a browser version.

The public demo uses [ElevenLabs speech and Arabic transcription](deployment/voice-backend/README.md) through a hosted backend. API credentials stay on the server; visitors need no account or key. The app falls back to browser speech if the voice service is unavailable.

## Presentation

**[Open the presentation](https://sara-alsalmi.github.io/customer-churn-prediction/)** in your browser.

Use the arrow keys or the ← → buttons to move, and press F for full screen. The last slide has a button that opens the live demo.

The file is [Churn_Presentation/index.html](Churn_Presentation/index.html). You can also download it and open it offline.

## Run It Yourself

1. Open any notebook in Google Colab.
2. Run the cells from the top.
   - ANN 2, ANN 3 and AE 2 ask you to upload `data/bank_clean.csv`.
   - ANN 1 and AE 1 download the repo by themselves.
3. The notebooks save their trained model, then load it again to make a prediction.

Saved models are in [weights/](weights/) and [ann1/models/](ann1/models/).

## Repo Map

```
├── Bank_Marketing_EDA_Preprocessing.ipynb   data exploration and cleaning
├── ann1/ANN1_Regularization.ipynb           ANN 1
├── ANN2.ipynb                               ANN 2
├── ANN3_Keras_Tuner.ipynb                   ANN 3
├── AE1_Learned_Features.ipynb               AE 1
├── AE2_Anomaly_Detector.ipynb               AE 2
├── data/bank_clean.csv                      the clean data
├── weights/                                 saved models
├── results/                                 plots and scores
├── src/                                     shared helper code (used by ANN 1 and AE 1)
├── deployment/churn-desk/                   the demo app
└── Churn_Presentation/                the final presentation
```

## Team

Shaden · Sara · Majed · Khalid · Lujain

Data: [UCI Bank Marketing](https://archive.ics.uci.edu/dataset/222/bank+marketing), Moro, Rita & Cortez (2014), CC BY 4.0.
