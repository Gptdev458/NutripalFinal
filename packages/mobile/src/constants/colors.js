/**
 * Centralized color palette for the application.
 */
export const Colors = {
  primary: '#121212',       // Near-black for main text, headers
  background: '#FFFFFF',   // White for screen backgrounds
  accent: '#4CAF50',       // NEW: Material Design Green 500 - for buttons, highlights, active elements
  grey: '#8E8E93',         // Medium grey for secondary text, borders
  lightGrey: '#E5E5EA',     // Light grey for dividers, inactive elements, input backgrounds
  error: '#FF3B30',        // Standard iOS red for error messages/indicators
  success: '#34C759',      // Standard iOS green for success indicators (keeping distinct from accent)
  warning: '#FF9500',      // Standard iOS orange for warnings
  // Added textSecondary for consistency if needed elsewhere
  text: '#121212',         // Explicit primary text color (same as primary)
  textSecondary: '#8E8E93', // Explicit secondary text color (same as grey)
  surface: '#FFFFFF',      // Explicit surface color (cards, etc. - same as background)
  divider: '#E5E5EA',      // Explicit divider color (same as lightGrey)
  disabled: '#BDBDBD',     // Added a specific disabled color
};

/**
 * Helper function to get a color by name.
 * @param {string} colorName - The name of the color (e.g., 'primary', 'accent')
 * @returns {string} The hex code for the color, or a default grey if not found.
 */
export const getColor = (colorName) => {
  return Colors[colorName] || Colors.grey;
}; 