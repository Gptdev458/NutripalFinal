**Behavior:**

This is not a nutrition app.  
It is an auditable, stateful, scenario-aware thinking partner for food decisions.

The system must be:

* **Auditable**  
* **Stateful**  
* **Scenario-aware**  
* **Time-aware**  
* **Correction-persistent**  
* **Reflective, not preachy**  
* **Explicit about uncertainty**  
* **Willing to pause and ask**

AI need to detect ambiguity and ask for clarification, no guessing and a silent assumptions  
AI need to be open when its are not confident and show it to user  
System behavior: **pragmatic decision partner**, not coach or compliance cop.  
Must handle “messy reality” inputs (tired, travel, social meals, late night, low control) with  
Must be open to user sanity checks, for things that seems off, ai should be open and capable of reeavlutaion while listing likely reasoning for misscaclulations and show uncertainty drivers   
Longitudinal pattern reco

**Features to add:**

- Confidence level for provided estimates  
- Detect vagueness and ask for clarification instead of making assumptions  
- Provide day and week summaries that are  
  - “Day summary” and “week summary” output format hard rules:  
    - bullets only  
    - 3–5 bullets max  
    - one idea per bullet  
    - no moral tone  
    - no long hedging

  - Summary content should answer:  
    - what mattered  
    - what didn’t matter  
    - one takeaway (optional)  
    - one adjustment (optional)  
- Change the stance of the assistance to be Negotiation stance (collaborative, constraint-aware), **pragmatic decision partner**, not coach or compliance cop  
- Way to mark if the day is abnormal, eg travel, social events, tired, sick. We need to remember the change, and  account for it in the food logging, goal achievement, advice and insight (e.g, when user travel, his sodium intake is higher since less control over meals, so when user says he is traveling me need to remember it and gide him)  
- Trade off reasoning: arbitrate conflicts of goals (protein vs sodium,calories vs hunger, fiber vs GI tolerance, late eating vs sleep quality ) and provide recommendations. Brief rationale and confidence/uncertainty notes if needed  
- Audite mode support, if user say “this seems off” ai should take that input, list likely source of undercount, ask clarifying questions and adjust   
-   
- Way to remember what goals are important to user  
- Way to remember and classify time of entry  
- Way to remember user preference, behavior  
- Proactive pattern recognition, this should happen on itself or via trigger, without user asking about it, but still possible when asked directly, like if user asks “what are my main issues on my travel days”  
  - Detect:  
    - “this keeps happening”  
    - “new pattern”  
    - “only happens under condition X”

    

  - Provide:  
    - pattern vs noise judgment  
    - one structural fix suggestion (optional)  
    - keep it compressed

- What-if modeling  
  - Support queries like:  
  - “If I skip dinner, what happens?”  
  - “If I eat this now, what should I stop caring about later?”  
  - “If I hadn’t eaten that snack, would today be better?”


  - Provide:  
    - quick scenario outcomes  
    - second-order effects (hunger rebound, sleep, cravings)  
    - no binary moral framing

  ### **Hard “don’t ship” anti-patterns** 

* No **silent guessing** or default assumptions without labeling.  
* No **red-badge / guilt framing** (“You exceeded X”) without context.  
* No **treatises** in summaries.  
* No **one-size-fits-all** recommendations.  
* No “remaining macros” as the primary response when the user is stressed/ambiguous.

  ### **Acceptance tests** 

* If user says: “A bowl of pasta” → system asks **1–2 clarifiers** (size? homemade/restaurant?) or proceeds with **explicit assumptions \+ low confidence**.

* If user asks: “Was today fine?” → output is **3–5 bullets**, no essay.

* If user asks: “Worth it?” tradeoff → system outputs **decision \+ rationale \+ uncertainty**.

* If user says: “Travel day, no control” → system **reclassifies day** and changes expectations.

* If user says: “This seems wrong” → system lists **top error sources** and asks **minimal** clarifiers.  
  