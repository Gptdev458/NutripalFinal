import { MD3LightTheme as DefaultTheme, configureFonts } from 'react-native-paper';
import { Platform } from 'react-native';

// Define base font settings (adjust font family as needed)
const baseFont = {
  fontFamily: Platform.select({ ios: 'System', android: 'Roboto', default: 'System' }),
};

// Define specific font configurations for different variants
const fontConfig = {
  displayLarge: { ...baseFont, fontSize: 57, fontWeight: '400', letterSpacing: 0 },
  displayMedium: { ...baseFont, fontSize: 45, fontWeight: '400', letterSpacing: 0 },
  displaySmall: { ...baseFont, fontSize: 36, fontWeight: '400', letterSpacing: 0 },

  headlineLarge: { ...baseFont, fontSize: 32, fontWeight: '400', letterSpacing: 0 },
  headlineMedium: { ...baseFont, fontSize: 28, fontWeight: '400', letterSpacing: 0 },
  headlineSmall: { ...baseFont, fontSize: 24, fontWeight: '400', letterSpacing: 0 },

  titleLarge: { ...baseFont, fontSize: 22, fontWeight: '500', letterSpacing: 0 },
  titleMedium: { ...baseFont, fontSize: 16, fontWeight: '500', letterSpacing: 0.15 },
  titleSmall: { ...baseFont, fontSize: 14, fontWeight: '500', letterSpacing: 0.1 },

  labelLarge: { ...baseFont, fontSize: 14, fontWeight: '500', letterSpacing: 0.1 },
  labelMedium: { ...baseFont, fontSize: 12, fontWeight: '500', letterSpacing: 0.5 },
  labelSmall: { ...baseFont, fontSize: 11, fontWeight: '500', letterSpacing: 0.5 },

  bodyLarge: { ...baseFont, fontSize: 16, fontWeight: '400', letterSpacing: 0.15 },
  bodyMedium: { ...baseFont, fontSize: 14, fontWeight: '400', letterSpacing: 0.25 },
  bodySmall: { ...baseFont, fontSize: 12, fontWeight: '400', letterSpacing: 0.4 },
};

const theme = {
  ...DefaultTheme,
  roundness: 12,
  colors: {
    ...DefaultTheme.colors,
    primary: '#4CAF50',
    secondary: '#007AFF',
    tertiary: '#FF9500',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    error: '#FF3B30',
    text: '#333333',
    textSecondary: '#666666',
    success: '#34C759',
    warning: '#FF9500',
    // MD3 will derive onPrimary, onSecondary, etc. unless overridden here
  },
  fonts: configureFonts({ config: fontConfig }), // Add the configured fonts
};

export default theme;

// App-wide theme constants
export const colors = {
  primary: '#007AFF',        // iOS blue
  secondary: '#5AC8FA',      // Light blue
  success: '#34C759',        // Green
  warning: '#FF9500',        // Orange
  danger: '#FF3B30',         // Red
  info: '#5856D6',           // Purple
  
  background: '#F5F5F5',     // Light gray background
  card: '#FFFFFF',           // Card background
  text: '#333333',           // Primary text
  textLight: '#666666',      // Secondary text
  border: '#E0E0E0',         // Border color
  
  statusBar: 'dark-content',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const typography = {
  headerLarge: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerSmall: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
  },
  body: {
    fontSize: 16,
    color: colors.text,
  },
  caption: {
    fontSize: 14,
    color: colors.textLight,
  },
};

export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
}; 