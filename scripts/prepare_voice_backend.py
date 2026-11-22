"""Export the finite customer dialogue catalog allowed by the public voice service."""
import ast
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def literals(path):
    result = {}
    for node in ast.parse(path.read_text()).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            try:
                result[node.targets[0].id] = ast.literal_eval(node.value)
            except (ValueError, TypeError):
                pass
    return result


def build():
    rules = literals(ROOT / "deployment/churn-desk/app/engine.py")
    phrases = {"مرحباً، هذا اختبار صوت مكتب رصين باستخدام إلفن لابز."}
    for name in ["ANGRY", "PRESSURED", "SOFTEN", "INTERESTED", "NEUTRAL", "VAGUE", "WIN", "LOSE"]:
        phrases.update(rules[name])
    phrases.update(rules["ASKED"].values())
    fallback = "وش يضمن لي؟ وضّح لي الشروط."
    phrases.add(fallback)
    endings = [*rules["INTERESTED"], fallback]
    for left in rules["SOFTEN"]:
        for right in [*rules["ASKED"].values(), *endings]:
            phrases.add(left + " " + right)
    for left in rules["ASKED"].values():
        for right in endings:
            phrases.add(left + " " + right)
    with (ROOT / "data/bank_clean.csv").open() as stream:
        campaigns = sorted({row["campaign"] for row in csv.DictReader(stream)})
    for lines in rules["OPEN"].values():
        phrases.update(lines)
    gendered = {"tired": ["تعبان", "تعبانة"], "متصل": ["متصل", "متصلة"], "مقتنع": ["مقتنع", "مقتنعة"],
                "متردد": ["متردد", "مترددة"], "ميّال": ["ميّال", "ميّالة"]}
    catalog = set()
    for phrase in phrases:
        for gender in [0, 1]:
            for campaign in campaigns if "{campaign}" in phrase else ["1"]:
                values = {k: v[gender] for k, v in gendered.items()}
                values["campaign"] = campaign
                catalog.add(" ".join(phrase.format(**values).split()))
    target = ROOT / "deployment/voice-backend/worker/speech-catalog.json"
    target.write_text(json.dumps(sorted(catalog), ensure_ascii=False, indent=2) + "\n")
    print(f"Exported {len(catalog)} approved customer phrases")


if __name__ == "__main__":
    build()
