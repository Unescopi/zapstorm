import { useState } from 'react';
import { 
  Box,
  TextField, 
  Button, 
  Typography, 
  Paper, 
  Alert,
  Link as MuiLink,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Send as SendIcon } from '@mui/icons-material';
import { useFormik } from 'formik';
import * as yup from 'yup';
import LogoImage from '../../assets/images/logo.png';

const validationSchema = yup.object({
  email: yup
    .string()
    .email('Digite um email válido')
    .required('Email é obrigatório'),
  password: yup
    .string()
    .min(6, 'A senha deve ter pelo menos 6 caracteres')
    .required('Senha é obrigatória'),
});

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
    },
    validationSchema: validationSchema,
    onSubmit: async (values) => {
      try {
        setError(null);
        await signIn({ email: values.email, password: values.password });
        navigate('/dashboard');
      } catch (err: any) {
        setError(
          err.response?.data?.message || 
          'Erro ao fazer login. Verifique suas credenciais.'
        );
      }
    },
  });

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme => theme.palette.mode === 'dark' ? '#121212' : '#f5f5f5',
      }}
    >
      <Paper
        elevation={4}
        sx={{
          width: '90%',
          maxWidth: '400px',
          padding: '32px',
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <Box 
          component="img" 
          src={LogoImage} 
          alt="ZapStorm Logo" 
          sx={{ 
            height: 120,
            maxWidth: '100%',
            marginBottom: '16px',
          }} 
        />
        
        <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
          Quando a Tempestade Chegar, Você Saberá!
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={formik.handleSubmit}>
          <TextField
            margin="normal"
            fullWidth
            id="email"
            label="Email"
            name="email"
            autoComplete="email"
            autoFocus
            value={formik.values.email}
            onChange={formik.handleChange}
            error={formik.touched.email && Boolean(formik.errors.email)}
            helperText={formik.touched.email && formik.errors.email}
          />
          <TextField
            margin="normal"
            fullWidth
            name="password"
            label="Senha"
            type="password"
            id="password"
            autoComplete="current-password"
            value={formik.values.password}
            onChange={formik.handleChange}
            error={formik.touched.password && Boolean(formik.errors.password)}
            helperText={formik.touched.password && formik.errors.password}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2, py: 1.5 }}
            endIcon={<SendIcon />}
            disabled={formik.isSubmitting}
          >
            {formik.isSubmitting ? 'Entrando...' : 'Entrar'}
          </Button>
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <MuiLink href="#" variant="body2">
              Esqueceu a senha?
            </MuiLink>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
} 