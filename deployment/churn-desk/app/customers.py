"""Real customers from the Bank Marketing data, dressed as callers.

Each call uses a held-out row from the team's cleaned Bank Marketing data. Only the name, gender and the
reason for the call are made up; every model feature is the row's own value.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parents[3] / "data" / "bank_clean.csv"

JOB_AR = {
    "admin.": "موظف إداري", "blue-collar": "عامل حرفي", "entrepreneur": "رائد أعمال",
    "housemaid": "عاملة منزلية", "management": "مدير", "retired": "متقاعد",
    "self-employed": "عمل حر", "services": "قطاع الخدمات", "student": "طالب",
    "technician": "فني", "unemployed": "بدون عمل", "unknown": "غير معروف",
}
JOB_AR_F = {"admin.": "موظفة إدارية", "blue-collar": "عاملة حرفية", "entrepreneur": "رائدة أعمال",
            "management": "مديرة", "retired": "متقاعدة", "student": "طالبة", "technician": "فنية"}
MARITAL_AR = {"married": "متزوج", "single": "أعزب", "divorced": "مطلّق"}
MARITAL_AR_F = {"married": "متزوجة", "single": "عزباء", "divorced": "مطلّقة"}
EDU_AR = {"primary": "ابتدائي", "secondary": "ثانوي", "tertiary": "جامعي", "unknown": "غير معروف"}
YES_AR = {"yes": "نعم", "no": "لا"}
CONTACT_AR = {"cellular": "جوال", "telephone": "هاتف ثابت", "unknown": "غير مسجّل"}
POUT_AR = {"success": "نجحت", "failure": "فشلت", "other": "أخرى", "unknown": "لا يوجد"}
MONTH_AR = {"jan": "يناير", "feb": "فبراير", "mar": "مارس", "apr": "أبريل", "may": "مايو", "jun": "يونيو",
            "jul": "يوليو", "aug": "أغسطس", "sep": "سبتمبر", "oct": "أكتوبر", "nov": "نوفمبر", "dec": "ديسمبر"}

MALE = ["عبدالله الحربي", "فهد العتيبي", "سلطان القحطاني", "خالد الشهري", "ماجد الدوسري",
        "تركي الزهراني", "نايف المطيري", "بندر الغامدي", "سعد العنزي", "عبدالعزيز السبيعي"]
FEMALE = ["نورة القحطاني", "سارة العتيبي", "ريم الشمري", "هيفاء الحربي", "منيرة الدوسري",
          "أمل الزهراني", "لمى المالكي", "جواهر السهلي"]

# Why the customer is calling. Picked from the row's own features.
SCENARIOS = {
    "too_many_calls": {
        "title": "منزعج من كثرة اتصالات البنك",
        "brief": "اتصل عليه البنك {campaign} مرات في هذه الحملة، وهو متضايق ويفكر يقفل حسابه.",
        "fix": "اعتذر عن الإزعاج والتزم بإيقاف الاتصالات التسويقية، ثم اسأله وش يناسبه.",
        "fix_words": ["نوقف", "ايقاف", "اوقف", "ما راح نتصل", "مارح نتصل", "ما نزعجك", "عدم الازعاج", "الوقت اللي يناسبك", "الاوقات اللي تناسبك", "رسائل بدل", "نشيل رقمك", "نلغي الاتصالات"],
    },
    "prev_failure": {
        "title": "تجربة سابقة سيئة مع عرض البنك",
        "brief": "سبق وتواصل معه البنك بعرض وما ضبط معه، وتجربته كانت سيئة.",
        "fix": "اعترف بالتجربة السابقة، واسأله وش اللي ما عجبه، ثم اعرض شيء مختلف يناسبه.",
        "fix_words": ["نعوضك", "تعويض", "عرض مختلف", "بدون شروط", "الشروط بوضوح", "كل الشروط", "اكتب لك الشروط", "مكتوب", "نصلح", "اتابع بنفسي"],
    },
    "loan_burden": {
        "title": "ضغط الأقساط الشهرية",
        "brief": "عليه {loans}، والأقساط ضاغطة عليه، وبنك ثاني عرض عليه نقل المديونية بنسبة أقل.",
        "fix": "افهم وضعه المالي، واعرض إعادة جدولة أو تخفيض نسبة، بدون ضغط.",
        "fix_words": ["جدوله", "اعاده جدوله", "تأجيل", "تاجيل", "قسط", "الاقساط", "نسبه اقل", "تخفيض", "نخفض", "نقل المديونيه"],
    },
    "fees": {
        "title": "رسوم تأكل الرصيد",
        "brief": "رصيده قليل ({balance} ريال) ويشوف رسوم الحساب تأكل اللي فيه.",
        "fix": "راجع الرسوم معه، واعرض إعفاء أو باقة بدون رسوم.",
        "fix_words": ["رسوم", "اعفاء", "نعفيك", "بدون رسوم", "مجاني", "مجانا", "نرجع لك", "استرداد", "نسترد"],
    },
    "competitor": {
        "title": "عرض أفضل من بنك منافس",
        "brief": "بنك منافس عرض عليه وديعة بعائد أعلى، ويفكر ينقل فلوسه.",
        "fix": "اعرض وديعة لأجل بعائد منافس واشرح ميزاتها بوضوح.",
        "fix_words": ["وديعه", "عائد", "ارباح", "نسبه", "عرض خاص", "مميز", "لاجل", "استثمار", "نطابق", "افضل من"],
    },
}


def pick_scenario(r: dict) -> str:
    if r["campaign"] >= 4:
        return "too_many_calls"
    if r["poutcome"] == "failure":
        return "prev_failure"
    if r["loan"] == "yes" or r["housing"] == "yes":
        return "loan_burden"
    return "competitor"


@dataclass
class Customer:
    row: dict
    actual_y: str
    row_index: int
    name: str
    gender: str  # "m" | "f"
    scenario: str
    profile_ar: dict = field(default_factory=dict)

    def g(self, m: str, f: str) -> str:
        return m if self.gender == "m" else f

    @property
    def first_name(self) -> str:
        return self.name.split()[0]

    def brief(self) -> str:
        s = SCENARIOS[self.scenario]
        loans = " و".join(x for x, on in [("قرض شخصي", self.row["loan"] == "yes"),
                                           ("تمويل سكني", self.row["housing"] == "yes")] if on) or "التزامات"
        return s["brief"].format(campaign=self.row["campaign"], balance=f"{self.row.get('balance', 0):,}", loans=loans)

    def public(self) -> dict:
        s = SCENARIOS[self.scenario]
        return {
            "name": self.name, "first_name": self.first_name, "gender": self.gender,
            "scenario": self.scenario, "scenario_title": s["title"], "brief": self.brief(),
            "profile": self.profile_ar, "row_index": self.row_index,
            "initials": "".join(p[0] for p in self.name.split()[:2]),
        }


class CustomerBank:
    """Picks real rows the model sees as at-risk but saveable."""

    def __init__(self, model):
        df = pd.read_csv(DATA)
        df = df.reset_index().rename(columns={"index": "row_index"})
        feats = model.features or [c for c in df.columns if c not in ("y", "row_index")]
        from src.preprocess import load_split
        _, splits = load_split(DATA)
        cand = df.iloc[splits["test"]].sample(min(4000, len(splits["test"])), random_state=7)
        rows = cand[feats].to_dict("records")
        p0 = model.predict_many(rows)
        mask = (p0 > 0.60) & (p0 < 0.98)
        self.pool = cand[mask].to_dict("records")
        self.feats = feats
        if not self.pool:
            self.pool = cand.to_dict("records")

    def draw(self, rng: random.Random | None = None) -> Customer:
        rng = rng or random.Random()
        rec = dict(rng.choice(self.pool))
        y = "yes" if int(rec.pop("y")) == 1 else "no"
        idx = int(rec.pop("row_index"))
        row = {k: rec[k] for k in self.feats}
        gender = "f" if rng.random() < 0.4 else "m"
        name = rng.choice(FEMALE if gender == "f" else MALE)
        c = Customer(row=row, actual_y=y, row_index=idx, name=name, gender=gender, scenario=pick_scenario(row))
        c.profile_ar = profile_ar(row, gender)
        return c


STARTING_DURATION = 380  # seconds; what the model assumes before the talk changes it


def profile_ar(r: dict, gender: str) -> list[dict]:
    f = gender == "f"
    job = (JOB_AR_F.get(r["job"]) if f else None) or JOB_AR.get(r["job"], r["job"])
    mar = (MARITAL_AR_F if f else MARITAL_AR).get(r["marital"], r["marital"])
    pdays = "لم يُتواصل معه سابقاً" if not r.get("previously_contacted", r.get("pdays_recorded", r["previous"] > 0)) else f"قبل {r['pdays']} يوم"
    return [
        {"key": "age", "label": "العمر", "value": f"{r['age']} سنة"},
        {"key": "job", "label": "المهنة", "value": job},
        {"key": "marital", "label": "الحالة الاجتماعية", "value": mar},
        {"key": "education", "label": "التعليم", "value": EDU_AR.get(r["education"], r["education"])},
        {"key": "default", "label": "تعثّر ائتماني", "value": YES_AR.get(r["default"], "غير معروف"), "flag": r["default"] == "yes"},
        {"key": "housing", "label": "تمويل سكني", "value": YES_AR.get(r["housing"], "غير معروف")},
        {"key": "loan", "label": "قرض شخصي", "value": YES_AR.get(r["loan"], "غير معروف"), "flag": r["loan"] == "yes"},
        {"key": "contact", "label": "قناة التواصل", "value": CONTACT_AR.get(r["contact"], r["contact"])},
        {"key": "campaign", "label": "اتصالات هذه الحملة", "value": str(r["campaign"]), "flag": r["campaign"] >= 4},
        {"key": "previous", "label": "اتصالات سابقة", "value": str(r["previous"])},
        {"key": "pdays", "label": "آخر تواصل", "value": pdays},
        {"key": "poutcome", "label": "نتيجة الحملة السابقة", "value": POUT_AR.get(r["poutcome"], r["poutcome"]),
         "flag": r["poutcome"] == "failure"},
        {"key": "last", "label": "آخر اتصال", "value": f"{r['day_of_week']} / {MONTH_AR.get(r['month'], r['month'])}"},
    ]
