"""Build the existing desk's portable browser edition from trained AE1 artifacts."""
from pathlib import Path
import importlib
import json
import random
import shutil

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DESK = ROOT / "deployment/churn-desk"
WEB = DESK / "web"
ART = ROOT / "weights/AE1_Learned_Features"


def build():
    import sys
    sys.path.insert(0, str(ROOT))
    engine = importlib.import_module("deployment.churn-desk.app.engine")
    customers = importlib.import_module("deployment.churn-desk.app.customers")
    service = importlib.import_module("deployment.churn-desk.app.model_service")
    model = service.ChurnModel()
    bank = customers.CustomerBank(model)
    rng = random.Random(42)
    records, seen = [], set()
    for _ in range(1000):
        c = bank.draw(rng)
        if c.row_index in seen:
            continue
        seen.add(c.row_index)
        records.append({"customer": c.public(), "row": c.row,
                        "actual": {"y": c.actual_y, "row_index": c.row_index},
                        "expected_subscription_score": float(1-model.predict(c.row))})
        if len(records) >= 120:
            break
    data = WEB / "data"
    data.mkdir(exist_ok=True)
    shutil.copyfile(ART / "browser_model.json", data / "model.json")
    (data / "customers.json").write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")))
    keys = ["SIGNALS", "SIGNAL_AR", "GREET", "POLITE", "EMPATHY", "LISTEN", "SOLUTION", "PRESSURE", "RUDE",
            "SHORT_COLD", "OPEN", "ANGRY", "PRESSURED", "SOFTEN", "ASKED", "INTERESTED", "NEUTRAL", "VAGUE", "WIN", "LOSE"]
    rules = {key: sorted(getattr(engine, key)) if isinstance(getattr(engine, key), set) else getattr(engine, key) for key in keys}
    rules["SCENARIOS"] = customers.SCENARIOS
    (data / "rules.json").write_text(json.dumps(rules, ensure_ascii=False))
    plots = WEB / "artifacts"
    plots.mkdir(exist_ok=True)
    for name in ["learning_curves.png", "latent_space_2d.png", "test_curves.png", "confusion_matrix.png"]:
        shutil.copyfile(ROOT / "results/ae1" / name, plots / name)
    meta = model.meta
    comparison = pd.read_csv(ROOT / "results/ae1/comparison.csv")
    metrics = comparison[["model", "val_avg_precision", "test_avg_precision", "test_roc_auc", "test_precision", "test_recall", "test_f1"]]
    html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AE1 — Learned Features</title><style>
*{box-sizing:border-box}body{margin:0;background:#101324;color:#eef1ff;font:17px/1.65 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:44px 24px}a{color:#a9b9ff}h1{font-size:clamp(32px,5vw,58px);line-height:1.1}h2{margin-top:48px}p{max-width:850px}.tag{color:#9dacf4;letter-spacing:2px;font-size:14px}img{width:100%;height:auto;background:white;border-radius:14px;margin:15px 0}table{border-collapse:collapse;font-size:15px;min-width:750px}td,th{padding:12px;border-bottom:1px solid #38405a;text-align:left}.table-wrap{overflow:auto}.note{border-left:4px solid #ff9c6c;padding:12px 20px;background:#1e2339}.stats{display:flex;gap:32px;flex-wrap:wrap}.stats b{display:block;font-size:32px;color:#bac5ff}code{color:#b8c7ff}</style>
<main><a href="/">مكتب رصين · Back to the desk</a><p class="tag">UNIT 6 · AE 1 · UCI BANK MARKETING</p>
<h1>Learn the features.<br>Then learn the response.</h1>
<p>Denoising autoencoder → frozen encoder + classifier → fine-tuning. A separate 2-unit encoder reveals the held-out customers in a true 2D latent space.</p>
<p class="note">This is the second dataset under Customer Churn in the assignment. Its actual target is term-deposit subscription, not measured customer attrition. The desk's changing conversation score is an educational simulation. The class-weighted model scores are not calibrated probabilities.</p>'''
    html += f'<div class="stats"><div><b>{meta["test_auc"]:.3f}</b>Test ROC-AUC</div><div><b>{meta["metrics"]["test_avg_precision"]:.3f}</b>Test average precision</div><div><b>{meta["split_sizes"]["test"]:,}</b>Held-out test rows</div></div>'
    html += f'<p>Selected using validation average precision: <strong>{meta["selected_stage"]}</strong>. Latent size {meta["config"]["latent_dim"]}, Gaussian noise {meta["config"]["noise_std"]}. The threshold maximizes validation F1. Identical feature profiles stay in the same split; preprocessing is fitted on training rows only. <code>duration</code> is excluded.</p>'
    html += '<h2>Frozen vs. fine-tuned</h2><div class="table-wrap">'+metrics.round(4).to_html(index=False,border=0)+'</div>'
    html += '<h2>Two latent units. No / yes colors.</h2><p>A separate unsupervised autoencoder, plotted on test rows only. Colors show the observed subscription outcome. Class overlap is expected: reconstruction does not optimize class separation.</p><img src="/static/artifacts/latent_space_2d.png" alt="True two-dimensional latent space, no customers in blue and yes in orange">'
    html += '<h2>Learning and evaluation</h2><img src="/static/artifacts/learning_curves.png" alt="Learning curves for denoising, frozen classification and fine-tuning"><img src="/static/artifacts/test_curves.png" alt="Held-out ROC and precision-recall curves"><img src="/static/artifacts/confusion_matrix.png" alt="Final held-out confusion matrix">'
    html += '<h2>What this demonstrates</h2><p>The encoder learns a compact representation without labels; the classifier then uses labels to separate yes from no. Fine-tuning adapts that representation. Validation chooses the configuration and threshold; test metrics are reported after those choices. The group-safe random split supports team comparison, but it does not measure future-time generalization.</p>'
    html += '<p>The call simulator keeps the AE1 base score fixed for each customer. Dialogue changes only the labeled simulation layer. Names and call reasons are fictional; features come from public dataset rows.</p><p><a href="https://github.com/sara-alsalmi/customer-churn-prediction">Project repository</a> · <a href="https://archive.ics.uci.edu/dataset/222/bank+marketing">UCI source</a> — Moro, Rita &amp; Cortez (2014), CC BY 4.0.</p></main></html>'
    (WEB / "results.html").write_text(html)
    dist = DESK / "dist"
    if dist.exists():
        shutil.rmtree(dist)
    shutil.copytree(WEB, dist / "static")
    index = (WEB / "index.html").read_text().replace('<script type="module"', '<script>window.CHURN_DESK_LOCAL=true;</script>\n<script type="module"')
    (dist / "index.html").write_text(index)
    shutil.copyfile(WEB / "results.html", dist / "results.html")
    print(f"Built {dist}; {len(records)} held-out public customer profiles; AE1 {meta['selected_stage']}")


if __name__ == "__main__":
    build()
