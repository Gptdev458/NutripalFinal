import { createAdminClient } from '../../_shared/supabase-client.ts';
import { createOpenAIClient } from '../../_shared/openai-client.ts';
import { getStartAndEndOfDay, getDateRange } from '../../_shared/utils.ts';

export class InsightAgent {
  name = 'insight';

  async execute(input: any, context: any) {
    const action = input?.action || 'summary';

    switch (action) {
      case 'audit':
        return this.executeAudit(context);
      case 'patterns':
        return this.executePatterns(context);
      case 'summary':
      default:
        return this.executeSummary(context);
    }
  }

  /**
   * AUDIT: Detailed breakdown of today's logs, identify undercount sources
   * Triggered by: "this seems off", "check my numbers", "audit my day"
   */
  private async executeAudit(context: any) {
    const { userId, supabase: contextSupabase, timezone = 'UTC' } = context;
    const supabase = contextSupabase || createAdminClient();
    const now = new Date();
    const todayRange = getStartAndEndOfDay(now, timezone);

    // Fetch today's logs with full details
    const { data: todayLogs } = await supabase
      .from('food_log')
      .select('*')
      .eq('user_id', userId)
      .gte('log_time', todayRange.start)
      .lte('log_time', todayRange.end)
      .order('log_time', { ascending: true });

    const { data: goals } = await supabase
      .from('user_goals')
      .select('nutrient, target_value, goal_type')
      .eq('user_id', userId);

    // Categorize logs by type for audit
    const categories = {
      meals: [] as any[],
      snacks: [] as any[],
      drinks: [] as any[],
      unknown: [] as any[]
    };

    const totals: Record<string, number> = { calories: 0, protein_g: 0, carbs_g: 0, fat_total_g: 0 };

    if (todayLogs) {
      todayLogs.forEach((log: any) => {
        totals.calories += log.calories || 0;
        totals.protein_g += log.protein_g || 0;
        totals.carbs_g += log.carbs_g || 0;
        totals.fat_total_g += log.fat_total_g || 0;

        const name = (log.food_name || '').toLowerCase();
        if (name.includes('snack') || name.includes('bar') || name.includes('chips')) {
          categories.snacks.push(log);
        } else if (name.includes('water') || name.includes('coffee') || name.includes('tea') || name.includes('juice') || name.includes('soda')) {
          categories.drinks.push(log);
        } else if (log.calories > 100) {
          categories.meals.push(log);
        } else {
          categories.unknown.push(log);
        }
      });
    }

    // Identify likely undercount sources
    const undercountSources: string[] = [];
    const restaurantItems = todayLogs?.filter((l: any) =>
      (l.food_name || '').toLowerCase().match(/restaurant|takeout|order|delivery/)
    ) || [];
    if (restaurantItems.length > 0) {
      undercountSources.push(`Restaurant meals (${restaurantItems.length} items) - hidden oils/butter likely`);
    }
    if (categories.drinks.length === 0 && totals.calories > 500) {
      undercountSources.push('No beverages logged - sweetened drinks often forgotten');
    }
    if (categories.snacks.length === 0 && todayLogs && todayLogs.length > 0) {
      undercountSources.push('No snacks logged - common undercount source');
    }

    // Generate audit report with OpenAI
    const openai = createOpenAIClient();
    const auditPrompt = `
You are auditing a user's food log for today. Provide a brief, bullet-point audit.

Today's Log Items (${todayLogs?.length || 0} entries):
${todayLogs?.map((l: any) => `- ${l.food_name}: ${l.calories}cal, ${l.protein_g}g protein`).join('\n') || 'No logs'}

Totals: ${JSON.stringify(totals)}
Goals: ${JSON.stringify(goals)}

Likely Undercount Sources Detected:
${undercountSources.length > 0 ? undercountSources.map(s => `- ${s}`).join('\n') : '- None detected'}

Provide 3-5 bullet points:
1. What looks accurate
2. What might be missing
3. Specific items that could be undercounted
Keep each bullet under 20 words.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: auditPrompt }],
      max_tokens: 300
    });

    return {
      action: 'audit',
      daily_totals: totals,
      logs_count: todayLogs?.length || 0,
      categories: {
        meals: categories.meals.length,
        snacks: categories.snacks.length,
        drinks: categories.drinks.length
      },
      undercount_sources: undercountSources,
      audit_report: response.choices[0].message.content?.split('\n').filter((s: string) => s.trim()) || [],
      logs: todayLogs?.map((l: any) => ({
        name: l.food_name,
        calories: l.calories,
        time: l.log_time
      })) || []
    };
  }

  /**
   * PATTERNS: 7-day trend analysis, pattern detection
   * Triggered by: "any patterns?", "what's my trend?"
   */
  private async executePatterns(context: any) {
    const { userId, supabase: contextSupabase, timezone = 'UTC' } = context;
    const supabase = contextSupabase || createAdminClient();
    const now = new Date();
    const weekRange = getDateRange(now, 7, timezone);

    const { data: weekLogs } = await supabase
      .from('food_log')
      .select('*')
      .eq('user_id', userId)
      .gte('log_time', weekRange.start)
      .lte('log_time', weekRange.end);

    const { data: goals } = await supabase
      .from('user_goals')
      .select('nutrient, target_value, goal_type')
      .eq('user_id', userId);

    // Group by day
    const dailyData: Record<string, { calories: number, protein_g: number, logs: number }> = {};

    if (weekLogs) {
      weekLogs.forEach((log: any) => {
        const day = new Date(log.log_time).toLocaleDateString('en-US', { weekday: 'short' });
        if (!dailyData[day]) {
          dailyData[day] = { calories: 0, protein_g: 0, logs: 0 };
        }
        dailyData[day].calories += log.calories || 0;
        dailyData[day].protein_g += log.protein_g || 0;
        dailyData[day].logs += 1;
      });
    }

    // Calculate averages
    const days = Object.keys(dailyData).length;
    const avgCalories = days > 0 ? Math.round(Object.values(dailyData).reduce((sum, d) => sum + d.calories, 0) / days) : 0;
    const avgProtein = days > 0 ? Math.round(Object.values(dailyData).reduce((sum, d) => sum + d.protein_g, 0) / days) : 0;

    // Identify patterns
    const patterns: string[] = [];
    const calorieValues = Object.values(dailyData).map(d => d.calories);
    const maxCal = Math.max(...calorieValues);
    const minCal = Math.min(...calorieValues);

    if (maxCal - minCal > 500) {
      patterns.push(`High variability: ${minCal}cal to ${maxCal}cal (${maxCal - minCal} difference)`);
    }

    const weekendDays = Object.entries(dailyData).filter(([day]) => day === 'Sat' || day === 'Sun');
    const weekdayDays = Object.entries(dailyData).filter(([day]) => day !== 'Sat' && day !== 'Sun');
    const weekendAvg = weekendDays.length > 0 ? weekendDays.reduce((sum, [, d]) => sum + d.calories, 0) / weekendDays.length : 0;
    const weekdayAvg = weekdayDays.length > 0 ? weekdayDays.reduce((sum, [, d]) => sum + d.calories, 0) / weekdayDays.length : 0;

    if (weekendAvg > weekdayAvg * 1.2) {
      patterns.push(`Weekend spike: ~${Math.round(weekendAvg - weekdayAvg)} more calories on weekends`);
    }

    // Generate pattern analysis with OpenAI
    const openai = createOpenAIClient();
    const patternPrompt = `
Analyze this 7-day eating data and provide 3-4 brief pattern observations.

Daily Breakdown:
${Object.entries(dailyData).map(([day, data]) => `${day}: ${data.calories}cal, ${data.protein_g}g protein (${data.logs} logs)`).join('\n')}

Averages: ${avgCalories}cal, ${avgProtein}g protein per day
Goals: ${JSON.stringify(goals)}

Detected Patterns: ${patterns.join('; ') || 'None obvious'}

Provide 3-4 bullet points about patterns, trends, or notable observations.
Focus on actionable insights. Keep each bullet under 20 words.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: patternPrompt }],
      max_tokens: 250
    });

    return {
      action: 'patterns',
      days_analyzed: days,
      daily_breakdown: dailyData,
      averages: { calories: avgCalories, protein_g: avgProtein },
      detected_patterns: patterns,
      analysis: response.choices[0].message.content?.split('\n').filter((s: string) => s.trim()) || []
    };
  }

  /**
   * SUMMARY: Daily progress report (original behavior)
   * Triggered by: "how am I doing?", "daily summary"
   */
  private async executeSummary(context: any) {
    const { userId, supabase: contextSupabase, timezone = 'UTC' } = context;
    const supabase = contextSupabase || createAdminClient();
    const now = new Date();
    const todayRange = getStartAndEndOfDay(now, timezone);
    const weekRange = getDateRange(now, 7, timezone);

    const [{ data: todayLogs }, { data: weekLogs }, { data: goals }] = await Promise.all([
      supabase.from('food_log').select('*').eq('user_id', userId).gte('log_time', todayRange.start).lte('log_time', todayRange.end),
      supabase.from('food_log').select('*').eq('user_id', userId).gte('log_time', weekRange.start).lte('log_time', weekRange.end),
      supabase.from('user_goals').select('nutrient, target_value, goal_type').eq('user_id', userId)
    ]);

    const totals: Record<string, number> = {
      calories: 0, protein_g: 0, carbs_g: 0, fat_total_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0
    };

    if (todayLogs) {
      todayLogs.forEach((log: any) => {
        Object.keys(totals).forEach((key) => {
          if (typeof log[key] === 'number') {
            totals[key] += log[key] || 0;
          }
        });
      });
    }

    const weekTotals: Record<string, number> = {
      calories: 0, protein_g: 0, carbs_g: 0, fat_total_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0
    };

    if (weekLogs) {
      weekLogs.forEach((log: any) => {
        Object.keys(weekTotals).forEach((key) => {
          if (typeof log[key] === 'number') {
            weekTotals[key] += log[key] || 0;
          }
        });
      });
    }

    const weeklyAverages: Record<string, number> = {};
    Object.keys(weekTotals).forEach((key) => {
      weeklyAverages[key] = Math.round(weekTotals[key] / 7);
    });

    const progress: Record<string, number> = {};
    if (goals) {
      goals.forEach((goal: any) => {
        const nutrient = goal.nutrient;
        const target = goal.target_value;
        if (totals[nutrient] !== undefined && target > 0) {
          progress[nutrient] = Math.round(totals[nutrient] / target * 100);
        }
      });
    }

    const openai = createOpenAIClient();
    const prompt = `
User's Today's Totals: ${JSON.stringify(totals)}
User's Last 7 Days Averages: ${JSON.stringify(weeklyAverages)}
User's Goals: ${JSON.stringify(goals)}
Today's Progress (%): ${JSON.stringify(progress)}
User Timezone: ${timezone}

Based on the above, provide 2 very short, actionable nutrition suggestions. 
One should focus on today, and one should mention a trend from the last 7 days if relevant.
Example: "You're low on protein today. Try a greek yogurt for your next snack. Your weekly average for fiber is also a bit low."
Keep it under 40 words total.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150
    });

    const suggestions = response.choices[0].message.content?.split('\n').filter((s: string) => s.trim()) || [];

    return {
      action: 'summary',
      daily_totals: totals,
      goal_progress: progress,
      suggestions,
      patterns: [`Weekly avg calories: ${weeklyAverages.calories}kcal`]
    };
  }
}

// Keep legacy export for now
export async function generateInsights(userId: string) {
  const agent = new InsightAgent();
  return agent.execute(undefined, {
    userId,
    supabase: createAdminClient()
  });
}
