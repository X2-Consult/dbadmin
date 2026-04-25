'use client';
import { createContext, useContext, useState } from 'react';

interface ConnCtx {
  connId: string;
  setConnId: (id: string) => void;
}

const ConnectionContext = createContext<ConnCtx>({ connId: 'default', setConnId: () => {} });

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connId, setConnId] = useState('default');
  return (
    <ConnectionContext.Provider value={{ connId, setConnId }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export const useConn = () => useContext(ConnectionContext);
