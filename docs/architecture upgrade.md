# Architecture Upgrade: Strategic Plan

## Why This Upgrade

NutriPal is **not a nutrition app**. It is an *auditable, stateful, scenario-aware thinking partner for food decisions*.

The current architecture handles basic logging well, but lacks the intelligence layer required by our core philosophy. This upgrade transforms our agents from "tools that execute commands" into "partners that think with the user."

---

## The 14 Core Principles

Every feature must support at least one of these principles. If it doesn't, it's out of scope.

### 1. Totals + Transparency (Auditability)
**Principle**: Never output a conclusion without the numbers behind it.
- Show per-item contributions, running totals, delta to targets
- Internal sanity checks that still surface the raw math
- **Mental model**: Calculator with guardrails, not advisor with opinions

**Gap**: Currently, we calculate but don't always show the math. Audit mode is missing.

---

### 2. Ambiguity Detection + Clarification
**Principle**: If ambiguity materially affects the answer, pause and ask.
- Detect unclear portions, unknown cooking methods, multiple interpretations
- Ask 1-2 clarifying questions max, explain *why* clarification matters
- **Hard rule**: Ambiguity beats speed

**Gap**: Intent Agent doesn't flag ambiguity. System guesses silently.

---

### 3. Uncertainty as First-Class Output
**Principle**: Every estimate must include confidence level and likely error sources.
- Rate confidence: low / medium / high
- Surface error sources: restaurant oils, portion ambiguity, hidden calories
- **Stance**: Directional estimates allowed. False precision is not.

**Gap**: Nutrition Agent doesn't return confidence. Estimates look certain when they're not.

---

### 4. Corrections Persist as Memory
**Principle**: User-provided labels, weights, or corrections override defaults and are reused automatically.
- System should say: "Got it. I'll treat this as the source of truth going forward."
- **Anti-pattern**: Repeating the same mistake after correction

**Gap**: No memory of user corrections. Each session starts fresh.

---

### 5. Planning is First-Class
**Principle**: This is a what-if engine, not a diary.
- Support: "If I eat this, where does that put me?"
- Branching scenarios, planned vs actual, counterfactuals
- Compare options before deciding

**Gap**: Partially implemented. Reasoning Agent can do this, but it's not explicit.

---

### 6. Time + Timezone Awareness
**Principle**: Chronology matters.
- Timestamp every entry with timezone
- Enable reasoning: "earlier today", "late-night eating", "before workout"
- Pattern detection must be temporal, not just aggregate

**Status**: ✅ Already implemented

---

### 7. Triage Logic
**Principle**: When goals conflict or the day is messy, rank priorities.
- Know what the *user* treats as most important
- Give reasoning for tradeoffs based on user's values
- Explicitly say what can be ignored today
- Identify one lever worth pulling

**Gap**: No triage. System treats every goal equally. No memory of what user prioritizes.

---

### 8. Tradeoff Reasoning
**Principle**: Reason across conflicts: protein vs sodium, calories vs hunger.
- Make a recommendation with brief rationale tied to *today*
- Include confidence and uncertainty
- **No "just facts" cop-outs**

**Gap**: Reasoning Agent can do this but isn't prompted for tradeoff thinking.

---

### 9. Cognitive Load Reduction
**Principle**: Summaries must compress.
- Bullets only, 3-5 max, one idea per bullet
- No moral tone, no essays
- Answer: what mattered, what didn't, one takeaway, one adjustment

**Gap**: Chat Agent sometimes produces long responses.

---

### 10. Negotiation Stance
**Principle**: Collaborative, not authoritative.
- Pragmatic, constraint-aware, comfortable with "good enough"
- **Avoid**: "you should have", "ideally", "best practice"

**Status**: ✅ Mostly implemented in Chat Agent personality

---

### 11. Exception Handling + Day Classification
**Principle**: Exceptions are categories, not failures.
- Detect and reclassify: travel, sick, heavy workout, social meals, emotionally depleted
- Adjust expectations, avoid silent penalties, protect momentum

**Gap**: No day classification. System penalizes travel days like normal days.

---

### 12. Audit Mode
**Principle**: When user questions accuracy, surface likely undercount sources.
- Discuss uncertainty explicitly
- Ask minimal clarifying questions
- **Stance**: Debugging the model, not correcting the user

**Gap**: No audit mode. User can't verify the math.

---

### 13. Reflection Loops
**Principle**: Support retrospectives.
- Top contributors today
- What changed vs yesterday
- Single biggest improvement lever
- Pattern vs noise

**Gap**: Insight Agent exists but is underutilized. No proactive reflection.

---

### 14. Longitudinal Pattern Interpretation
**Principle**: Beyond charts, provide interpretation.
- "This keeps happening"
- "This is new"
- "This only happens under X condition"

**Gap**: Insight Agent calculates averages but doesn't interpret trends.

