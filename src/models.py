"""Model architectures: ANN and autoencoder."""
import keras
from keras import layers, regularizers


def get_metrics():
    return [keras.metrics.AUC(curve="PR", name="pr_auc"), keras.metrics.AUC(name="roc_auc")]


def build_ann(n_features, hidden_units, dropout=0.0, l2=0.0, batchnorm=False, learning_rate=1e-3):
    """ANN for binary classification. Regularization is optional."""
    reg = regularizers.l2(l2) if l2 else None                  # L2 weight penalty
    model = keras.Sequential([keras.Input(shape=(n_features,))])
    for units in hidden_units:
        model.add(layers.Dense(units, kernel_regularizer=reg))
        if batchnorm:
            model.add(layers.BatchNormalization())
        model.add(layers.Activation("relu"))
        if dropout:
            model.add(layers.Dropout(dropout))                 # randomly turns off neurons
    model.add(layers.Dense(1, activation="sigmoid"))           # probability of "yes"
    model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                  loss="binary_crossentropy", metrics=get_metrics())
    return model


def build_autoencoder(n_features, units=(32, 16), learning_rate=1e-3):
    """Autoencoder: compress the input to a small code, then rebuild it."""
    inputs = keras.Input(shape=(n_features,))
    x = layers.Dense(units[0], activation="relu")(inputs)      # encoder
    code = layers.Dense(units[1], activation="relu")(x)        # bottleneck
    x = layers.Dense(units[0], activation="relu")(code)        # decoder
    outputs = layers.Dense(n_features)(x)                      # rebuilt input

    autoencoder = keras.Model(inputs, outputs, name="autoencoder")
    encoder = keras.Model(inputs, code, name="encoder")
    autoencoder.compile(optimizer=keras.optimizers.Adam(learning_rate), loss="mse")
    return autoencoder, encoder


def build_encoder_classifier(encoder, n_features, learning_rate=1e-3):
    """Pretrained encoder + small classifier head."""
    inputs = keras.Input(shape=(n_features,))
    x = encoder(inputs)
    x = layers.Dense(16, activation="relu", kernel_regularizer=regularizers.l2(1e-3))(x)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(1, activation="sigmoid")(x)
    model = keras.Model(inputs, outputs, name="ae_classifier")
    model.compile(optimizer=keras.optimizers.Adam(learning_rate),
                  loss="binary_crossentropy", metrics=get_metrics())
    return model
