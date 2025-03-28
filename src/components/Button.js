import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ActivityIndicator 
} from 'react-native';

const Button = ({ 
  title, 
  onPress, 
  disabled = false, 
  loading = false,
  type = 'primary', // 'primary', 'secondary', 'danger'
  size = 'medium', // 'small', 'medium', 'large'
  style,
  textStyle
}) => {
  
  const getButtonStyle = () => {
    let baseStyle = [styles.button];
    
    // Add type style
    if (type === 'primary') baseStyle.push(styles.primaryButton);
    if (type === 'secondary') baseStyle.push(styles.secondaryButton);
    if (type === 'danger') baseStyle.push(styles.dangerButton);
    
    // Add size style
    if (size === 'small') baseStyle.push(styles.smallButton);
    if (size === 'large') baseStyle.push(styles.largeButton);
    
    // Add disabled style
    if (disabled || loading) baseStyle.push(styles.disabledButton);
    
    // Add custom style
    if (style) baseStyle.push(style);
    
    return baseStyle;
  };
  
  const getTextStyle = () => {
    let baseTextStyle = [styles.buttonText];
    
    // Add type text style
    if (type === 'secondary') baseTextStyle.push(styles.secondaryButtonText);
    if (type === 'danger') baseTextStyle.push(styles.dangerButtonText);
    
    // Add size text style
    if (size === 'small') baseTextStyle.push(styles.smallButtonText);
    if (size === 'large') baseTextStyle.push(styles.largeButtonText);
    
    // Add disabled text style
    if (disabled || loading) baseTextStyle.push(styles.disabledButtonText);
    
    // Add custom text style
    if (textStyle) baseTextStyle.push(textStyle);
    
    return baseTextStyle;
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator 
          size="small" 
          color={type === 'secondary' ? '#007AFF' : '#FFFFFF'} 
        />
      ) : (
        <Text style={getTextStyle()}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  smallButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  largeButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
  dangerButtonText: {
    color: '#FFFFFF',
  },
  smallButtonText: {
    fontSize: 14,
  },
  largeButtonText: {
    fontSize: 18,
  },
  disabledButtonText: {
    opacity: 0.8,
  },
});

export default Button; 