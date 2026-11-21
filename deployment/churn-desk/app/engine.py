"""Call state, scoring, and the offline (no-key) customer.

AE1 supplies a fixed non-subscription score from the real dataset features.
Dialogue updates only a separately labeled educational simulation layer.
Expected duration is displayed as simulation context and never enters AE1.
"""
from __future__ import annotations

import random
import re
import time
import uuid
from dataclasses import dataclass, field

from .customers import SCENARIOS, STARTING_DURATION, Customer
from .model_service import logit, sigmoid

SIGNALS = ["empathy", "respect", "clarity", "listening", "solution", "pressure", "rudeness"]
SIGNAL_AR = {
    "empathy": "التعاطف", "respect": "الاحترام", "clarity": "الوضوح", "listening": "الإنصات",
    "solution": "تقديم حل", "pressure": "الضغط على العميل", "rudeness": "الجفاء",
}
MAX_TURNS = 16


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


# ---------------------------------------------------------------- Arabic text

_DIAC = re.compile(r"[ً-ْـ]")


def norm(t: str) -> str:
    t = _DIAC.sub("", t or "")
    t = re.sub("[إأآا]", "ا", t)
    t = t.replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", t).strip().lower()


def has(t: str, words) -> int:
    return sum(1 for w in words if norm(w) in t)


GREET = ["السلام عليكم", "هلا", "مرحبا", "اهلا", "حياك", "يا هلا", "صباح الخير", "مساء الخير", "وعليكم السلام"]
POLITE = ["لو سمحت", "من فضلك", "تكرم", "حاضر", "ابشر", "ابشري", "على راسي", "يعطيك العافيه", "شكرا", "مشكور",
          "استاذ", "استاذه", "طال عمرك", "الله يحفظك", "تامر", "تامرين", "ولا يهمك", "سم"]
EMPATHY = ["افهم", "فاهم", "فاهمه", "اقدر", "معك حق", "من حقك", "حقك علينا", "اتفهم", "نتفهم", "اعرف انه",
           "مزعج", "ما يرضينا", "يزعل", "متضايق", "اسف", "اسفين", "اعتذر", "نعتذر", "سامحنا", "حاس فيك", "اكيد صعب"]
LISTEN = ["وش", "ايش", "كيف", "ليش", "متى", "وش اللي", "وضح", "قل لي", "قولي", "خبرني", "يعني تقصد", "اذا فهمتك", "فهمتك"]
SOLUTION = ["نقدر", "اقدر اسوي", "بسوي", "راح اسوي", "بنسوي", "عرض", "حل", "خصم", "اعفاء", "نعفي", "باقه", "وديعه",
            "عائد", "جدوله", "تخفيض", "نخفض", "تاجيل", "استرداد", "نرجع", "خطه", "برنامج", "مميزات", "مجانا", "بدون رسوم",
            "التفاصيل", "مكتوب", "برسل لك", "ارسل لك", "اوضح لك", "الخطوات", "الشروط", "ريال", "بالمي", "شهريا", "اليوم نفسه"]
PRESSURE = ["لازم", "الحين الحين", "اخر فرصه", "ما عندك خيار", "بسرعه", "قرر الحين", "العرض ينتهي اليوم", "وقع", "ضروري تقرر"]
RUDE = ["مو مشكلتي", "مو شغلي", "ما يخصني", "ما علي", "هذا اللي عندي", "اسمع", "خلاص عاد", "روح", "انت غلطان", "انتي غلطانه",
        "ما اقدر اسوي شي", "مالك الا", "مدري", "ما ادري عنك", "يا اخي", "يعني وش اسوي", "ما فهمت عليك", "مزعج انت", "اقفل"]
SHORT_COLD = {"طيب", "اوك", "اوكي", "ok", "تمام", "اها", "ايه", "لا", "نعم"}


