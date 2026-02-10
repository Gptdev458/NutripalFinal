# Feature 5: Insight Agent Upgrade (Refined v3)

## 1. Vision: The Forensic Health Analyst
Leverage LLM intelligence to transform data from a "diary" into an "auditable scenario map." This agent acts as a thinking partner that prioritize **why** and **so what** over "what."

**Core Documentation References:**
- [Devplan.md](file:///c:/Users/ianku/Desktop/cursor%20projects/Joshs%20Food%20App/docs/Devplan.md)
- [Architecture Upgrade](file:///c:/Users/ianku/Desktop/cursor%20projects/Joshs%20Food%20App/docs/architecture%20upgrade.md)
- [Features and Behavior](file:///c:/Users/ianku/Desktop/cursor%20projects/Joshs%20Food%20App/docs/Key%20fetures%20and%20behavior/Features%20and%20behavior.md)

---

## 2. Intelligence Framework

### A. Deep-Dive Audit (`action: 'audit'`)
- **Philosophy**: Forensic accounting for nutrition. 
- **LLM Reasoning**: Instead of rigid keyword checks, the agent looks for **entropy and gaps**.
    - *Temporal Analysis*: Detecting unlogged gaps during active hours.
    - *Outlier Detection*: Flagging caloric entries that deviate significantly from your historical norm (e.g., "1200 cal breakfast vs 300 cal average").
    - *Transparency*: Surfaces the raw math behind conclusions ("Your sodium is high because of the [X] and [Y] entries").

### B. Flexible Contextual Analysis (`action: 'analyze'`)
- **Pattern vs. Insight**:
    - **Patterns (3+ repeats)**: Lead to "Structural Fix" suggestions (e.g., "Prep your lunch on travel days").
    - **Insights (Trends/Noise)**: Non-preachy observations (e.g., "Protein has been trending lower this week").
- **Smart Filters**: Analyze specific subsets of data (e.g., "How do I eat on travel days?", "Compare weekends to weekdays").

### C. Mode-Aware Reflection (`action: 'reflect'`)
- **Day Classification**: 'Normal', 'Travel', 'Sick', etc.
- **Contextual Targets**: When traveling, the agent acknowledges that sodium/calorie baselines shift. It doesn't penalize; it **contextualizes**. 
- **Interaction Stance**: collaborative. If "travel" pattern is detected, it asks the user: "Your logs look like a travel day. Should I adjust my analysis for today?"

---

## 3. Tooling: Context over Rigidity

### `ask_insight_agent` Interface
The tool is redesigned to be a **natural language interface for the analyst**.
- **Signature**: `ask_insight_agent(query: string, context?: object, filters?: object)`
- **Example Call**: `ask_insight_agent("Identify why my fiber is low this weekend compared to my usual baseline", { day_type: 'travel' })`

### Selectivity (Anti-Bloat)
- **Direct Routing**: IntentAgent routes direct requests (`audit`, `summary`, `patterns`) to Insight Agent.
- **Selective Validation**: Reasoning Agent only calls it when it needs historical depth to validate a complex plan or resolve a contradiction (e.g., "User wants to log [X], but it puts them way over their 7-day average. Is this typical?").

---

## 4. Implementation Plan

### Phase 1: Data & DB
- `daily_classification` table for exception day tracking.
- Enhance `DbService` to support filtered historical queries (by `day_type`, `time_range`).

### Phase 2: Analyst Intelligence
- Build the "Forensic Analyst" prompts in `insight-agent.ts`.
- Implement flexible `query` parsing to gather appropriate data dynamically.

### Phase 3: Orchestration & Triage
- Update `IntentAgent` to detect "Audit" vs "Correction" intents.
- Update `orchestrator_v3.ts` to pass rich session context to the Insight Agent.

### Phase 4: Non-Preachy UI
- Final response formatting via `ChatAgent` to ensure "Negotiation Stance" (3-5 bullets, no moral framing).
