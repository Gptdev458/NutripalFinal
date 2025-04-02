import { useTheme } from 'react-native-paper';
import appTheme from '../theme/index.js'; // Default fallback theme

/**
 * A hook that safely retrieves the React Native Paper theme.
 * If useTheme() fails (e.g., during initial render before Provider is ready),
 * it returns a default fallback theme to prevent crashes.
 */
const useSafeTheme = () => {
  try {
    // Attempt to get the theme from the provider
    const theme = useTheme();
    // Check if the theme object is valid (basic check)
    if (theme && theme.colors && theme.fonts) {
      return theme;
    }
    // Fallback if the theme object seems incomplete/invalid
    console.warn('useSafeTheme: Theme from context seems invalid, using default fallback.');
    return appTheme;
  } catch (error) {
    // Log the error for debugging (optional)
    console.warn('useSafeTheme: Failed to get theme from context, using default fallback.', error);
    // Return the default theme if useTheme fails
    return appTheme;
  }
};

export default useSafeTheme; 