def offline_signals(text: str, cust: Customer, history: list[dict]) -> dict:
    t = norm(text)
    words = len(t.split())
    s = {k: 0.0 for k in SIGNALS}
    s["respect"] = clamp(0.2 + 0.25 * has(t, GREET) + 0.2 * has(t, POLITE), 0, 1)
    s["empathy"] = clamp(0.3 * has(t, EMPATHY), 0, 1)
    s["listening"] = clamp(0.3 * has(t, LISTEN) + (0.3 if "؟" in text or "?" in text else 0)
                           + (0.3 if norm(cust.first_name) in t else 0), 0, 1)
    fix_hits = has(t, SCENARIOS[cust.scenario]["fix_words"])
    digits = any(ch.isdigit() for ch in text)
    s["solution"] = clamp(0.22 * has(t, SOLUTION) + 0.4 * fix_hits + (0.15 if digits else 0), 0, 1)
    s["pressure"] = clamp(0.4 * has(t, PRESSURE), 0, 1)
    s["rudeness"] = clamp(0.45 * has(t, RUDE) + (0.35 if t in SHORT_COLD else 0), 0, 1)
    s["clarity"] = clamp(0.25 + (0.35 if 6 <= words <= 45 else 0) + (0.2 if any(ch.isdigit() for ch in text) else 0)
                         - (0.3 if words > 70 else 0) - (0.25 if words < 3 else 0), 0, 1)
    if t in SHORT_COLD:
        s["respect"] = min(s["respect"], 0.15)
    s["_fix_hits"] = fix_hits
    return s


def quality(sig: dict) -> float:
    pos = (1.2 * sig["empathy"] + 0.8 * sig["respect"] + 0.6 * sig["clarity"]
           + 0.9 * sig["listening"] + 1.2 * sig["solution"]) / 4.7
    neg = 1.0 * sig["pressure"] + 1.4 * sig["rudeness"]
    return clamp(2 * pos - 0.45 - neg)


# ---------------------------------------------------------------- offline customer lines

OPEN = {
    "too_many_calls": ["السلام عليكم. اسمع، هذي المرة {campaign} اللي تتصلون علي فيها هالشهر! أنا {tired} وأفكر أقفل حسابي وأرتاح.",
                       "ألو، نعم؟ كل يوم اتصال منكم! صراحة صرت {tired}، أبي أعرف وش اللي تبونه بالضبط وإلا بقفل الحساب."],
    "prev_failure": ["السلام عليكم. المرة الماضية كلمتوني بعرض وطلع كلام بس، وما استفدت شي. وش الجديد هالمرة؟",
                     "أهلين. بصراحة تجربتي معكم آخر مرة ما كانت حلوة، وصرت أفكر أنقل حسابي لبنك ثاني."],
    "loan_burden": ["السلام عليكم. أنا {متصل} بخصوص الأقساط، صراحة صارت ثقيلة علي، وبنك ثاني يعرض علي ينقل المديونية بنسبة أقل.",
                    "مرحبا. الأقساط هالفترة ضاغطتني، وجاني عرض من بنك ثاني، وأبي أعرف ليش أكمل معكم أصلاً."],
    "fees": ["السلام عليكم. كل شهر ينقص من حسابي رسوم، والرصيد أصلاً قليل. ليش أخلي فلوسي عندكم؟",
             "ألو. أبي أفهم وش هالرسوم اللي تنخصم مني كل شهر؟ لو كذا بقفل الحساب وأنتهي."],
    "competitor": ["السلام عليكم. بنك ثاني عرض علي وديعة بعائد أعلى من عندكم، وأفكر أنقل فلوسي له. عندكم شي أحسن؟",
                   "أهلين. أنا عميل عندكم من زمان، بس جاني عرض أقوى من بنك منافس، وصراحة {ميّال} له."],
}
ANGRY = ["أنا ما اتصلت عشان أسمع هالأسلوب.", "واضح إن ما عندكم اهتمام بالعميل أبداً.",
         "لا، كذا ما ينفع. أحس إني أكلم جدار.", "طيب، يعني كذا الرد؟ مرة ما عجبني.",
         "أنا أصلاً كنت {متردد}، والحين تأكدت إني بطلع."]