---

## 🔴 Critical Architecture Issue: Agent Responsibility Restructuring

### Current Architecture (Problematic)

```
User Message
    ↓
Orchestrator
    ↓
Intent Agent → classifies intent
    ↓
┌─────────────────────────────────────────────────┐
│         REASONING AGENT (does too much)         │
│  Uses 21 granular tools directly:               │
│  • lookup_nutrition                             │
│  • estimate_nutrition                           │
│  • search_saved_recipes                         │
│  • analyze_eating_patterns                      │
│  • get_food_recommendations                     │
│  • get_progress_report                          │
│  • ... and 15 more                              │
└─────────────────────────────────────────────────┘
    ↓
Tool Executor
    ↓
Chat Agent → formats response
```

**Problems:**
1. Reasoning Agent bypasses specialist agents entirely
2. Tools are too granular — "lookup_nutrition" should be Nutrition Agent's job
3. Insight Agent is barely used (only 2 suggestions)
4. Recipe Agent works well *internally* but is bypassed by Reasoning Agent
5. Agents don't collaborate — they compete

---

### Intended Architecture (Target)

```
User Message
    ↓
Orchestrator
    ↓
Intent Agent → classifies intent + detects ambiguity
    ↓
┌─────────────────────────────────────────────────┐
│              INTENT ROUTER (Switch)             │
├─────────────────────────────────────────────────┤
│ Recipes       → Recipe Agent                    │
│ Food logging  → Nutrition Agent                 │
│ Insights      → Insight Agent                   │
│ Audit/Summary → Insight Agent                   │
│ Complex/Multi → Reasoning Agent (fallback)      │
└─────────────────────────────────────────────────┘
    ↓
Specialist Agent does the work
    ↓
Chat Agent → formats response
```

**Key Differences:**
1. **Direct routing** to specialist agents, not through tools
2. **Reasoning Agent is fallback** for complex multi-step tasks only
3. **Each agent owns its domain** — no bypassing
4. **Agents can delegate** to each other (Recipe → Nutrition is correct)

---

### Specific Changes Needed

#### 1. Orchestrator Intent Router Expansion

| Intent | Current Route | Target Route |
|--------|---------------|--------------|
| `log_food` | ToolExecutor.lookup_nutrition | **Nutrition Agent.estimate()** |
| `query_nutrition` | ToolExecutor.lookup_nutrition | **Nutrition Agent.query()** |
| `save_recipe` | Recipe Agent ✅ | Recipe Agent ✅ |
| `log_recipe` | Recipe Agent ✅ | Recipe Agent ✅ |
| `audit` | Reasoning Agent | **Insight Agent.audit()** |
| `patterns` | Reasoning Agent | **Insight Agent.patterns()** |
| `summary` | Reasoning Agent | **Insight Agent.summary()** |
| `complex_query` | Reasoning Agent | Reasoning Agent ✅ |
| `planning` | Reasoning Agent | Reasoning Agent ✅ |

#### 2. Reasoning Agent Tool Categorization

**🔴 Remove (duplicate agent work):**
- `lookup_nutrition` → Nutrition Agent does this
- `estimate_nutrition` → Nutrition Agent does this
- `search_saved_recipes` → Recipe Agent does this
- `get_recipe_details` → Recipe Agent does this
- `analyze_eating_patterns` → Insight Agent does this
- `get_progress_report` → Insight Agent does this

**🟢 Keep (context & data access):**
- `get_user_goals` — Reasoning needs to know targets
- `get_food_log_history` — Reasoning needs to see what was logged
- `get_daily_totals` — Reasoning needs current progress
- `search_memory` — Reasoning needs user context (when memory exists)
- `get_user_profile` — Reasoning needs health constraints

**🟡 Add (delegation to agents):**
- `ask_nutrition_agent` → "Estimate nutrition for X"
- `ask_recipe_agent` → "Find recipe for X" / "Parse this recipe"
- `ask_insight_agent` → "Analyze patterns" / "Generate audit"

**🔵 Keep (actions):**
- `log_food_entry` — Final persistence step
- `propose_action` — PCC pattern
- `set_goal` — Goal management
- `create_adjustment` — Day adjustments

#### 3. Agent Communication Protocol

When Reasoning Agent needs nutrition data:
- **Before**: Reasoning Agent calls `lookup_nutrition` tool directly
- **After**: Reasoning Agent calls `ask_nutrition_agent` which invokes Nutrition Agent

This preserves agent intelligence (confidence, health flags) instead of raw data.

---

### Example Flow: "Log a chicken salad"

**Current (Broken):**
```
User: "Log a chicken salad"
IntentAgent: intent=log_food
Orchestrator: ToolExecutor.lookup_nutrition("chicken salad")
ToolExecutor: raw nutrition data (no confidence, no context)
ChatAgent: "Logged 350 calories"
```

