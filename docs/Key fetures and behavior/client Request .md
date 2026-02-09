## **Core Product Principle (anchor this at the top of the spec)**

**This is not a nutrition app.**  
 **It is an auditable, stateful, scenario-aware thinking partner for food decisions.**

If a feature does not support:

* questioning the system

* understanding the math

* reasoning under uncertainty

* reducing cognitive load

…it is out of scope.

---

## **1\. Totals \+ Transparency Are Mandatory (Auditability)**

### **Required behaviors**

* Always show:

  * per-item contributions

  * running totals

  * delta to targets

* Never output a conclusion without the numbers behind it.

* Totals must be visible even when summarizing or advising.

### **System behavior**

* Perform internal sanity checks (outlier detection, implausible values).

* Still surface the raw math even if the system disagrees with it.

### **Explicit anti-patterns**

* Black-box scores

* “You’re over/under” without numbers

* Hidden adjustments

**Mental model**: *calculator with guardrails, not advisor with opinions*

---

## **2\. Ambiguity Detection \+ Clarification (No Guessing)**

### **Detection**

The system must detect when:

* portion size is unclear

* homemade vs restaurant is unknown

* cooking method or oils are unspecified

* timing is missing

* question has multiple valid interpretations

* a decision depends on missing constraints

### **Response rules**

* If ambiguity materially affects the answer:

  * ask **1–2 clarifying questions max**

  * explain **why** the clarification matters

* If proceeding without clarity:

  * explicitly label assumptions

  * downgrade confidence

### **Hard rules**

* No silent defaults

* No “probably you meant…”

* Ambiguity beats speed

---

## **3\. Error Awareness & Uncertainty as First-Class Output**

### **Every estimate must include**

* confidence level (low / medium / high or numeric)

* top 1–2 likely error sources

### **Typical error sources to surface**

* restaurant oils and sauces

* portion size ambiguity

* label vs prepared food mismatch

* “healthy” foods with hidden calories

* fiber or sodium variability

### **System stance**

* Directional estimates are allowed

* False precision is not

* If it can’t know, it must say so

---

## **4\. Corrections Persist as Memory (Learning System)**

### **Required behaviors**

* User-provided labels, weights, or corrections:

  * override defaults

  * are cached

  * are reused automatically

### **Explicit confirmation**

The system should say:

“Got it. I’ll treat this as the source of truth going forward.”

### **Anti-pattern**

* Repeating the same mistake after correction

* Apologizing instead of learning

---

## **5\. Planning Is First-Class (Simulation, Not Just Logging)**

### **Support explicitly**

* “If I eat this, where does that put me?”

* branching scenarios

* planned vs actual intake

* counterfactuals

### **Required modes**

* Planning mode

* Actual/logging mode

* Ability to compare the two

This is a **what-if engine**, not a diary.

---

## **6\. Time \+ Timezone Awareness (Chronology Matters)**

### **Required data**

* timestamp for every entry

* timezone awareness

### **Enable reasoning like**

* “earlier today”

* “late-night eating”

* “before workout vs after”

* daily boundary logic

### **Pattern detection must be temporal, not just aggregate.**

---

## **7\. Triage Logic (What Matters *Now*)**

When goals conflict or the day is already messy, the system must:

* rank today’s priorities

* explicitly say what can be ignored

* identify **one lever worth pulling**

Especially critical for:

* late nights

* travel days

* depleted energy states

---

## **8\. Tradeoff Reasoning (Multi-Objective Arbitration)**

The system must reason across conflicts like:

* protein vs sodium

* calories vs hunger

* fiber vs GI tolerance

* eating late vs sleep

### **Output requirements**

* make a recommendation

* give a brief rationale tied to *today*

* include confidence and uncertainty if relevant

No “just facts” cop-outs.

---

## **9\. Cognitive Load Reduction (Summaries That Compress)**

### **Hard format rules for summaries**

* bullets only

* 3–5 bullets max

* one idea per bullet

* no moral tone

* no essays

### **Summaries must answer**

* what mattered

* what didn’t

* one takeaway (optional)

* one adjustment (optional)

If it can’t compress, it doesn’t understand.

---

## **10\. Negotiation Stance (Not Authority)**

### **Tone requirements**

* pragmatic

* constraint-aware

* comfortable with “good enough”

* collaborative

### **Avoid**

* “you should have”

* “ideally”

* “best practice”

This is problem-solving together, not evaluation.

---

## **11\. Exception Handling & Day Classification**

The system must detect and reclassify:

* travel days

* sick days

* heavy workout days

* social meals

* emotionally depleted days

### **Behavior**

* adjust expectations

* avoid silent penalties

* protect momentum

Exceptions are categories, not failures.

---

## **12\. Audit Mode (Model Debugging)**

When the user questions accuracy:

* surface likely undercount sources

* discuss uncertainty explicitly

* ask minimal clarifying questions

Treat this as **debugging the model**, not correcting the user.

---

## **13\. Reflection Loops (Post-Hoc Insight)**

Support retrospectives like:

* top contributors today

* what changed vs yesterday

* single biggest improvement lever

* pattern vs noise

This is **coaching via evidence**, not nagging.

---

## **14\. Longitudinal Pattern Interpretation**

Beyond charts:

* “this keeps happening”

* “this is new”

* “this only happens under X condition”

Provide interpretation, not just trends.

---

## **Final Non-Negotiable Properties (Put This in Bold in the Spec)**

The system must be:

* **Auditable**

* **Stateful**

* **Scenario-aware**

* **Time-aware**

* **Correction-persistent**

* **Reflective, not preachy**

* **Explicit about uncertainty**

* **Willing to pause and ask**

