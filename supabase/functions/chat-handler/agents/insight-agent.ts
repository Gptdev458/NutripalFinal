import { createAdminClient } from '../../_shared/supabase-client.ts';
import { createOpenAIClient } from '../../_shared/openai-client.ts';
import { DbService } from '../services/db-service.ts';

/**
 * InsightAgent
 * Specialist for forensic analysis, audits, and pattern recognition.
 * Upgraded to "Forensic Health Analyst" persona (Feature 5).
 */
export class InsightAgent {
  name = 'insight';

  async execute(input: any, context: any) {
    const action = input?.action || 'summary';
    const query = input?.query || '';
    const filters = input?.filters || {};

    console.log(`[InsightAgent] Executing ${action} with query: "${query}"`, filters);

    switch (action) {
      case 'audit':
        return this.executeAudit(context, query, filters);
      case 'patterns':
        return this.executePatterns(context, query, filters);
      case 'reflect':
        return this.executeReflect(context, query, filters);
      case 'classify_day':
        return this.executeClassifyDay(context, input?.day_type, input?.notes);
      case 'summary':
      default:
        return this.executeSummary(context, filters);
    }
  }

  private async executeAudit(context: any, query: string, filters: any) {
    const userId = context.userId;
    const { logs, classifications } = await context.db.getHistoricalData(userId, { days: 7 });
    const dayClass = await context.db.getDayClassification(userId, new Date().toISOString().split('T')[0]);
    const goals = await context.db.getUserGoals(userId);

    // Streamline logs for prompt to prevent timeouts
    const streamlinedLogs = logs.map((l: any) => ({
      name: l.food_name,
      cals: l.calories,
      macros: `P:${Math.round(l.protein)} C:${Math.round(l.carbs)} F:${Math.round(l.fat)}`,
      time: l.log_time
    }));

    const auditPrompt = `
    You are a Forensic Nutrition Analyst. Audit the user's food log for today.
    
    Context:
    - User Goals: ${JSON.stringify(goals)}
    - Day Type: ${dayClass?.day_type || 'normal'}
    - User Inquiry: "${query}"

    Task:
    1. Identify Entropy: Find unlogged gaps (e.g., long periods without food).
    2. Statistical Outliers: Flag entries that look unusual for those items.
    3. Nutritional Discordance: Check if logged items match core goal profiles.
    
    Format: 3-5 punchy bullets. Focus on "Debugging the model, not correcting the user."
    If day type is 'travel' or 'social', acknowledge that baseline shifts (e.g., higher sodium) are contextual.
    `;

    const openai = createOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: auditPrompt },
        { role: "user", content: `Recent Logs for Review: ${JSON.stringify(streamlinedLogs)}` }
      ],
    });

    return {
      action: 'audit',
      audit_report: response.choices[0].message.content,
      data_snapshot: { logs_count: logs.length, day_type: dayClass?.day_type }
    };
  }

  private async executePatterns(context: any, query: string, filters: any) {
    const userId = context.userId;
    const days = filters.days || 7;

    // Use summarized data for patterns to keep prompt size small
    const analysisData = await context.db.getAnalyticalData(userId, days);

    const patternPrompt = `
    You are a Data Analyst. Look for structural patterns and directional insights.
    
    Target: ${query || 'General patterns'}
    History: ${days} days
    Daily Totals (Summarized): ${JSON.stringify(analysisData.dailyTotals)}
    Special Context: ${JSON.stringify(analysisData.classifications)}

    Distinction:
    - Patterns: Recurring behaviors (3+ times). Suggest one "Structural Fix".
    - Insights: Directional trends or observations (even if not a strict pattern).
    
    Format: 3-5 bullets. Non-preachy, context-aware.
    `;

    const openai = createOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: patternPrompt }],
    });

    return {
      action: 'patterns',
      analysis: response.choices[0].message.content,
      history_range: days
    };
  }

  private async executeReflect(context: any, query: string, filters: any) {
    const userId = context.userId;
    // CRITICAL: Use summarized data to prevent timeouts
    const analysisData = await context.db.getAnalyticalData(userId, 7);

    const reflectPrompt = `
    Analyze how today compares to the previous 7 days.
    
    Summarized Data: ${JSON.stringify(analysisData)}
    User Focus: "${query}"

    Task: Identify the "One Big Lever" for tomorrow.
    Contrast the metrics without being preachy. If today was a "social" or "travel" day, contextualize the variance.
    `;

    const openai = createOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: reflectPrompt }],
    });

    return {
      action: 'reflect',
      reflection: response.choices[0].message.content
    };
  }

  private async executeClassifyDay(context: any, dayType: string, notes: string) {
    const today = new Date().toISOString().split('T')[0];
    await context.db.setDayClassification(context.userId, today, dayType, notes);

    return {
      action: 'classify_day',
      status: 'confirmed',
      day_type: dayType
    };
  }

  private async executeSummary(context: any, filters: any) {
    const userId = context.userId;
    const days = filters.days || 1;
    const { logs } = await context.db.getHistoricalData(userId, { days });

    const summaryPrompt = `
    Provide a compressed summary. 
    Hard Rules: Bullets only, 3-5 max, one idea per bullet. No moral tone.
    Answer: What mattered, what didn't, one takeaway, one adjustment.
    
    Logs: ${JSON.stringify(logs.slice(-10))} 
    `;

    const openai = createOpenAIClient();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: summaryPrompt }],
    });

    return {
      action: 'summary',
      summary: response.choices[0].message.content
    };
  }
}