**Target (Correct):**
```
User: "Log a chicken salad"
IntentAgent: intent=log_food, ambiguity=medium (portion unclear)
Orchestrator: NutritionAgent.estimate("chicken salad")
NutritionAgent: {
  calories: 350,
  confidence: low,
  error_sources: ["portion_vague", "dressing_unknown"],
  health_flags: []
}
ChatAgent: "Here's what I think (confidence: low) — about 350 cal, 
           but I'm guessing on portion. How much did you have?"
```

---

## Strategic Upgrade Approach

### Layer 1: Perception (Intent Agent)

**Current**: Classifies intent, extracts food items.

**Upgrade**: Becomes a "triage" layer that also detects:
- **Ambiguity level** — Does the system need to pause and ask?
- **Day context** — Is this a travel/sick/workout day?

**Why**: The earliest point to catch ambiguity and adjust expectations.

---

### Layer 2: Estimation (Nutrition Agent)

**Current**: Looks up or estimates nutrition, returns numbers.

**Upgrade**: Returns numbers *with metadata*:
- **Confidence** — How certain is this estimate?
- **Error sources** — What could be wrong?
- **Health flags** — Does this conflict with user constraints?

**Why**: Uncertainty is first-class. User needs to know what's reliable.

---

### Layer 3: Analysis (Insight Agent)

**Current**: Calculates totals, generates 2 short suggestions.

**Upgrade**: Becomes a full "analyst" with multiple capabilities:
- **Audit mode** — Show the math, itemized
- **Pattern recognition** — Longitudinal interpretation
- **Day classification** — Save and exclude exception days
- **Proactive reflection** — Single biggest lever

**Why**: Currently the most underutilized agent. Has the data, lacks the prompts.

---

### Layer 4: Communication (Chat Agent)

**Current**: Formats responses with personality.

**Upgrade**: Becomes context-aware narrator:
- **Handles clarification requests** — When confidence is low, asks targeted question
- **Issues health warnings** — When food conflicts with user constraints
- **Respects cognitive load** — 3-5 bullets max, no essays

**Why**: The final output layer. Must carry through all the intelligence.

---

### Layer 5: Memory (New)

**Current**: Session state only. No long-term learning.

**Upgrade**: New **classified memory system** with domain categories:

| Memory Category | Examples | Used By |
|-----------------|----------|--------|
| `food` | "User's chicken is higher in sodium" | Nutrition Agent |
| `priorities` | "User prioritizes protein over calories" | Reasoning Agent, Insight Agent |
| `health` | "User is lactose intolerant" | Nutrition Agent, Chat Agent |
| `habits` | "User always adds olive oil when cooking" | Nutrition Agent |
| `preferences` | "User prefers metric units" | Chat Agent |

**How it works**:
- Each memory has a `category` field
- Agents only query their relevant categories
- Nutrition Agent: queries `food`, `habits`, `health`
- Reasoning Agent: queries `priorities`
- Chat Agent: queries `health`, `preferences`

**Why**: Prevents agents from searching irrelevant memories. Enables tradeoff reasoning based on what user actually values.

---

## Data Changes Required

| Change | Purpose |
|--------|---------|
| `user_profiles.health_considerations` | Store dietary constraints |
| `daily_adjustments.day_type` | Classify exception days |
| `user_learned_context` table | Persist user corrections semantically |

---

## Flow Changes Required

### Ambiguity Pause-and-Ask

After Intent Agent detects high ambiguity:
- Don't guess
- Return a clarification question
- Wait for user response
- Then proceed with confidence

### Low Confidence → Passive Notification

When Nutrition Agent has low confidence:
- **Show the estimate anyway** with low confidence UI markers
- **Notify user passively**: "Here's what I think, but my confidence is low because [error_sources]"
- **User can optionally clarify**: If they provide more info, we recalculate
- **Don't block**: Never force user to clarify before proceeding

**Why**: User might be fine with the rough estimate. Don't add friction for something they don't care about.

### Direct Routing to Insight Agent

When intent is `audit`, `patterns`, or `summary`:
- Skip Reasoning Agent
- Route directly to Insight Agent
- Faster, cheaper, more focused

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| User corrections per session | High | Low (corrections persist) |
| Clarification questions asked | 0 | ~1 per ambiguous input |
| Audit requests handled | 0 | 100% |
| Exception days classified | 0 | Auto-detected |
| Confidence shown to user | Never | Always on estimates |

---

## Implementation Priority

1. **Nutrition Agent confidence** — High visibility, enables clarification flow
2. **Intent Agent ambiguity** — Prevents silent guessing
3. **Insight Agent upgrade** — Unlocks audit mode and patterns
4. **Learned context memory** — Corrections persist
5. **Health constraints** — Safety-critical
6. **Day type classification** — Better longitudinal analysis

