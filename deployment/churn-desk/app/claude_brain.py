"""Live customer played by Claude.

One request per employee turn. Claude returns JSON with:
  - the customer's spoken reply (Saudi dialect)
  - how the employee's message scored on each signal (0..1)
  - whether the customer ends the call
  - a short coaching hint for the employee
The hidden state update and the ANN scoring stay in engine.py, so the
offline and live modes score the same way.
"""
from __future__ import annotations

import json
import os

import anthropic

from .customers import SCENARIOS, Customer
from .engine import SIGNALS

MODEL = os.getenv("CUSTOMER_CLAUDE_MODEL", "")
EFFORT = os.getenv("CUSTOMER_CLAUDE_EFFORT", "low")

SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string", "description": "What the customer says next, spoken Saudi Arabic, 1-3 short sentences."},
        "signals": {
            "type": "object",
            "properties": {k: {"type": "number"} for k in SIGNALS},
            "required": SIGNALS,
            "additionalProperties": False,
        },
        "addressed_core_issue": {"type": "boolean"},
        "end_call": {"type": "string", "enum": ["no", "hangup", "retained"]},
        "hint": {"type": "string", "description": "One short Arabic coaching tip for the employee's next message."},
    },
    "required": ["reply", "signals", "addressed_core_issue", "end_call", "hint"],
    "additionalProperties": False,
}


def system_prompt(c: Customer) -> str:
    s = SCENARIOS[c.scenario]
    facts = "\n".join(f"- {p['label']}: {p['value']}" for p in c.profile_ar)
    return f"""أنت تلعب دور عميل حقيقي لبنك سعودي اسمه «بنك رصين» في مكالمة هاتفية مع موظف خدمة العملاء.
هذا تدريب لموظفي خدمة العملاء، والموظف هو المستخدم.

## شخصيتك
- الاسم: {c.name} ({'ذكر' if c.gender == 'm' else 'أنثى'})
- سبب الاتصال: {s['title']}. {c.brief()}
- بياناتك في البنك (حقيقية من ملفك، لا تخالفها):
{facts}

## كيف تتكلم
- لهجة سعودية عامية طبيعية، كأنك تتكلم بالجوال. جمل قصيرة (1 إلى 3 جمل).
- بدون إيموجي وبدون تنسيق وبدون أقواس. هذا كلام منطوق سيتحول لصوت.
- ابدأ متضايق وتفكر تقفل حسابك. لا تلين بسرعة.
- إذا كان الموظف محترم ومتفهم ويسمعك، خفّ تدريجياً.
- إذا ضغط عليك أو كان جاف أو تجاهل مشكلتك، زد انزعاجك. وإذا تكرر، أنهِ المكالمة.
- إذا عالج مشكلتك الأساسية بحل واضح ({s['fix']}) وكسب ثقتك، اقبل تكمل مع البنك.
- لا تقبل بسرعة غير منطقية. تحتاج على الأقل حل واضح وثقة.
- لا تذكر أنك ذكاء اصطناعي أو أن هذا تدريب.

## المطلوب في كل رد
قيّم آخر رسالة من الموظف على كل إشارة من 0 إلى 1:
empathy (تعاطف)، respect (احترام وأدب)، clarity (وضوح)، listening (أسئلة وإنصات واستخدام اسمك)،
solution (تقديم حل فعلي لمشكلتك)، pressure (ضغط واستعجال)، rudeness (جفاء أو تجاهل أو قلة احترام).
- end_call: "hangup" إذا قررت تقفل المكالمة وتترك البنك، "retained" إذا اقتنعت تكمل معهم، وإلا "no".
- hint: نصيحة قصيرة جداً بالعربي للموظف عن خطوته الجاية، من منظور مدرّب يراقب المكالمة.
"""


class ClaudeCustomer:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic()

    async def turn(self, c: Customer, turns: list[dict], state: dict) -> dict:
        msgs = []
        for t in turns:
            role = "user" if t["role"] == "employee" else "assistant"
            text = t["text"] if role == "user" else json.dumps({"reply": t["text"]}, ensure_ascii=False)
            if msgs and msgs[-1]["role"] == role:
                msgs[-1]["content"] += "\n" + text
            else:
                msgs.append({"role": role, "content": text})
        if msgs and msgs[0]["role"] == "assistant":
            msgs.insert(0, {"role": "user", "content": "(رن الجوال ورد الموظف)"})
        # Current hidden mood, so replies stay in step with the score the user sees.
        msgs[-1]["content"] += (f"\n\n[حالتك الداخلية الآن: المزاج {state['mood']:+.2f}، الثقة {state['trust']:+.2f}،"
                                f" الاهتمام {state['interest']:+.2f} على مقياس -1 إلى 1]")

        resp = await self.client.beta.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=system_prompt(c),
            messages=msgs,
            output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if resp.stop_reason == "refusal":
            raise RuntimeError("Claude declined this turn")
        text = next(b.text for b in resp.content if b.type == "text")
        data = json.loads(text)
        data["signals"] = {k: max(0.0, min(1.0, float(data["signals"].get(k, 0)))) for k in SIGNALS}
        return data

    async def opening(self, c: Customer) -> str:
        resp = await self.client.beta.messages.create(
            model=MODEL,
            max_tokens=1000,
            system=system_prompt(c),
            messages=[{"role": "user", "content": "(رد الموظف على الجوال: «بنك رصين، معك خدمة العملاء، تفضل.») قل جملتك الأولى فقط."}],
            output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": {
                "type": "object", "properties": {"reply": {"type": "string"}},
                "required": ["reply"], "additionalProperties": False}}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if resp.stop_reason == "refusal":
            raise RuntimeError("Claude declined the opening")
        return json.loads(next(b.text for b in resp.content if b.type == "text"))["reply"]
