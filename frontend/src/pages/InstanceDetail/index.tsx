import { useState, useCallback, useEffect } from 'react';
import { 
  Accordion, 
  AccordionSummary, 
  AccordionDetails, 
  Typography, 
  TextField, 
  FormControl, 
  InputLabel, 
  Select, 
  OutlinedInput, 
  FormHelperText,
  MenuItem, 
  Checkbox, 
  ListItemText, 
  Box, 
  Button, 
  CircularProgress, 
  Alert,
  Chip
} from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Save from '@mui/icons-material/Save';
import axios from 'axios';

// Interface local para evitar dependência do arquivo de tipos
interface Instance {
  _id: string;
  instanceName: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'failed';
  serverUrl: string;
  webhook?: {
    url?: string;
    events?: string[];
  };
}

const InstanceDetail = () => {
  const api = axios.create({ baseURL: '/api' });
  const [instance, _setInstance] = useState<Instance | null>(null);

  // Seção para configuração de Webhook
  const [webhookExpanded, setWebhookExpanded] = useState(false);
  const [webhookConfig, setWebhookConfig] = useState({
    url: '',
    events: [
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE", 
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE"
    ]
  });
  const [loadingWebhook, setLoadingWebhook] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState({ type: '', text: '' });

  // Obter configuração atual do webhook
  const fetchWebhookConfig = useCallback(async () => {
    if (!instance?._id) return;
    
    try {
      setLoadingWebhook(true);
      const response = await api.get(`/instances/${instance._id}/webhook`);
      if (response.data.success) {
        const { url, events = [] } = response.data.data || {};
        setWebhookConfig({
          url: url || '',
          events: events.length > 0 ? events : webhookConfig.events
        });
      }
    } catch (error) {
      console.error('Erro ao obter configuração de webhook:', error);
    } finally {
      setLoadingWebhook(false);
    }
  }, [instance?._id, webhookConfig.events]);

  // Salvar configuração de webhook
  const saveWebhookConfig = async () => {
    if (!instance?._id) return;
    
    try {
      setLoadingWebhook(true);
      setWebhookMessage({ type: '', text: '' });
      
      const response = await api.post(`/instances/${instance._id}/webhook`, {
        webhookUrl: webhookConfig.url,
        webhookEvents: webhookConfig.events
      });
      
      if (response.data.success) {
        setWebhookMessage({ 
          type: 'success', 
          text: 'Webhook configurado com sucesso!'
        });
      } else {
        setWebhookMessage({ 
          type: 'error', 
          text: response.data.message || 'Erro ao configurar webhook'
        });
      }
    } catch (error: any) {
      console.error('Erro ao salvar configuração de webhook:', error);
      setWebhookMessage({ 
        type: 'error', 
        text: error.response?.data?.message || 'Erro de comunicação com o servidor'
      });
    } finally {
      setLoadingWebhook(false);
    }
  };

  // Carregar configuração de webhook quando a página carregar
  useEffect(() => {
    if (instance?._id && webhookExpanded) {
      fetchWebhookConfig();
    }
  }, [instance?._id, fetchWebhookConfig, webhookExpanded]);

  // Eventos disponíveis para webhook
  const availableEvents = [
    { value: "QRCODE_UPDATED", label: "QR Code Atualizado" },
    { value: "MESSAGES_UPSERT", label: "Novas Mensagens" },
    { value: "MESSAGES_UPDATE", label: "Atualização de Mensagens" },
    { value: "MESSAGES_DELETE", label: "Exclusão de Mensagens" },
    { value: "SEND_MESSAGE", label: "Mensagem Enviada" },
    { value: "CONNECTION_UPDATE", label: "Atualização de Conexão" },
    { value: "PRESENCE_UPDATE", label: "Atualização de Presença" },
    { value: "CONTACTS_SET", label: "Contatos Carregados" },
    { value: "CHATS_SET", label: "Conversas Carregadas" }
  ];

  return (
    <div>
      {/* Adicionar seção de configuração de Webhook */}
      <Accordion 
        expanded={webhookExpanded}
        onChange={() => setWebhookExpanded(!webhookExpanded)}
        sx={{ mt: 2 }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">
            Configuração de Webhook
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box component="form" noValidate sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" paragraph>
              Configure o webhook para receber notificações em tempo real de eventos do WhatsApp.
            </Typography>
            
            <TextField
              margin="normal"
              required
              fullWidth
              label="URL do Webhook"
              name="webhookUrl"
              value={webhookConfig.url}
              onChange={(e) => setWebhookConfig({...webhookConfig, url: e.target.value})}
              helperText="Deixe em branco para usar a URL do sistema"
            />
            
            <FormControl fullWidth margin="normal">
              <InputLabel id="webhook-events-label">Eventos</InputLabel>
              <Select
                labelId="webhook-events-label"
                multiple
                value={webhookConfig.events}
                onChange={(e) => setWebhookConfig({...webhookConfig, events: e.target.value as string[]})}
                input={<OutlinedInput label="Eventos" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {(selected as string[]).map((value) => (
                      <Chip 
                        key={value} 
                        label={availableEvents.find(e => e.value === value)?.label || value} 
                        size="small"
                      />
                    ))}
                  </Box>
                )}
              >
                {availableEvents.map((event) => (
                  <MenuItem key={event.value} value={event.value}>
                    <Checkbox checked={webhookConfig.events.indexOf(event.value) > -1} />
                    <ListItemText primary={event.label} secondary={event.value} />
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>Selecione os eventos que deseja receber no webhook</FormHelperText>
            </FormControl>

            {webhookMessage.text && (
              <Alert 
                severity={webhookMessage.type === 'success' ? 'success' : 'error'}
                sx={{ mt: 2 }}
              >
                {webhookMessage.text}
              </Alert>
            )}
            
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                color="primary"
                onClick={saveWebhookConfig}
                disabled={loadingWebhook}
                startIcon={loadingWebhook ? <CircularProgress size={20} /> : <Save />}
              >
                Salvar Configurações
              </Button>
            </Box>
          </Box>
        </AccordionDetails>
      </Accordion>
    </div>
  );
};

export default InstanceDetail; 