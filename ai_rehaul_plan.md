# AI Handler Rehaul Plan

## Rationale
- Current AI handler is rigid and brittle; user experience feels like a basic chatbot.
- AI only works well for pre-coded flows; fails to act naturally or flexibly in unanticipated scenarios.
- Modern users expect a ChatGPT-like experience: natural conversation, context awareness, and seamless tool use.

## Goals
- Every user message is processed by OpenAI with access to all available tools (function calling).
- AI should infer intent, use tools as needed, and generate natural, context-aware responses.
- User experience should feel like chatting with a modern AI assistant, not a scripted bot.
- Minimize backend routing logic; let OpenAI handle intent/tool selection.
- Preserve robust error handling, context/history, and frontend contract.

## Target Architecture
- **All user messages** are sent to OpenAI with the full set of tool definitions.
- **OpenAI decides** when and how to call tools (functions) based on user input and conversation context.
- **Backend executes** tool calls and returns results to OpenAI for final response generation.
- **Context and history** are preserved and sent with each request for continuity.
- **Frontend** may need updates to handle new response types and conversational flows.

## Key Steps
1. **Audit and Refine Tool Definitions**
   - Ensure all tools (functions) are clearly defined, safe, and robust.
   - Add/adjust descriptions and parameters for clarity and safety.
2. **Refactor Handler Logic**
   - Remove brittle, hand-coded routing and intent detection.
   - Route all messages through OpenAI with tool definitions and context/history.
   - Implement tool execution and result passing to OpenAI for response generation.
3. **Context and History Management**
   - Ensure conversation history and relevant user context are included in each OpenAI call.
   - Handle multi-turn flows and tool follow-ups naturally.
4. **Error Handling and Fallbacks**
   - Ensure all tool executions have robust error handling and user-friendly fallback messages.
   - Handle OpenAI or backend errors gracefully.
5. **Frontend/Contract Updates**
   - Update frontend to handle new response types, multi-turn flows, and tool-driven actions.
   - Ensure smooth user experience and clear feedback.
6. **Testing and Validation**
   - Test all major flows, edge cases, and error scenarios.
   - Validate that the AI feels natural, flexible, and robust.
   - Monitor cost and latency impacts.

## Risks & Considerations
- **Increased OpenAI API usage** (cost, latency).
- **Tool safety:** Ensure all tools are idempotent and have proper validation.
- **Frontend compatibility:** May require updates to handle new conversational patterns.
- **Migration complexity:** Large refactor; requires careful testing and rollout.

## Next Steps
1. Finalize tool definitions and descriptions.
2. Refactor backend handler to route all messages through OpenAI with tools.
3. Update context/history management.
4. Update frontend as needed.
5. Test, validate, and iterate.

## Tool Audit & Refinement Checklist

### Current Tools & Suggestions

1. **logGenericFoodItem**
   - Purpose: Log a simple, standard food item (e.g., "log a banana").
   - Suggestions:
     - Clarify ambiguous cases (e.g., "sandwich").
     - Validate input for empty/nonsensical items.
     - Confirm with user what was logged.

2. **findSavedRecipeByName**
   - Purpose: Search user's saved recipes by name.
   - Suggestions:
     - Specify behavior for multiple/no matches.
     - Limit search results and prompt for clarification if needed.
     - Handle empty queries.

3. **analyzeRecipeIngredients**
   - Purpose: Analyze a recipe's ingredients to estimate nutrition.
   - Suggestions:
     - Specify required format for ingredients list.
     - Validate both fields are present and parseable.
     - Summarize analysis and offer next steps (save, log, etc.).

4. **clarifyDishType**
   - Purpose: Ask user to clarify if a dish is homemade or standard.
   - Suggestions:
     - Give examples of ambiguous dishes.
     - Ask clear, friendly questions.

5. **logExistingSavedRecipe**
   - Purpose: Log a specific saved recipe by ID.
   - Suggestions:
     - Validate recipe exists and belongs to user.
     - Confirm with user what was logged.
     - Handle errors gracefully.

6. **answerGeneralQuestion**
   - Purpose: Answer general health, nutrition, or app usage questions.
   - Suggestions:
     - Clarify scope (avoid medical advice).
     - Provide helpful, conversational answers.

### General Improvements
- Add more examples and edge case handling to tool descriptions.
- Ensure all tools have strong input validation and error handling.
- Ensure all tool results are user-friendly and handle ambiguity.
- Consider new tools for editing/deleting logs, setting goals, or reminders if needed.

### Refinement Checklist
- [ ] Update tool descriptions for clarity, examples, and edge cases.
- [ ] Implement/verify input validation for all tools.
- [ ] Ensure user-friendly feedback for all tool results.
- [ ] Review if additional tools are needed for full user experience.
- [ ] Document all changes and rationale in this plan.

---

**Notes:**
- This document should be updated as the project progresses.
- All architectural and implementation decisions should be recorded here for future reference. 