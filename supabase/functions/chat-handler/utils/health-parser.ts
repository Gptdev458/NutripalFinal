import { createOpenAIClient } from '../../_shared/openai-client.ts';

export interface HealthConstraintUpdate {
    action: 'add' | 'remove';
    category: string;
    type: 'allergy' | 'intolerance' | 'condition' | 'preference';
    severity: 'warning' | 'critical';
    notes?: string;
}

const SYSTEM_PROMPT = `
You are a health constraint parser. Your job is to extract structured health constraints from user messages.
Users will provide info about allergies, intolerances, medical conditions, or dietary preferences.

Output a JSON object with a "updates" array containing objects with:
- action: "add" or "remove"
- category: The specific food, ingredient, or substance (e.g., "peanuts", "dairy", "gluten", "sugar"). Normalize to singular lowercase.
- type: "allergy", "intolerance", "condition" (medical), or "preference" (lifestyle).
- severity: "critical" (life threatening/severe) or "warning" (discomfort/avoidance).
- notes: Short context (e.g., "causes hives", "makes me bloated").

Rules:
1. "I'm vegan" -> add { category: "meat", type: "preference", severity: "critical" }, add { category: "dairy", ... }, etc. OR better: just "animal products".
   Actually, usually specific ingredients are better for checking.
   Let's stick to key ingredients: "meat", "dairy", "eggs", "honey" for vegan?
   NO. Keep it simple. If they say "vegan", adding a "vegan" constraint (type preference) is okay if the checker understands it.
   But generally, decompose if possible.
   However, for this system, we primarily want to flag ingredients.
   "Vegan" -> category: "meat", "dairy", "eggs".
   "Gluten free" -> category: "gluten".
   "Celiac" -> category: "gluten", type: "condition", severity: "critical".

2. "No more dairy allergy" -> remove { category: "dairy" }.

3. Severity:
   - "Allergic", "Die if I eat", "Epi-pen" -> critical.
   - "Intolerant", "Avoid", "Don't like" -> warning.

Example Input: "I have a severe nut allergy and I'm trying to avoid sugar."
Example Output:
{
  "updates": [
    { "action": "add", "category": "nuts", "type": "allergy", "severity": "critical", "notes": "severe allergy" },
    { "action": "add", "category": "sugar", "type": "preference", "severity": "warning", "notes": "trying to avoid" }
  ]
}
`;

export async function parseHealthInput(text: string): Promise<HealthConstraintUpdate[]> {
    const openai = createOpenAIClient();

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text }
        ],
        response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) return [];

    try {
        const result = JSON.parse(content);
        return result.updates || [];
    } catch (e) {
        console.error("Error parsing health input:", e);
        return [];
    }
}
