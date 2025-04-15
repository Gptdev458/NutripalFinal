import React from 'react';

// Typing Indicator (three animated dots)
const TypingIndicator = () => {
  return (
    <div className="flex items-center space-x-1 h-6">
      <span className="text-xs text-gray-500">AI is typing</span>
      <div className="flex space-x-1">
        {[0, 1, 2].map((dot) => (
          <div
            key={dot}
            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
            style={{
              animationDelay: `${dot * 0.15}s`,
              animationDuration: '0.8s',
            }}
          />
        ))}
      </div>
    </div>
  );
};

// Improved Spinner
const LoadingSpinner = () => {
  return (
    <div className="flex justify-center items-center py-2">
      <div className="relative w-8 h-8">
        <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-blue-100 rounded-full"></div>
        <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    </div>
  );
};

// Example usage component (might remove later if not needed directly)
const LoadingIndicators = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-gray-100 p-4 rounded-lg max-w-xs">
        <TypingIndicator />
      </div>
      
      <div className="bg-gray-100 p-4 rounded-lg max-w-xs">
        <LoadingSpinner />
      </div>
    </div>
  );
};

export default LoadingIndicators; // Default export might be the example

// Export individual components as well
export { TypingIndicator, LoadingSpinner }; 