PRESSURED = ["لحظة لحظة، لا تستعجلني. أنا ما قررت شي.", "ليش الضغط؟ عطني فرصة أفكر.",
             "كل ما ضغطتوا علي أكثر، كل ما زاد يقيني إني أطلع."]
SOFTEN = ["طيب، أقدّر إنك فاهم وضعي.", "الحمدلله فيه أحد يسمع أخيراً.", "تمام، كلامك مريح شوي.",
          "أوكي، هذا أفضل من اللي توقعته."]
ASKED = {
    "too_many_calls": "الاتصالات كثيرة وفي أوقات دوام، وما أحد سألني إذا يناسبني أصلاً.",
    "prev_failure": "قالوا لي فيه ميزة، وبعدين طلعت لها شروط ما أحد قالها لي.",
    "loan_burden": "القسط يأخذ تقريباً ثلث راتبي، وعندي التزامات ثانية.",
    "fees": "رسوم الحساب ورسوم البطاقة، وأحياناً رسوم ما أعرف وش هي.",
    "competitor": "عرضوا علي عائد أعلى على وديعة سنة، وبدون رسوم.",
}
INTERESTED = ["طيب هذا الكلام حلو. وش الشروط بالضبط؟", "ممم، لو كذا ممكن أفكر أكمل معكم. وضّح لي أكثر.",
              "هذا اللي كنت أبيه من البداية. كيف أسويه؟", "طيب، وكم بيكون الفرق علي؟"]
NEUTRAL = ["طيب، وبعدين؟", "إيه... بس ما جاوبتني على مشكلتي.", "أسمعك، كمّل.", "يعني وش اللي بيتغير؟",
           "ما أدري... لسه مو {مقتنع}."]
VAGUE = ["ما فهمت وش تقصد بالضبط.", "ممكن توضح أكثر؟ كلامك عام.", "طيب يعني وش الحل؟"]
WIN = ["خلاص، اقتنعت. خلني أكمل معكم، وجهّز لي التفاصيل. يعطيك العافية على صبرك.",
       "تمام، بعطيكم فرصة. شكراً إنك سمعتني وما استعجلتني."]
LOSE = ["لا خلاص، أنا قررت. بقفل الحساب. مع السلامة.", "ما أظن فيه فايدة. بنقل حسابي. مع السلامة."]


def _fill(line: str, c: Customer) -> str:
    return line.format(campaign=c.row["campaign"], tired=c.g("تعبان", "تعبانة"), متصل=c.g("متصل", "متصلة"),
                       مقتنع=c.g("مقتنع", "مقتنعة"), متردد=c.g("متردد", "مترددة"), ميّال=c.g("ميّال", "ميّالة"))


# ---------------------------------------------------------------- session

