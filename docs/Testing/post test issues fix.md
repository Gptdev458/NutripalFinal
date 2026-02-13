# Post-Test Issues & Fixes

**Generated**: 2026-02-12
**Source**: Analysis of [Test Flow](test%20flow.md) and [Logs](Supabase%20logs%20after%20test%20flow.md)

This document details the failures identified during the "Comprehensive Manual Test Flow" and outlines the specific fixes required.

---

## 1. Goal Recall Incompleteness (Phase 1.3)

**The Failure**:
When asked "What are my current goals?", the agent only stated calories (2500) and protein (180g), ignoring other tracked goals (micronutrients, water, specific limits) stored in the profile.

**Root Cause**:
The `ReasoningAgent` or `ChatAgent` is likely summarizing the `user_profile` too aggressively, or the `get_user_goals` tool is only returning the primary "headline" goals.

**Fix**:
- [ ] **Update ReasoningAgent Prompt**: Explicitly instruct it to list *all* active goals (including macros, micros, and water) when general recall is requested.
- [ ] **Verify Tool Output**: Ensure `get_user_goals` returns the full nested goal structure.

---

## 2. Severe Nutrition Data Accuracy (Phase 2.1 & 2.3)

**The Failure**:
1.  **Eggs & Toast**: "2 boiled eggs + sourdough toast" -> Proposed **4.0g Protein** (Should be ~15-18g).
2.  **Whey Protein**: "1 scoop whey protein" -> Proposed **0.5g Protein** (Should be ~20-25g).

**Root Cause**:
- **Whey**: The agent likely matched "liquid sweet whey" (a byproduct) instead of "whey protein powder".
- **Eggs**: Likely a unit/serving size scaling error (e.g., calculating for 100g but applying to "1 egg" incorrectly).

**Fix**:
- [ ] **Sanity Check Layer**: Implement a "sanity check" in `NutritionAgent`. If item name contains "Protein", and protein content is < 10% of weight, flag it.
- [ ] **Context Injection**: For "whey protein", strictly bias search towards "powder" or "supplement".
- [ ] **Unit Debugging**: Audit the `scale_nutrition` function to ensure count-based units (e.g., "2 eggs") are scaled correctly against reference weight.

---

## 3. Ambiguity Detection Failure (Phase 3.1 & 3.2)

**The Failure**:
User said "Log a bowl of pasta".
**Expected**: Stop & Ask (High Ambiguity).
**Actual**: Proposed generic pasta (~300-400 cal) with Low/Medium confidence.

**Root Cause**:
The `IntentAgent` ambiguity detection threshold is too high. It is defaulting to "Make a good guess" instead of "Ask for clarification" even for very vague inputs.

**Fix**:
- [x] **Tune IntentAgent**: Add few-shot examples where "bowl of [food]" without modifiers is labeled `ambiguity_level: 'high'`.
- [ ] **Orchestrator Logic**: Ensure `ambiguity_level: 'high'` strictly triggers the clarification flow, preventing `propose_food_log` from running.

---

## 4. Confidence "Ceiling" (Phase 3.4)

**The Failure**:
User verified "Standard packaged Oreos".
**Expected**: High Confidence.
**Actual**: Medium Confidence ("Estimated per cookie...").

**Root Cause**:
The `NutritionAgent` likely caps confidence at "Medium" for any LLM-derived estimate, even if the user explicitly confirmed the standard product.

**Fix**:
- [x] **Logic Update**: If User confirms a specific product/brand during clarification, upgrade confidence to **High**.

---

## 5. Recipe Naming Bug (Phase 5.x)

**The Failure**:
Recipe parsed and saved, but named "**String**" instead of "Chicken Pesto Pasta".

**Root Cause**:
The `extract_recipe_details` prompt or the tool call is failing to extract the title from the pasted text, defaulting to a type name or placeholder.

**Fix**:
- [ ] **Debug RecipeAgent**: Check the JSON extraction for the `name` field. Ensure it doesn't fallback to generic strings.

---

## 6. Safety Checks Ignored (Phase 6.1 & 6.2)

**The Failure**:
User logged "Snickers" (Peanut Allergy) and "Cheese Sandwich" (Lactose Intolerance).
**Result**: Logged successfully with **NO WARNINGS**.

**Root Cause**:
The parallel safety check in `OrchestratorV3` is either not triggering, failing silently, or its output is not being injected into the final `ChatAgent` context.

**Fix**:
- [ ] **Verify Orchestrator**: Ensure `check_safety` is called for `log_food` intents.
- [ ] **Verify Context**: Ensure `safety_flags` are passed to `ChatAgent`.
- [ ] **Trace Logs**: Add specific logging for "Safety Check Result".

---

## 7. Intent Misclassification (Phase 7.1)

**The Failure**:
User: "If I eat a burger..."
**Expected**: Scenario/Planning Mode (No log).
**Actual**: `log_food` Intent (Attempted to log it).

**Root Cause**:
`IntentAgent` is aggressively matching food words to `log_food`. It incorrectly prioritized the *content* ("burger") over the *grammar* ("If I...").

**Fix**:
- [ ] **Prompt Engineering**: Add negative examples to `log_food` in `IntentAgent`. "If I eat X..." -> `planning/what_if` intent.

---

## 8. Analysis "Invalid Time" Error (Phase 7.3)

**The Failure**:
User: "Why is my sugar so high?"
**Result**: `Error: Invalid time value`.

**Root Cause**:
A Date/Time parsing error in `InsightAgent` or `DbService` when attempting to aggregate "today's" logs for analysis. Likely an issue with typical/edge case timestamps or timezone conversions.

**Fix**:
- [ ] **Debug InsightAgent**: check `get_daily_breakdown` and date handling. Wrap in try/catch to identify the specific invalid value.
