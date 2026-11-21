// Exact exported Dense layers and train-fitted preprocessing. No external ML CDN.
export function transform(row, model) {
  const x = model.numeric.map((key, i) => {
    const value = Number(row[key]);
    if (row[key] == null || !Number.isFinite(value)) throw new Error(`Invalid feature: ${key}`);
    return Math.fround((value - model.mean[i]) / model.scale[i]);
  });
  model.categorical.forEach((key, i) => {
    if (row[key] == null) throw new Error(`Missing feature: ${key}`);
    for (const category of model.categories[i]) x.push(row[key] === category ? 1 : 0);
  });
  return x;
}

export function predictSubscription(row, model) {
  let x = transform(row, model);
  for (const layer of model.layers) {
    x = layer.bias.map((bias, j) => {
      let value = bias;
      for (let i = 0; i < layer.kernel.length; i++) value += x[i] * layer.kernel[i][j];
      if (layer.activation === "relu") return Math.max(0, value);
      if (layer.activation === "sigmoid") return 1 / (1 + Math.exp(-value));
      return value;
    });
  }
  return x[0];
}
