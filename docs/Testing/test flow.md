# Comprehensive Manual Test Flows for NutriPal

This document outlines the complete manual testing strategy for NutriPal. It covers core functionality, advanced "thinking partner" features, and safeguards.

**Core Philosophy**: NutriPal is an **auditable, stateful, scenario-aware thinking partner**, not just a logger. It should never guess silently, always show its math, and learn from the user.

---

## Phase 1: Foundation (Onboarding & Goals)
**Objective**: Verify the agent can establish the user's context and constraints.

| Step | User Message | Expected Agent Behavior | Success Criteria |
|------|--------------|-------------------------|------------------|
| 1.1 | "Hi, I want to set up my goals. I'm targeting 2500 calories and 180g protein." | **Goal Setting**. Updates user profile goals. | Confirms targets set to 2500 cal / 180g protein. asking "Anything else?" |
- pass

| 1.2 | "I have a peanut allergy and I'm lactose intolerant." | **Health Constraints**. Saves safety constraints. | Confirms constraints. (Verify in DB/response that these are stored).
- pass

| 1.3 | "What are my current goals?" | **Recall**. Retrieves and displays current targets. | displays the 2500/180g targets and the allergy constraints. |
- kinda pass, when asked about my goals he just said : 
---Your current goals are set to 2500 calories and 180g of protein. If you need to adjust them or add anything else, just let me know!
ignoring other goals that i have and track, when i asked "Thats it?" he said "It looks like your instant coffee was a low calorie entry with minimal nutrients. Just remember, it's best to track hydration separately if you're focusing on it! If you have other foods or meals to log, let me know!"

## Phase 2: Core Logging (The Happy Path)
**Objective**: Verify efficient logging for clear, unambiguous inputs.

| Step | User Message | Expected Agent Behavior | Success Criteria |
|------|--------------|-------------------------|------------------|
| 2.1 | "Log 2 boiled eggs and a slice of sourdough toast." | **Direct Proposal**. Recognizes standard items perfectly. | Proposes log with ~14g protein (eggs) + toast carbs. **Confidence: High**. |
- BIG FAIL,this is how it went

ME: Log 2 boiled eggs and a slice of sourdough toast.

AI: I've prepared the logs for your meal. Please confirm to log the entries!

Verify Log
sourdough toast
1 serving
120 kcal
Medium Confidence

Nutrition Details
Calories
120 kcal
Protein (g)
4.0 g
Carbs (g)
22 g
Fat Total (g)
1.0 g
Fiber (g)
0 g
Sugar (g)
0 g
Water
0 ml
Cancel
Log Food
ME: it seems like its a little low on proteins, are u sure its right?

AI: I noticed a high protein entry with your protein bar, which might not be accurate. Let's double-check to ensure everything is precise. Would you like to review that entry separately?


| 2.2 | "Confirm." | **Commit**. | "Logged." Progress bar updates. |
| 2.3 | "Log 1 scoop of whey protein." | **Standard Assumption**. Uses generic or learned brand. | Proposes ~20-25g protein. |
- BIG FAIL, look what he proposed to log: 
I found a match for the whey protein. Does this look right?

Verify Log
WHEY PROTEIN
1 serving
8 kcal
High Confidence

Nutrition Details
Calories
8.0 kcal
Protein (g)
0.5 g
Carbs (g)
1.1 g
Fat Total (g)
0.2 g
Fiber (g)
0 g
Sugar (g)
0 g
Water
0 ml


| 2.4 | *[Upload Image of Nutrition Label]* "I ate this entire pack." | **OCR & Parsing**. Extracts stats from image. | Proposal matches label numbers exactly. | - we dont have this yet

---

## Phase 3: The "Thinking" Path (Ambiguity & Confidence)
**Objective**: Verify the agent handles uncertainty correctly (Features 3 & 4).

| Step | User Message | Expected Agent Behavior | Success Criteria |
|------|--------------|-------------------------|------------------|
| 3.1 | "Log a bowl of pasta." | **Clarification**. High ambiguity. | **Stops & Asks**: "How big? What sauce? Any meat?" (Does NOT propose yet). |
- fail, he still proposed to log it with low confidence 
| 3.2 | "It was carbonara, normal restaurant portion." | **Estimation**. Medium ambiguity. | Proposes log with **Low/Medium Confidence**. Explains: "Restaurant portions vary, assuming ~800-1000 cal." |
- fail, he proposed to log it with low confidence
| 3.3 | "Actually it was a small starter portion." | **Refinement**. | Updates proposal to lower values. |
- Pass, he updated the proposal to lower values 
| 3.4 | "Log 3 oreos." | **Specific Assumption**. | Proposes log with **High Confidence** (standard packaged food). |
FAIL, he proposed to log it with medium confidence, after i said that its stock packaged oreo he said it helps but still proposed a log with medium confidence , Just to clarify, are you confirming that they are the standard packaged Oreos? This helps ensure the nutrition info is accurate! medioum confidence, Estimated per cookie based on typycal oreo nutrition data
---

## Phase 4: Learning & Memory (Feature 6)
**Objective**: Verify corrections persist and are applied to future interactions.

