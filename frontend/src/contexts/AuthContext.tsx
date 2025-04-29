import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextData {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  signIn: (credentials: { email: string; password: string }) => Promise<void>;
  signOut: () => void;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStorageData() {
      const storedToken = localStorage.getItem('@ZapStorm:token');
      const storedUser = localStorage.getItem('@ZapStorm:user');

      if (storedToken && storedUser) {
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        setUser(JSON.parse(storedUser));
      }

      setLoading(false);
    }

    loadStorageData();
  }, []);

  async function signIn({ email, password }: { email: string; password: string }) {
    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      });

      const { token, user } = response.data;

      localStorage.setItem('@ZapStorm:token', token);
      localStorage.setItem('@ZapStorm:user', JSON.stringify(user));

      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      setUser(user);
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      throw error;
    }
  }

  function signOut() {
    localStorage.removeItem('@ZapStorm:token');
    localStorage.removeItem('@ZapStorm:user');
    setUser(null);
    
    delete api.defaults.headers.common['Authorization'];
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }

  return context;
} 