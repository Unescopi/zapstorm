import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useState, useMemo, useContext, ReactNode } from 'react';
import { PaletteMode } from '@mui/material';
import { AuthProvider } from './contexts/AuthContext';
import { getTheme } from './styles/theme';
import Routes from './routes';

// Criando o cliente de consulta React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Criando o contexto do tema
interface ThemeContextType {
  mode: PaletteMode;
  toggleColorMode: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  toggleColorMode: () => {},
});

// Hook personalizado para usar o contexto do tema
export const useThemeContext = () => useContext(ThemeContext);

interface ThemeProviderProps {
  children: ReactNode;
}

// Componente provedor do tema
const CustomThemeProvider = ({ children }: ThemeProviderProps) => {
  // Verificar se há uma preferência salva no localStorage
  const [mode, setMode] = useState<PaletteMode>(() => {
    const savedMode = localStorage.getItem('@ZapStorm:theme');
    return (savedMode as PaletteMode) || 'light';
  });
  
  // Função para alternar o tema
  const toggleColorMode = () => {
    setMode((prevMode) => {
      const newMode = prevMode === 'light' ? 'dark' : 'light';
      // Salvar a preferência no localStorage
      localStorage.setItem('@ZapStorm:theme', newMode);
      return newMode;
    });
  };
  
  // Gerar o tema baseado no modo atual
  const theme = useMemo(() => getTheme(mode), [mode]);
  
  // Valores do contexto
  const themeContextValue = useMemo(
    () => ({
      mode,
      toggleColorMode,
    }),
    [mode]
  );
  
  return (
    <ThemeContext.Provider value={themeContextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CustomThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes />
          </AuthProvider>
        </BrowserRouter>
      </CustomThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
