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
  IconButton,
  Divider,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  FormControl,
  FormLabel,
  Tooltip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import api from '../../services/api';

interface WebhookEvent {
  name: string;
  description: string;
}

interface WebhookSettings {
  enabled: boolean;
  url: string;
  webhook_by_events: boolean;
  webhook_base64: boolean;
  events: string[];
  defaultEvents: string[];
}

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
  webhookSettings: WebhookSettings;
}

interface WebhookStatus {
  instanceName: string;
  status: any;
  error: string | null;
}

// Lista de eventos de webhook disponíveis
const WEBHOOK_EVENTS: WebhookEvent[] = [
  { name: 'APPLICATION_STARTUP', description: 'Notifica quando a aplicação é iniciada' },
  { name: 'QRCODE_UPDATED', description: 'Envia o QR code para leitura' },
  { name: 'CONNECTION_UPDATE', description: 'Informa o status da conexão com o WhatsApp' },
  { name: 'MESSAGES_SET', description: 'Lista de todas as mensagens carregadas (uma vez)' },
  { name: 'MESSAGES_UPSERT', description: 'Notifica quando uma mensagem é recebida' },
  { name: 'MESSAGES_UPDATE', description: 'Informa quando uma mensagem é atualizada' },
  { name: 'MESSAGES_DELETE', description: 'Informa quando uma mensagem é excluída' },
  { name: 'SEND_MESSAGE', description: 'Notifica quando uma mensagem é enviada' },
  { name: 'CONTACTS_SET', description: 'Carregamento inicial de todos os contatos' },
  { name: 'CONTACTS_UPSERT', description: 'Recarrega todos os contatos com informações adicionais' },
  { name: 'CONTACTS_UPDATE', description: 'Informa quando o contato é atualizado' },
  { name: 'PRESENCE_UPDATE', description: 'Informa se o usuário está online, escrevendo ou gravando' },
  { name: 'CHATS_SET', description: 'Lista de todos os chats carregados' },
  { name: 'CHATS_UPDATE', description: 'Informa quando o chat é atualizado' },
  { name: 'CHATS_UPSERT', description: 'Envia qualquer nova informação de chat' },
  { name: 'CHATS_DELETE', description: 'Notifica quando um chat é excluído' },
  { name: 'GROUPS_UPSERT', description: 'Notifica quando um grupo é criado' },
  { name: 'GROUPS_UPDATE', description: 'Notifica quando as informações do grupo são atualizadas' },
  { name: 'GROUP_PARTICIPANTS_UPDATE', description: 'Notifica ações de participantes no grupo' },
  { name: 'CALL', description: 'Notifica sobre chamadas' },
  { name: 'TYPEBOT_START', description: 'Notifica quando um typebot é iniciado' },
  { name: 'TYPEBOT_CHANGE_STATUS', description: 'Notifica quando o status do typebot é alterado' }
];

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
    webhookSettings: {
      enabled: false,
      url: '',
      webhook_by_events: false,
      webhook_base64: false,
      events: [],
      defaultEvents: [
        'QRCODE_UPDATED',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONNECTION_UPDATE'
      ]
    }
  });
  
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info' | 'warning'
  });

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings.webhookSettings && settings.webhookSettings.events) {
      setSelectedEvents(settings.webhookSettings.events);
    }
  }, [settings.webhookSettings]);

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

  const loadWebhookStatus = async () => {
    try {
      setLoadingStatus(true);
      const response = await api.get('/settings/webhook-status');
      if (response.data.success) {
        setWebhookStatus(response.data.data);
      }
    } catch (error) {
      console.error('Erro ao carregar status do webhook:', error);
      setSnackbar({
        open: true,
        message: 'Erro ao carregar status do webhook',
        severity: 'error'
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : 
              type === 'number' ? Number(value) : 
              value
    }));

    // Caso especial para webhookEnabled
    if (name === 'webhookEnabled') {
      setSettings(prev => ({
        ...prev,
        webhookSettings: {
          ...prev.webhookSettings,
          enabled: checked
        }
      }));
    }

    // Caso especial para webhookUrl
    if (name === 'webhookUrl') {
      setSettings(prev => ({
        ...prev,
        webhookSettings: {
          ...prev.webhookSettings,
          url: value
        }
      }));
    }
  };

  const handleWebhookSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked } = e.target;
    
    setSettings(prev => ({
      ...prev,
      webhookSettings: {
        ...prev.webhookSettings,
        [name]: type === 'checkbox' ? checked : e.target.value
      }
    }));
  };

  const handleEventToggle = (event: string) => () => {
    const currentIndex = selectedEvents.indexOf(event);
    const newSelectedEvents = [...selectedEvents];

    if (currentIndex === -1) {
      newSelectedEvents.push(event);
    } else {
      newSelectedEvents.splice(currentIndex, 1);
    }

    setSelectedEvents(newSelectedEvents);
    
    setSettings(prev => ({
      ...prev,
      webhookSettings: {
        ...prev.webhookSettings,
        events: newSelectedEvents
      }
    }));
  };

  const selectAllEvents = () => {
    const allEvents = WEBHOOK_EVENTS.map(event => event.name);
    setSelectedEvents(allEvents);
    
    setSettings(prev => ({
      ...prev,
      webhookSettings: {
        ...prev.webhookSettings,
        events: allEvents
      }
    }));
  };

  const clearAllEvents = () => {
    setSelectedEvents([]);
    
    setSettings(prev => ({
      ...prev,
      webhookSettings: {
        ...prev.webhookSettings,
        events: []
      }
    }));
  };

  const selectDefaultEvents = () => {
    const defaultEvents = settings.webhookSettings.defaultEvents || [
      'QRCODE_UPDATED',
      'MESSAGES_UPSERT',
      'MESSAGES_UPDATE',
      'MESSAGES_DELETE',
      'SEND_MESSAGE',
      'CONNECTION_UPDATE'
    ];
    
    setSelectedEvents(defaultEvents);
    
    setSettings(prev => ({
      ...prev,
      webhookSettings: {
        ...prev.webhookSettings,
        events: defaultEvents
      }
    }));
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
          
          // Recarregar status do webhook se estiver habilitado
          if (settings.webhookEnabled) {
            await loadWebhookStatus();
          }
        }
      } catch (apiError) {
        console.error('Erro ao salvar configurações:', apiError);
        setSnackbar({
          open: true,
          message: 'Erro ao salvar configurações',
          severity: 'error'
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
          
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Webhook do Evolution API</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                  <Tooltip title="O webhook permite que o Evolution API envie eventos diretamente para o ZapStorm">
                    <InfoIcon color="info" fontSize="small" />
                  </Tooltip>
                </Box>
                
                {settings.webhookEnabled && (
                  <>
                    <TextField
                      fullWidth
                      label="URL do Webhook"
                      name="webhookUrl"
                      value={settings.webhookUrl}
                      onChange={handleChange}
                      placeholder="https://seu-dominio.com/webhook"
                      helperText="URL completa onde o Evolution API vai enviar os eventos (deve ser acessível publicamente)"
                    />
                    
                    <FormControlLabel
                      control={
                        <Switch
                          name="webhook_by_events"
                          checked={settings.webhookSettings?.webhook_by_events || false}
                          onChange={handleWebhookSettingChange}
                        />
                      }
                      label="Usar URL específica para cada evento"
                    />
                    
                    <FormControlLabel
                      control={
                        <Switch
                          name="webhook_base64"
                          checked={settings.webhookSettings?.webhook_base64 || false}
                          onChange={handleWebhookSettingChange}
                        />
                      }
                      label="Receber mídias em Base64"
                    />
                    
                    <Divider />
                    
                    <Box>
                      <FormControl component="fieldset" fullWidth>
                        <FormLabel component="legend">Eventos do Webhook</FormLabel>
                        <Typography variant="body2" color="textSecondary" sx={{ mt: 1, mb: 2 }}>
                          Selecione os eventos que você deseja receber do Evolution API:
                        </Typography>
                        
                        <Box sx={{ mb: 2 }}>
                          <Button variant="outlined" size="small" onClick={selectAllEvents} sx={{ mr: 1 }}>
                            Selecionar Todos
                          </Button>
                          <Button variant="outlined" size="small" onClick={clearAllEvents} sx={{ mr: 1 }}>
                            Limpar Todos
                          </Button>
                          <Button variant="outlined" size="small" onClick={selectDefaultEvents}>
                            Padrões
                          </Button>
                        </Box>
                        
                        <List sx={{ maxHeight: '400px', overflow: 'auto', border: '1px solid #ccc', borderRadius: 1 }}>
                          {WEBHOOK_EVENTS.map((event) => {
                            const labelId = `checkbox-list-label-${event.name}`;
                            return (
                              <ListItem
                                key={event.name}
                                dense
                                disablePadding
                                onClick={handleEventToggle(event.name)}
                              >
                                <ListItemIcon>
                                  <Checkbox
                                    edge="start"
                                    checked={selectedEvents.indexOf(event.name) !== -1}
                                    tabIndex={-1}
                                    disableRipple
                                    inputProps={{ 'aria-labelledby': labelId }}
                                  />
                                </ListItemIcon>
                                <ListItemText
                                  id={labelId}
                                  primary={event.name}
                                  secondary={event.description}
                                />
                              </ListItem>
                            );
                          })}
                        </List>
                      </FormControl>
                    </Box>
                    
                    <Divider />
                    
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle1">Status dos Webhooks</Typography>
                        <Button
                          startIcon={<RefreshIcon />}
                          onClick={loadWebhookStatus}
                          disabled={loadingStatus}
                          size="small"
                        >
                          {loadingStatus ? 'Carregando...' : 'Verificar Status'}
                        </Button>
                      </Box>
                      
                      {loadingStatus ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                          <CircularProgress size={30} />
                        </Box>
                      ) : webhookStatus.length > 0 ? (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                          {webhookStatus.map((status) => (
                            <Box 
                              key={status.instanceName}
                              sx={{ 
                                gridColumn: {
                                  xs: 'span 12',
                                  sm: 'span 6',
                                  md: 'span 4'
                                }
                              }}
                            >
                              <Paper sx={{ p: 2 }}>
                                <Typography variant="subtitle2">{status.instanceName}</Typography>
                                {status.error ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', color: 'error.main', mt: 1 }}>
                                    <ErrorIcon fontSize="small" sx={{ mr: 1 }} />
                                    <Typography variant="body2">Erro: {status.error}</Typography>
                                  </Box>
                                ) : (
                                  <Box sx={{ display: 'flex', alignItems: 'center', color: 'success.main', mt: 1 }}>
                                    <CheckCircleIcon fontSize="small" sx={{ mr: 1 }} />
                                    <Typography variant="body2">
                                      {status.status?.enabled ? 'Webhook ativo' : 'Webhook inativo'}
                                    </Typography>
                                  </Box>
                                )}
                              </Paper>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Alert severity="info">
                          Clique em "Verificar Status" para ver o estado dos webhooks nas instâncias
                        </Alert>
                      )}
                    </Box>
                  </>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
          
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Notificações</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormControlLabel
                control={
                  <Switch
                    name="notificationsEnabled"
                    checked={settings.notificationsEnabled}
                    onChange={handleChange}
                  />
                }
                label="Ativar notificações no navegador"
              />
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