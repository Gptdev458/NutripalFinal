// Standardized confirmation policy for user actions

/**
 * Types of user actions that might require confirmation
 */
export enum ActionType {
  LOG_FOOD = 'log_food',
  DELETE_FOOD = 'delete_food',
  SAVE_RECIPE = 'save_recipe',
  LOG_RECIPE = 'log_recipe',
  UPDATE_GOAL = 'update_goal',
  ANALYZE_RECIPE = 'analyze_recipe',
}

/**
 * Context passed to determine if confirmation is needed
 */
export interface ConfirmationContext {
  userId: string;
  actionType: ActionType;
  confidence?: number;      // Confidence score for the action (0-100)
  isHighImpact?: boolean;   // Whether the action has significant consequences
  hasCompleteData?: boolean; // Whether all necessary data is available
  itemName?: string;        // Name of the item being affected
  [key: string]: any;       // Additional context-specific properties
}

/**
 * Policy response determining whether confirmation is needed
 */
export interface ConfirmationPolicy {
  requireConfirmation: boolean;
  confirmationMessage: string | null;
  autoConfirmationThreshold: number; // Confidence level for auto-confirmation
}

/**
 * Default confirmation thresholds by action type
 */
const DEFAULT_THRESHOLDS = {
  [ActionType.LOG_FOOD]: 90,
  [ActionType.DELETE_FOOD]: 100, // Always confirm deletions
  [ActionType.SAVE_RECIPE]: 80,
  [ActionType.LOG_RECIPE]: 90,
  [ActionType.UPDATE_GOAL]: 95,
  [ActionType.ANALYZE_RECIPE]: 70,
};

/**
 * Generate appropriate confirmation messages based on action type and context
 */
function getConfirmationMessage(actionType: ActionType, context: ConfirmationContext): string {
  const itemName = context.itemName || 'this item';
  
  switch (actionType) {
    case ActionType.LOG_FOOD:
      return `Would you like to log ${itemName}?`;
    
    case ActionType.DELETE_FOOD:
      return `Are you sure you want to delete ${itemName} from your food log?`;
    
    case ActionType.SAVE_RECIPE:
      return `Would you like to save this as "${itemName}" for future use?`;
    
    case ActionType.LOG_RECIPE:
      return `Would you like to log ${itemName} now?`;
    
    case ActionType.UPDATE_GOAL:
      return `Would you like to set ${itemName} as your goal?`;
    
    case ActionType.ANALYZE_RECIPE:
      return `Would you like me to analyze the nutritional content of ${itemName}?`;
    
    default:
      return `Would you like to proceed with this action?`;
  }
}

/**
 * Determines whether a confirmation is required based on action type and context
 */
export function getConfirmationPolicy(context: ConfirmationContext): ConfirmationPolicy {
  const { 
    actionType, 
    confidence = 0, 
    isHighImpact = false,
    hasCompleteData = false
  } = context;
  
  // Threshold for this action type (default or overridden)
  const threshold = DEFAULT_THRESHOLDS[actionType] || 90;
  
  // Actions that should always require confirmation
  if (isHighImpact || actionType === ActionType.DELETE_FOOD) {
    return {
      requireConfirmation: true,
      confirmationMessage: getConfirmationMessage(actionType, context),
      autoConfirmationThreshold: 100 // Effectively require explicit confirmation
    };
  }
  
  // Actions with complete data and high confidence might not need confirmation
  if (hasCompleteData && confidence >= threshold) {
    return {
      requireConfirmation: false,
      confirmationMessage: null,
      autoConfirmationThreshold: threshold
    };
  }
  
  // Default to requiring confirmation
  return {
    requireConfirmation: true,
    confirmationMessage: getConfirmationMessage(actionType, context),
    autoConfirmationThreshold: threshold
  };
}

/**
 * Checks if the user's response is an affirmative confirmation
 */
export function isConfirmationResponse(response: string): boolean {
  if (!response) return false;
  
  const affirmativeResponses = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'fine',
    'confirm', 'confirmed', 'approve', 'approved', 'accept', 'agreed',
    'do it', 'please do', 'go ahead', 'sounds good', 'proceed',
    'y', 'ye', 'ya', 'yea'
  ];
  
  const lowerResponse = response.toLowerCase().trim();
  
  return affirmativeResponses.some(term => {
    // Check for exact match
    if (lowerResponse === term) return true;
    
    // Check for match at start of response
    if (lowerResponse.startsWith(`${term} `)) return true;
    
    // Check for match with punctuation
    if (lowerResponse === `${term}.` || lowerResponse === `${term}!`) return true;
    
    return false;
  });
} 