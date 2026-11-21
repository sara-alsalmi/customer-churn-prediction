import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { predictSubscription, transform } from "../web/js/inference.js";
import { localApi } from "../web/js/local-api.js";

const dataDir = new URL("../web/data/", import.meta.url);
const model = JSON.parse(await fs.readFile(new URL("model.json", dataDir)));
const records = JSON.parse(await fs.readFile(new URL("customers.json", dataDir)));
globalThis.fetch = async (url) => {
  const name = String(url).split("/").at(-1);
  return {ok: true, json: async () => JSON.parse(await fs.readFile(new URL(name, dataDir)))};
};

test("browser inference matches the reloaded Keras model on every deployed customer", () => {
  assert.equal(model.meta.duration_used, false);
  let maxError = 0;
  for (const record of records) {
    const actual = predictSubscription(record.row, model);
    maxError = Math.max(maxError, Math.abs(actual - record.expected_subscription_score));
    assert.ok(Math.abs(actual - record.expected_subscription_score) < 1e-5);
  }
  console.log("Max browser/Keras score difference:", maxError);
});

test("unknown categories encode to zero, invalid numeric input fails", () => {
  const row = {...records[0].row, [model.categorical[0]]: "unseen-test-value"};
  const x = transform(row, model);
  assert.ok(x.slice(model.numeric.length, model.numeric.length + model.categories[0].length).every((v) => v === 0));
  assert.throws(() => transform({...row, age: "not-a-number"}, model), /Invalid feature/);
});

test("hosted simulator supports start, turn, report and ended-call validation", async () => {
  const config = await localApi("/api/config");
  assert.equal(config.model.duration_used, false);
  assert.equal(config.brain, "offline");
  const start = await localApi("/api/session", {});
  assert.ok(start.customer.profile.length);
  await assert.rejects(localApi(`/api/session/${start.session_id}/turn`, {text: " "}), /Empty reply/);
  const turn = await localApi(`/api/session/${start.session_id}/turn`, {
    text: "السلام عليكم، أعتذر وأفهم وضعك. وش اللي يزعجك؟ نقدر نساعدك بحل واضح بدون رسوم.", elapsed: 25,
  });
  assert.equal(turn.score.ann, start.score.ann);
  assert.equal(turn.score.duration_used_by_model, false);
  assert.ok(Number.isFinite(turn.score.final));
  const report = await localApi(`/api/session/${start.session_id}/end`, {elapsed: 40});
  assert.equal(report.turns, 1);
  assert.equal(report.transcript.length, 3);
  assert.ok(["yes", "no"].includes(report.actual.y));
  await assert.rejects(localApi(`/api/session/${start.session_id}/turn`, {text: "مرحبا"}), /Call ended/);
});
