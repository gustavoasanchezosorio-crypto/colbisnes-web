'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { THEME } from '@/lib/theme';

type AppContextType = {
  theme: typeof THEME;
  session: any;
  isAuthenticated: boolean;
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session } = useSession();
  const value = useMemo(() => ({
    theme: THEME,
    session,
    isAuthenticated: !!session,
  }), [session]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
