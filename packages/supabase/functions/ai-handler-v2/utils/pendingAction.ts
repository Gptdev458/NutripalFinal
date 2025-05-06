// Pending action helpers for AI handler
// Export setPendingAction, getPendingAction, clearPendingAction
// VERSION 2023-08-15-C: Enhanced serving size handling

export async function setPendingAction(userId: string, action: any, supabaseClient: any) {
  try {
    // Debug logging for serving sizes issue
    if (action && action.type === 'confirm_log_saved_recipe') {
      console.log(`[DEBUG_SERVINGS_CRITICAL] setPendingAction storing 'confirm_log_saved_recipe' with full action:`, JSON.stringify(action));
      
      // Explicitly ensure requested_servings is a number if it exists
      if (action.requested_servings !== undefined) {
        action.requested_servings = Number(action.requested_servings);
        // Log the type to ensure it's properly converted
        console.log(`[DEBUG_SERVINGS_CRITICAL] Converted requested_servings to: ${action.requested_servings} (${typeof action.requested_servings})`);
      } else {
        console.log(`[DEBUG_SERVINGS_CRITICAL] No requested_servings found in action object`);
      }
    }
    
    // Make a safe stringifiable copy of the action to avoid circular references
    const serializedAction = JSON.stringify(action);
    console.log(`[DEBUG_SERVINGS_CRITICAL] Serialized action to store: ${serializedAction}`);
    
    // Convert back to object for any needed property access
    const actionToStore = JSON.parse(serializedAction);
    
    // Check if there's already a pending action for this user
    const { data: existingAction } = await supabaseClient
      .from('pending_actions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Either insert or update
    if (existingAction) {
      // Update the existing record
      const { error } = await supabaseClient
        .from('pending_actions')
        .update({
          action_data: actionToStore,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.error(`Error updating pending action for user ${userId}:`, error);
        throw error;
      }
    } else {
      // Insert a new record
      const { error } = await supabaseClient
        .from('pending_actions')
        .insert({
          user_id: userId,
          action_data: actionToStore,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error(`Error inserting pending action for user ${userId}:`, error);
        throw error;
      }
    }
    console.log(`[DEBUG_SERVINGS_CRITICAL] Successfully set pending action for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Failed to set pending action for user ${userId}:`, error);
    return false;
  }
}

export async function getPendingAction(userId: string, supabaseClient: any) {
  try {
    const { data, error } = await supabaseClient
      .from('pending_actions')
      .select('action_data')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error(`Error getting pending action for user ${userId}:`, error);
      return null;
    }

    if (data && data.action_data) {
      // If we have a confirm_log_saved_recipe action, log details for debugging
      if (data.action_data.type === 'confirm_log_saved_recipe') {
        console.log(`[DEBUG_SERVINGS_CRITICAL] getPendingAction retrieved 'confirm_log_saved_recipe' action:`, JSON.stringify(data.action_data));
        
        // Explicitly ensure requested_servings is a number if it exists
        if (data.action_data.requested_servings !== undefined) {
          const originalValue = data.action_data.requested_servings;
          data.action_data.requested_servings = Number(data.action_data.requested_servings);
          console.log(`[DEBUG_SERVINGS_CRITICAL] getPendingAction converted requested_servings from ${originalValue} (${typeof originalValue}) to ${data.action_data.requested_servings} (${typeof data.action_data.requested_servings})`);
        } else {
          console.log(`[DEBUG_SERVINGS_CRITICAL] WARNING: getPendingAction found no requested_servings in the action_data`);
        }
      }
      
      return data.action_data;
    }
    return null;
  } catch (error) {
    console.error(`Failed to get pending action for user ${userId}:`, error);
    return null;
  }
}

export async function clearPendingAction(userId: string, supabaseClient: any) {
  try {
    console.log(`[DEBUG_SERVINGS_CRITICAL] Clearing pending action for user ${userId}`);
    const { error } = await supabaseClient
      .from('pending_actions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error(`Error clearing pending action for user ${userId}:`, error);
      throw error;
    }
    console.log(`[DEBUG_SERVINGS_CRITICAL] Successfully cleared pending action for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Failed to clear pending action for user ${userId}:`, error);
    return false;
  }
} 