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