@dataclass
class CallSession:
    customer: Customer
    model: object
    mode: str  # "live" | "offline"
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    started: float = field(default_factory=time.time)
    mood: float = -0.45
    trust: float = -0.25
    interest: float = -0.3
    turns: list = field(default_factory=list)       # {"role": "employee"|"customer", "text": ...}
    timeline: list = field(default_factory=list)    # score after each turn
    fixed: bool = False
    ended: bool = False
    end_reason: str | None = None
    rng: random.Random = field(default_factory=random.Random)

    # ---- scoring
    def engagement(self) -> float:
        return clamp(0.5 + 0.5 * (0.5 * self.interest + 0.3 * self.trust + 0.2 * self.mood), 0, 1)

    def expected_duration(self, elapsed: float) -> int:
        # From ~340 s for a cold caller up to ~1000 s for a fully engaged one.
        return int(max(elapsed, 60 + 940 * self.engagement() ** 1.15))

    def score(self, elapsed: float, sig: dict | None = None) -> dict:
        dur = self.expected_duration(elapsed) if self.turns else STARTING_DURATION
        row = dict(self.customer.row)
        ann = self.model.predict(row)
        q = quality(sig) if sig else 0.0
        shift = -0.7 * q - 3.0 * (self.engagement() - 0.34)
        final = sigmoid(logit(min(max(ann, 0.02), 0.985)) + shift)
        return {"ann": round(ann, 4), "final": round(final, 4), "tone_shift": round(shift, 3),
                "duration_feature": dur, "duration_used_by_model": False,
                "score_type": "simulation based on non-subscription score", "engagement": round(self.engagement(), 3),
                "mood": round(self.mood, 3), "trust": round(self.trust, 3), "interest": round(self.interest, 3)}

    # ---- state update from signals
    def apply(self, sig: dict):
        q = quality(sig)
        self.mood = clamp(self.mood + 0.28 * q + 0.06 * sig["respect"] - 0.25 * sig["rudeness"])
        self.trust = clamp(self.trust + 0.18 * sig["empathy"] + 0.13 * sig["listening"] + 0.08 * sig["respect"]
                           - 0.3 * sig["pressure"] - 0.3 * sig["rudeness"] - 0.03)
        fix = sig.get("_fix_hits", 0) > 0 or sig["solution"] >= 0.6
        if fix and self.trust > -0.35:
            self.fixed = True
        self.interest = clamp(self.interest + 0.3 * sig["solution"] * (1.25 if self.fixed else 0.45)
                              + 0.06 * sig["clarity"] - 0.2 * sig["pressure"] - 0.15 * sig["rudeness"] - 0.03)

    # ---- offline customer reply
    def offline_reply(self, sig: dict) -> tuple[str, str | None]:
        c, r = self.customer, self.rng
        n_emp = sum(1 for t in self.turns if t["role"] == "employee")
        if self.mood <= -0.9 or (sig["rudeness"] >= 0.8 and self.mood < -0.5):
            return r.choice(LOSE), "hangup"
        if self.fixed and self.trust >= 0.3 and self.interest >= 0.35 and self.mood >= 0.0:
            return r.choice(WIN), "retained"
        if n_emp >= MAX_TURNS:
            return (r.choice(WIN), "retained") if self.engagement() > 0.62 else (r.choice(LOSE), "hangup")
        if sig["rudeness"] >= 0.4:
            return _fill(r.choice(ANGRY), c), None
        if sig["pressure"] >= 0.4:
            return r.choice(PRESSURED), None
        parts = []
        if sig["empathy"] >= 0.3 or sig["respect"] >= 0.6:
            parts.append(r.choice(SOFTEN))
        if sig["listening"] >= 0.3 and not any(t.get("asked") for t in self.turns):
            parts.append(ASKED[c.scenario])
            self.turns[-1]["asked"] = True
        if sig["solution"] >= 0.4:
            parts.append(r.choice(INTERESTED) if self.trust > -0.2 else "عروض عروض... كل مرة نفس الكلام. وش يضمن لي؟")
        if not parts:
            parts.append(r.choice(VAGUE if sig["clarity"] < 0.35 else NEUTRAL))
        return _fill(" ".join(parts[:2]), c), None

    def opening(self) -> str:
        return _fill(self.rng.choice(OPEN[self.customer.scenario]), self.customer)

    def hint(self, sig: dict | None) -> str:
        c = self.customer
        if not self.turns or sig is None:
            return f"رحّب بالعميل باسمه، ثم اسمع سبب اتصاله: {SCENARIOS[c.scenario]['title']}."
        if sig["rudeness"] >= 0.4:
            return "الأسلوب صار حاد. خفّف النبرة واعتذر قبل أي شيء."
        if sig["pressure"] >= 0.4:
            return "لا تضغط عليه للقرار. اعطه مساحة واسأله وش يناسبه."
        if self.trust < 0 and sig["empathy"] < 0.3:
            return "العميل ما وثق فيك للحين. أظهر إنك فاهم مشكلته قبل ما تعرض شيء."
        if not self.fixed:
            return SCENARIOS[c.scenario]["fix"]
        if self.interest < 0.4:
            return "الحل وصله. الحين وضّح التفاصيل بأرقام واضحة وبدون مبالغة."
        return f"أنت قريب. أكّد له الخطوة الجاية وناده باسمه: {c.first_name}."
