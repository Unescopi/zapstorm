import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  FormControlLabel,
  Switch,
  Button,
  Chip,
  FormGroup,
  Divider,
  Alert,
  CircularProgress,
  Grid
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

const AVAILABLE_EVENTS = [
  'APPLICATION_STARTUP',
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_SET',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'SEND_MESSAGE',
  'CONTACTS_SET',
  'CONTACTS_UPSERT',
  'CONTACTS_UPDATE',
  'PRESENCE_UPDATE',
  'CHATS_SET',
  'CHATS_UPDATE',
  'CHATS_UPSERT',
  'CHATS_DELETE',
  'GROUPS_UPSERT',
  'GROUPS_UPDATE',
  'GROUP_PARTICIPANTS_UPDATE',
  'NEW_TOKEN',
  'CALL',
  'TYPEBOT_START',
  'TYPEBOT_CHANGE_STATUS'
];

const InstanceWebhookConfig = ({ instanceId, instanceName }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  
  const [webhookConfig, setWebhookConfig] = useState({
    enabled: false,
    url: '',
    webhookByEvents: false,
    base64: false,
    events: []
  });
  
  // Carregar configuração atual
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/webhook/config/${instanceName}`);
        
        if (response.data.success && response.data.data) {
          setWebhookConfig(response.data.data);
        }
      } catch (err) {
        // Se não encontrou configuração, apenas continua com o estado inicial
        if (err.response?.status !== 404) {
          setError('Erro ao carregar configuração: ' + (err.response?.data?.message || err.message));
        }
      } finally {
        setLoading(false);
      }
    };
    
    if (instanceName) {
      fetchConfig();
    }
  }, [instanceName]);
  
  // Atualizar campo específico do formulário
  const handleChange = (e) => {
    const { name, value } = e.target;
    setWebhookConfig({
      ...webhookConfig,
      [name]: value
    });
  };
  
  // Alternar boolean
  const handleToggle = (name) => {
    setWebhookConfig({
      ...webhookConfig,
      [name]: !webhookConfig[name]
    });
  };
  
  // Alternar seleção de eventos
  const toggleEvent = (event) => {
    const currentEvents = [...webhookConfig.events];
    
    if (currentEvents.includes(event)) {
      // Remover evento
      setWebhookConfig({
        ...webhookConfig,
        events: currentEvents.filter(e => e !== event)
      });
    } else {
      // Adicionar evento
      setWebhookConfig({
        ...webhookConfig,
        events: [...currentEvents, event]
      });
    }
  };
  
  // Selecionar todos os eventos
  const selectAllEvents = () => {
    setWebhookConfig({
      ...webhookConfig,
      events: [...AVAILABLE_EVENTS]
    });
  };
  
  // Limpar todos os eventos
  const clearAllEvents = () => {
    setWebhookConfig({
      ...webhookConfig,
      events: []
    });
  };
  
  // Salvar configuração
  const saveConfig = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      const response = await axios.post(`/api/webhook/configure/${instanceName}`, webhookConfig);
      
      if (response.data.success) {
        setSuccess(true);
        
        // Atualizar estado com os dados retornados
        if (response.data.data) {
          setWebhookConfig(response.data.data);
        }
      }
    } catch (err) {
      setError('Erro ao salvar configuração: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Configuração de Webhook para {instanceName}
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Configuração salva com sucesso!
          </Alert>
        )}
        
        <FormGroup>
          <FormControlLabel
            control={
              <Switch 
                checked={webhookConfig.enabled} 
                onChange={() => handleToggle('enabled')}
              />
            }
            label="Ativar Webhook"
          />
          
          <TextField
            fullWidth
            margin="normal"
            label="URL do Webhook"
            name="url"
            value={webhookConfig.url || ''}
            onChange={handleChange}
            disabled={!webhookConfig.enabled}
            helperText="URL que receberá as notificações de eventos"
          />
          
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={
                <Switch 
                  checked={webhookConfig.webhookByEvents} 
                  onChange={() => handleToggle('webhookByEvents')}
                  disabled={!webhookConfig.enabled}
                />
              }
              label="Usar URL específica para cada evento"
            />
            
            <FormControlLabel
              control={
                <Switch 
                  checked={webhookConfig.base64} 
                  onChange={() => handleToggle('base64')}
                  disabled={!webhookConfig.enabled}
                />
              }
              label="Enviar mídia em base64"
            />
          </Box>
        </FormGroup>
        
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Eventos
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button 
              variant="outlined" 
              size="small"
              onClick={selectAllEvents}
              disabled={!webhookConfig.enabled}
            >
              Marcar Todos
            </Button>
            <Button 
              variant="outlined" 
              size="small"
              onClick={clearAllEvents}
              disabled={!webhookConfig.enabled}
            >
              Desmarcar Todos
            </Button>
          </Box>
          
          <Grid container spacing={1}>
            {AVAILABLE_EVENTS.map((event) => (
              <Grid item key={event}>
                <Chip
                  label={event}
                  clickable
                  color={webhookConfig.events.includes(event) ? "primary" : "default"}
                  onClick={() => toggleEvent(event)}
                  disabled={!webhookConfig.enabled}
                  icon={webhookConfig.events.includes(event) ? <CheckCircleOutlineIcon /> : <ErrorOutlineIcon />}
                  sx={{ m: 0.5 }}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
        
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button 
            variant="contained" 
            color="primary"
            onClick={saveConfig}
            disabled={saving || !webhookConfig.enabled || !webhookConfig.url}
            startIcon={saving && <CircularProgress size={20} color="inherit" />}
          >
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default InstanceWebhookConfig; 