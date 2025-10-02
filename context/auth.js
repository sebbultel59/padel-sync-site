// context/auth.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // boot/loading state

  // Restore session from storage on app start
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('auth_token');
        setIsAuthenticated(!!token);
      } catch (e) {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Public API: call on successful sign-in
  async function signIn(token) {
    try {
      await AsyncStorage.setItem('auth_token', token);
      setIsAuthenticated(true);
    } catch (e) {
      // ignore storage errors for now
    }
  }

  // Public API: call to sign out
  async function signOut() {
    try {
      await AsyncStorage.removeItem('auth_token');
    } finally {
      setIsAuthenticated(false);
    }
  }

  const value = useMemo(
    () => ({ isAuthenticated, isLoading, signIn, signOut }),
    [isAuthenticated, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export default function RootLayout() {
    return (
      <AuthProvider>
        <Slot />
      </AuthProvider>
    );
  }