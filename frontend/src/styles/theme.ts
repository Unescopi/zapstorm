import { createTheme, PaletteMode } from '@mui/material/styles';

export const getTheme = (mode: PaletteMode) => createTheme({
  palette: {
    mode,
    primary: {
      main: '#25D366',
      light: '#50E387',
      dark: '#128C7E',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#34B7F1',
      light: '#5BC8F3',
      dark: '#0A7FA8',
      contrastText: '#FFFFFF',
    },
    background: {
      default: mode === 'light' ? '#F5F5F5' : '#121212',
      paper: mode === 'light' ? '#FFFFFF' : '#1E1E1E',
    },
    text: {
      primary: mode === 'light' ? '#333333' : '#E0E0E0',
      secondary: mode === 'light' ? '#666666' : '#A0A0A0',
    },
    error: {
      main: '#F44336',
    },
    warning: {
      main: '#FFA726',
    },
    info: {
      main: '#29B6F6',
    },
    success: {
      main: '#66BB6A',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 500,
    },
    h2: {
      fontWeight: 500,
    },
    h3: {
      fontWeight: 500,
    },
    h4: {
      fontWeight: 500,
    },
    h5: {
      fontWeight: 500,
    },
    h6: {
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
        containedPrimary: {
          '&:hover': {
            backgroundColor: '#128C7E',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: mode === 'light' 
            ? '0px 2px 6px rgba(0, 0, 0, 0.08)' 
            : '0px 2px 6px rgba(0, 0, 0, 0.25)',
        },
      },
    },
  },
});

// Exportar o tema padrão (claro) para compatibilidade com código existente
const theme = getTheme('light');
export default theme; 