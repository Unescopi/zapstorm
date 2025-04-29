import React from 'react';
import { AuthProvider as AuthContextProvider, useAuth } from '../../contexts/AuthContext';

export { useAuth };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContextProvider>{children}</AuthContextProvider>;
}

export function useAuthContext() {
  return useAuth();
}

export default AuthProvider; 