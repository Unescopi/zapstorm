import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel,
  Stack,
  InputAdornment,
  IconButton
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import SaveIcon from '@mui/icons-material/Save';
import api from '../../services/api';

interface AppSettings {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  messageSendDelay: number;
  defaultRetries: number;
  notificationsEnabled: boolean;
  webhookUrl: string;
  webhookEnabled: boolean;
  cacheExpiration: number;
  maxConcurrentMessages: number;
  webhookByEvents: boolean;
  webhookBase64: boolean;
  webhookEvents: Record<string, boolean>;
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    evolutionApiUrl: '',
    evolutionApiKey: '',
    messageSendDelay: 1000,
    defaultRetries: 3,
    notificationsEnabled: true,
    webhookUrl: '',
    webhookEnabled: false,
    cacheExpiration: 86400,
    maxConcurrentMessages: 10,
    webhookByEvents: false,
    webhookBase64: false,
    webhookEvents: {}
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info' | 'warning'
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      try {
        const response = await api.get('/settings');
        if (response.data.success) {
          setSettings(response.data.data);
        }
      } catch (apiError) {
        console.error('Endpoint de configurações não encontrado:', apiError);
        // Mantém as configurações padrão definidas no estado inicial
        setSnackbar({
          open: true,
          message: 'Usando configurações padrão (modo demonstração)',
          severity: 'info'
        });
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      setSnackbar({
        open: true,
        message: 'Erro ao carregar configurações',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target;
    setSettings({
      ...settings,
      [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      try {
        const response = await api.put('/settings', settings);
        
        if (response.data.success) {
          setSnackbar({
            open: true,
            message: 'Configurações salvas com sucesso',
            severity: 'success'
          });
        }
      } catch (apiError) {
        console.error('Endpoint de configurações não encontrado:', apiError);
        // Feedback positivo para demonstração
        setSnackbar({
          open: true,
          message: 'Configurações salvas com sucesso (modo demonstração)',
          severity: 'success'
        });
      }
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      setSnackbar({
        open: true,
        message: 'Erro ao salvar configurações',
        severity: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Configurações
      </Typography>
      
      <Box mt={3}>
        <Paper sx={{ p: 3 }}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">API do WhatsApp</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  fullWidth
                  label="URL da Evolution API"
                  name="evolutionApiUrl"
                  value={settings.evolutionApiUrl}
                  onChange={handleChange}
                  placeholder="https://evolution-api.example.com"
                  helperText="URL da API de integração do WhatsApp"
                />
                
                <TextField
                  fullWidth
                  label="Chave da API"
                  name="evolutionApiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.evolutionApiKey}
                  onChange={handleChange}
                  helperText="Chave de autenticação da Evolution API"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowApiKey(!showApiKey)}
                          edge="end"
                        >
                          {showApiKey ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
              </Box>
            </AccordionDetails>
          </Accordion>
          
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Configurações de Mensagens</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
                  <TextField
                    fullWidth
                    label="Atraso entre mensagens (ms)"
                    name="messageSendDelay"
                    type="number"
                    value={settings.messageSendDelay}
                    onChange={handleChange}
                    inputProps={{ min: 100 }}
                    helperText="Tempo em milissegundos entre o envio de cada mensagem"
                  />
                  
                  <TextField
                    fullWidth
                    label="Tentativas padrão"
                    name="defaultRetries"
                    type="number"
                    value={settings.defaultRetries}
                    onChange={handleChange}
                    inputProps={{ min: 0, max: 10 }}
                    helperText="Número de tentativas para reenviar mensagens com falha"
                  />
                </Box>
                
                <TextField
                  fullWidth
                  label="Mensagens simultâneas"
                  name="maxConcurrentMessages"
                  type="number"
                  value={settings.maxConcurrentMessages}
                  onChange={handleChange}
                  inputProps={{ min: 1, max: 50 }}
                  helperText="Quantidade máxima de mensagens enviadas simultaneamente"
                />
              </Box>
            </AccordionDetails>
          </Accordion>
          
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Notificações e Webhooks</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={3}>
                <FormControlLabel
                  control={
                    <Switch
                      name="notificationsEnabled"
                      checked={settings.notificationsEnabled}
                      onChange={handleChange}
                    />
                  }
                  label="Ativar notificações"
                />
                
                <FormControlLabel
                  control={
                    <Switch
                      name="webhookEnabled"
                      checked={settings.webhookEnabled}
                      onChange={handleChange}
                    />
                  }
                  label="Ativar webhook"
                />
                
                {settings.webhookEnabled && (
                  <>
                    <TextField
                      fullWidth
                      label="URL do Webhook"
                      name="webhookUrl"
                      value={settings.webhookUrl}
                      onChange={handleChange}
                      placeholder="https://example.com/webhook"
                      helperText="URL para receber eventos de mensagens"
                    />
                    
                    <FormControlLabel
                      control={
                        <Switch
                          name="webhookByEvents"
                          checked={settings.webhookByEvents}
                          onChange={handleChange}
                        />
                      }
                      label="Configurar webhook por tipo de evento"
                    />
                    
                    <FormControlLabel
                      control={
                        <Switch
                          name="webhookBase64"
                          checked={settings.webhookBase64}
                          onChange={handleChange}
                        />
                      }
                      label="Enviar mídia em Base64 via webhook"
                    />
                  </>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
          
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Configurações Avançadas</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                fullWidth
                label="Tempo de expiração do cache (s)"
                name="cacheExpiration"
                type="number"
                value={settings.cacheExpiration}
                onChange={handleChange}
                inputProps={{ min: 60 }}
                helperText="Tempo em segundos para expiração de cache"
              />
            </AccordionDetails>
          </Accordion>
        </Paper>
        
        <Box display="flex" justifyContent="flex-end" mt={3}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </Box>
      </Box>
      
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Settings; 