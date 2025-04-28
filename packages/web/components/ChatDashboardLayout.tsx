'use client'; // Layout might need client-side aspects

import React from 'react';

interface ChatDashboardLayoutProps {
  chatPanel: React.ReactNode;
  dashboardPanel: React.ReactNode;
}

const ChatDashboardLayout: React.FC<ChatDashboardLayoutProps> = ({ chatPanel, dashboardPanel }) => {
  return (
    <div className="flex flex-1 h-full overflow-hidden"> {/* Ensure layout takes full height */}
      {/* Left Panel (Chat) - 50% */}
      <div className="w-1/2 flex flex-col h-full border-r border-gray-200 overflow-hidden">
        {chatPanel}
      </div>

      {/* Right Panel (Dashboard) - 50% */}
      <div className="w-1/2 flex flex-col h-full overflow-y-auto">
        {dashboardPanel}
      </div>
    </div>
  );
};

export default ChatDashboardLayout; 