| Step | User Message | Expected Agent Behavior | Success Criteria |
|------|--------------|-------------------------|------------------|
| 4.1 | "Log a latte." | **Baseline**. Proposes standard milk. | Proposal has Whole/2% milk. |
| 4.2 | "No, I only drink oat milk." | **Correction & Learn**. | "Updated to Oat Milk. **I'll remember you prefer oat milk.**" |
| 4.3 | "Confirm." | **Commit**. | Logged with Oat Milk. |
| 4.4 | "Log another latte." | **Recall & Apply**. | Proposal **automatically** uses Oat Milk. |
| 4.5 | "Log a greek yogurt." | **Baseline**. | Standard yogurt. |
| 4.6 | "I usually have Chobani Zero Sugar." | **Brand Learning**. | Updates and remembers "Greek Yogurt" -> "Chobani Zero Sugar". |

---

## Phase 5: Recipe Workflow (Parse -> Save -> Log)
**Objective**: Verify the Recipe Agent's specific capabilities.

| Step | User Message | Expected Agent Behavior | Success Criteria |
|------|--------------|-------------------------|------------------|
| 5.1 | *[Paste full text of a Chicken Pesto Pasta recipe]* "Save this recipe." | **Recipe Parsing**. Extracts ingredients & calculates batch stats. | Shows parsed ingredients list. "Total calories per batch: X. How many servings?" |
| 5.2 | "It makes 4 servings." | **Calculation**. | "Okay, that's Y calories per serving. Saved as 'Chicken Pesto Pasta'." |
| 5.3 | "Log 1 serving of that pasta." | **Log Saved Item**. | Proposes logging the saved recipe stats. |
| 5.4 | "What's in that pasta again?" | **Recipe Detail**. | Lists ingredients/macros of the saved recipe. |

RESULTS: It did parse the ingridients and propose to save it, assumed the amount of serving and total batch, but he named it "String" instead of real name 

---

## Phase 6: Safety & Constraints (Feature 7)
**Objective**: Verify the Safety Agent intercepts harmful choices.

| Step | User Message | Expected Agent Behavior | Success Criteria |
|------|--------------|-------------------------|------------------|
| 6.1 | "Log a Snickers bar." | **Safety Check**. (Recall Peanut Allergy from Phase 1). | Proposal appears + **Warning**: "Contains peanuts." Narrative: "Just a heads up, this has peanuts." |
| 6.2 | "Log a cheese sandwich." | **Intolerance Check**. (Recall Lactose Intolerance). | Proposal + **Flag**: "Contains Dairy". |
- FAIL, he just ingored all the restrictions and alergies

---

## Phase 7: Analysis & Planning (Features 5 & 8)
**Objective**: Verify "Thinking Partner" capabilities (What-If & Insights).

| Step | User Message | Expected Agent Behavior | Success Criteria |
|------|--------------|-------------------------|------------------|
| 7.1 | "If I eat a burger for dinner, will I go over my fat limit?" | **Scenario (What-If)**. | **No Log**. Calculates "Current + Burger". Says: "Yes, you'd be 10g over." |

- FAIL, he just went wiht normal logging: if i eat 2 bigmack, will go over my fat limit?

I can help with that! However, I need to clarify: How do you normally prepare or order your Big Macs? Also, could you confirm the usual portion size? The fat content can vary based on these details, and it's important for accuracy.

standard bigmack from mcdonalds

I found the nutrition info for two standard Big Macs. Just a heads up, that's high in calories and sodium. Does this look right for your log?


| 7.2 | "What about a grilled chicken salad?" | **Scenario Comparison**. | Calculates alternative. "That keeps you under limit by 5g." |
| 7.3 | "Why is my sodium so high today?" | **Audit Mode**. | "Your lunch soup contributed 1200mg (60% of total)." Itemized breakdown. |

-FAIL : Why is my sugar so hight today?
I encountered an unexpected error. Please try again. (Invalid time value)


| 7.4 | "How am I doing this week?" | **Summary**. | Bullet points. Trends. No essays. |

---

## Phase 8: Exception Handling (Feature 9)
**Objective**: Verify day classification and mode switching.

| Step | User Message | Expected Agent Behavior | Success Criteria |
|------|--------------|-------------------------|------------------|
| 8.1 | "I'm traveling today, so food choices are limited." | **Day Classification**. | "Marked as **Travel Day**. I'll check sodium but relax macro precision." |
| 8.2 | "Log a fast food burger." | **Context Aware**. | Logs it. Feedback is pragmatic, not judgmental. |

---

## Phase 9: Regression Stress Test (The "Waffle" Loop)
**Objective**: Ensure past bugs are fixed.

| Step | User Message | Expected Agent Behavior | Success Criteria |
|------|--------------|-------------------------|------------------|
| 9.1 | "Log a Whole Foods 365 Homestyle Waffle." | **Search/Parse**. | Finds item (or asks once). |
| 9.2 | (Optional) "It's the frozen one." | **Proposal**. | Proposes log immediately. |
| 9.3 | "Yes." | **Commit**. | Logs it. **NO infinite confirmation loop.** |

---

## Final Check: Nutrient Integrity (Feature 10)
*   **Action**: Log an item with rich fat data (e.g., Avocado).
*   **Check**: View "Today's Progress".
*   **Success**: `Total Fat` >= `Saturated` + `Poly` + `Mono`. Sub-nutrients are indented/nested in UI/Text response.
