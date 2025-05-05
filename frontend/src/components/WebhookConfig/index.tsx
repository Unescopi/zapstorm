import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  FormControlLabel,
  Switch,
  Button,
  Checkbox,
  FormGroup,
  FormControl,
  CircularProgress,
  Card,
  CardContent,
  Divider,
  IconButton,
  Tooltip,
  Alert,
  GridLegacy as Grid
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import InfoIcon from '@mui/icons-material/Info';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LabelIcon from '@mui/icons-material/Label';
import api from '../../services/api';
import { Instance, WebhookEvent } from '../../types/Instance';

interface WebhookConfigProps {
  instance: Instance;
  onWebhookUpdated: () => void;
}

interface WebhookFormData {
  enabled: boolean;
  url: string;
  webhookByEvents: boolean;
  webhookBase64: boolean;
  events: WebhookEvent[];
}

const eventGroups = {
  messages: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'SEND_MESSAGE', 'MESSAGES_SET'],
  connections: ['CONNECTION_UPDATE', 'QRCODE_UPDATED'],
  contacts: ['CONTACTS_SET', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE'],
  chats: ['CHATS_SET', 'CHATS_UPDATE', 'CHATS_UPSERT', 'CHATS_DELETE'],
  groups: ['GROUPS_UPSERT', 'GROUPS_UPDATE', 'GROUP_PARTICIPANTS_UPDATE'],
  other: ['PRESENCE_UPDATE', 'NEW_TOKEN']
};

const eventLabels: Record<WebhookEvent, string> = {
  'message': 'Mensagem',
  'message-status': 'Status de Mensagem',
  'connection-status': 'Status de Conexão',
  'QRCODE_UPDATED': 'QR Code Atualizado',
  'CONNECTION_UPDATE': 'Atualização de Conexão',
  'MESSAGES_SET': 'Mensagens Carregadas',
  'MESSAGES_UPSERT': 'Nova Mensagem',
  'MESSAGES_UPDATE': 'Atualização de Mensagem',
  'MESSAGES_DELETE': 'Exclusão de Mensagem',
  'SEND_MESSAGE': 'Mensagem Enviada',
  'CONTACTS_SET': 'Contatos Carregados',
  'CONTACTS_UPSERT': 'Novo Contato',
  'CONTACTS_UPDATE': 'Atualização de Contato',
  'PRESENCE_UPDATE': 'Atualização de Presença',
  'CHATS_SET': 'Chats Carregados',
  'CHATS_UPDATE': 'Atualização de Chat',
  'CHATS_UPSERT': 'Novo Chat',
  'CHATS_DELETE': 'Exclusão de Chat',
  'GROUPS_UPSERT': 'Novo Grupo',
  'GROUPS_UPDATE': 'Atualização de Grupo',
  'GROUP_PARTICIPANTS_UPDATE': 'Atualização de Participantes',
  'NEW_TOKEN': 'Novo Token'
};

const WebhookConfig: React.FC<WebhookConfigProps> = ({ instance, onWebhookUpdated }) => {
  const [formData, setFormData] = useState<WebhookFormData>({
    enabled: false,
    url: '',
    webhookByEvents: false,
    webhookBase64: false,
    events: []
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [testUrl, setTestUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // URL do webhook completa para o nome da instância
  const webhookServerUrl = `${window.location.origin}/api/webhook/${instance.instanceName}`;

  useEffect(() => {
    loadWebhookConfig();
  }, [instance._id]);

  const loadWebhookConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get(`/instances/${instance._id}/webhook`);
      
      if (response.data.success && response.data.data) {
        const webhookData = response.data.data;
        setFormData({
          enabled: webhookData.enabled || false,
          url: webhookData.url || '',
          webhookByEvents: webhookData.webhookByEvents || false,
          webhookBase64: webhookData.webhookBase64 || false,
          events: webhookData.events || []
        });
        
        // Se estiver habilitado, define a URL de teste como a URL configurada
        if (webhookData.enabled && webhookData.url) {
          setTestUrl(webhookData.url);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configuração de webhook:', error);
      setError('Não foi possível carregar a configuração de webhook. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setFormData({
      ...formData,
      [name]: checked
    });
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleEventToggle = (event: WebhookEvent) => {
    if (formData.events.includes(event)) {
      // Remover evento
      setFormData({
        ...formData,
        events: formData.events.filter(e => e !== event)
      });
    } else {
      // Adicionar evento
      setFormData({
        ...formData,
        events: [...formData.events, event]
      });
    }
  };

  const handleSelectAllInGroup = (group: WebhookEvent[]) => {
    const currentEvents = new Set(formData.events);
    let newEvents: WebhookEvent[];
    
    // Verificar se todos os eventos do grupo já estão selecionados
    const allSelected = group.every(event => currentEvents.has(event as WebhookEvent));
    
    if (allSelected) {
      // Desselecionar todos do grupo
      newEvents = formData.events.filter(event => !group.includes(event));
    } else {
      // Selecionar todos do grupo
      group.forEach(event => currentEvents.add(event as WebhookEvent));
      newEvents = Array.from(currentEvents);
    }
    
    setFormData({
      ...formData,
      events: newEvents
    });
  };

  const handleSaveWebhook = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      
      // Validar URL apenas se estiver habilitado
      if (formData.enabled && !formData.url) {
        setError('URL do webhook é obrigatória quando habilitado');
        return;
      }
      
      const response = await api.post(`/instances/${instance._id}/webhook`, formData);
      
      if (response.data.success) {
        setSuccessMessage('Configurações de webhook salvas com sucesso!');
        // Atualizar URL de teste com a URL salva
        setTestUrl(formData.url);
        
        if (onWebhookUpdated) {
          onWebhookUpdated();
        }
      } else {
        setError('Erro ao salvar configurações de webhook');
      }
    } catch (error: any) {
      console.error('Erro ao salvar webhook:', error);
      setError(error.response?.data?.message || 'Erro ao salvar webhook. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!testUrl) {
      setError('URL de teste é obrigatória');
      return;
    }
    
    try {
      setTesting(true);
      setTestResult(null);
      setError(null);
      
      const response = await api.post('/webhook/test', {
        url: testUrl,
        event: 'test',
      });
      
      if (response.data.success) {
        setTestResult({
          success: true,
          message: 'Teste enviado com sucesso! O seu servidor respondeu corretamente.'
        });
      } else {
        setTestResult({
          success: false,
          message: response.data.message || 'Erro ao testar webhook'
        });
      }
    } catch (error: any) {
      console.error('Erro ao testar webhook:', error);
      setTestResult({
        success: false,
        message: error.response?.data?.message || 'Erro ao testar webhook: o servidor não respondeu ou retornou um erro.'
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setSuccessMessage('Copiado para a área de transferência!');
        setTimeout(() => setSuccessMessage(null), 3000);
      })
      .catch(err => {
        console.error('Erro ao copiar texto:', err);
      });
  };

  const getGroupSelectStatus = (group: string[]) => {
    const groupEvents = group as WebhookEvent[];
    const selectedCount = groupEvents.filter(event => formData.events.includes(event)).length;
    
    if (selectedCount === 0) return 'none';
    if (selectedCount === groupEvents.length) return 'all';
    return 'some';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Configuração de Webhook
      </Typography>
      
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle1" fontWeight="bold">
              URL de Recebimento do Webhook
            </Typography>
            <Tooltip title="Copiar URL">
              <IconButton
                size="small"
                onClick={() => copyToClipboard(webhookServerUrl)}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Configure seus sistemas para enviar eventos para este endpoint:
          </Typography>
          
          <Box 
            sx={{ 
              p: 1, 
              bgcolor: 'action.hover', 
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              overflowX: 'auto'
            }}
          >
            {webhookServerUrl}
          </Box>
          
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Este é o endpoint que receberá eventos da Evolution API quando configurado no ZapStorm.
          </Typography>
        </CardContent>
      </Card>
      
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Switch
                checked={formData.enabled}
                onChange={handleSwitchChange}
                name="enabled"
                color="primary"
              />
            }
            label="Habilitar Webhook"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="URL do Webhook"
            name="url"
            value={formData.url}
            onChange={handleTextChange}
            disabled={!formData.enabled}
            required={formData.enabled}
            helperText="URL para onde os eventos serão enviados"
            placeholder="https://seu-servidor.com/webhook"
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControlLabel
            control={
              <Switch
                checked={formData.webhookByEvents}
                onChange={handleSwitchChange}
                name="webhookByEvents"
                disabled={!formData.enabled}
              />
            }
            label="Gerar URLs para cada evento"
          />
          <Tooltip title="Quando habilitado, o sistema irá adicionar o nome do evento ao final da URL. Ex: sua-url.com/webhook/messages-upsert">
            <IconButton size="small">
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControlLabel
            control={
              <Switch
                checked={formData.webhookBase64}
                onChange={handleSwitchChange}
                name="webhookBase64"
                disabled={!formData.enabled}
              />
            }
            label="Enviar mídia em Base64"
          />
          <Tooltip title="Quando habilitado, os arquivos de mídia serão codificados em base64 e enviados junto com os eventos">
            <IconButton size="small">
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Grid>
      </Grid>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
          Selecione os eventos que deseja receber
        </Typography>
        
        <Box sx={{ mb: 2 }}>
          <FormControl component="fieldset" disabled={!formData.enabled} sx={{ width: '100%' }}>
            <Grid container spacing={2}>
              {/* Eventos de Mensagens */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={1}>
                      <LabelIcon color="primary" sx={{ mr: 1 }} />
                      <Typography variant="subtitle2">Eventos de Mensagens</Typography>
                      <Button 
                        size="small"
                        onClick={() => handleSelectAllInGroup(eventGroups.messages as WebhookEvent[])}
                        sx={{ ml: 'auto' }}
                      >
                        {getGroupSelectStatus(eventGroups.messages) === 'all' ? 'Desmarcar todos' : 'Marcar todos'}
                      </Button>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    <FormGroup>
                      {eventGroups.messages.map((event) => (
                        <FormControlLabel
                          key={event}
                          control={
                            <Checkbox 
                              checked={formData.events.includes(event as WebhookEvent)}
                              onChange={() => handleEventToggle(event as WebhookEvent)}
                              size="small"
                            />
                          }
                          label={
                            <Typography variant="body2">{eventLabels[event as WebhookEvent]}</Typography>
                          }
                        />
                      ))}
                    </FormGroup>
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Eventos de Conexão */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={1}>
                      <LabelIcon color="primary" sx={{ mr: 1 }} />
                      <Typography variant="subtitle2">Eventos de Conexão</Typography>
                      <Button 
                        size="small"
                        onClick={() => handleSelectAllInGroup(eventGroups.connections as WebhookEvent[])}
                        sx={{ ml: 'auto' }}
                      >
                        {getGroupSelectStatus(eventGroups.connections) === 'all' ? 'Desmarcar todos' : 'Marcar todos'}
                      </Button>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    <FormGroup>
                      {eventGroups.connections.map((event) => (
                        <FormControlLabel
                          key={event}
                          control={
                            <Checkbox 
                              checked={formData.events.includes(event as WebhookEvent)}
                              onChange={() => handleEventToggle(event as WebhookEvent)}
                              size="small"
                            />
                          }
                          label={
                            <Typography variant="body2">{eventLabels[event as WebhookEvent]}</Typography>
                          }
                        />
                      ))}
                    </FormGroup>
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Eventos de Contatos */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={1}>
                      <LabelIcon color="primary" sx={{ mr: 1 }} />
                      <Typography variant="subtitle2">Eventos de Contatos</Typography>
                      <Button 
                        size="small"
                        onClick={() => handleSelectAllInGroup(eventGroups.contacts as WebhookEvent[])}
                        sx={{ ml: 'auto' }}
                      >
                        {getGroupSelectStatus(eventGroups.contacts) === 'all' ? 'Desmarcar todos' : 'Marcar todos'}
                      </Button>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    <FormGroup>
                      {eventGroups.contacts.map((event) => (
                        <FormControlLabel
                          key={event}
                          control={
                            <Checkbox 
                              checked={formData.events.includes(event as WebhookEvent)}
                              onChange={() => handleEventToggle(event as WebhookEvent)}
                              size="small"
                            />
                          }
                          label={
                            <Typography variant="body2">{eventLabels[event as WebhookEvent]}</Typography>
                          }
                        />
                      ))}
                    </FormGroup>
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Eventos de Chats e Grupos */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={1}>
                      <LabelIcon color="primary" sx={{ mr: 1 }} />
                      <Typography variant="subtitle2">Eventos de Chats e Grupos</Typography>
                      <Button 
                        size="small"
                        onClick={() => handleSelectAllInGroup([...eventGroups.chats, ...eventGroups.groups] as WebhookEvent[])}
                        sx={{ ml: 'auto' }}
                      >
                        {getGroupSelectStatus([...eventGroups.chats, ...eventGroups.groups]) === 'all' ? 'Desmarcar todos' : 'Marcar todos'}
                      </Button>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    <FormGroup>
                      {[...eventGroups.chats, ...eventGroups.groups].map((event) => (
                        <FormControlLabel
                          key={event}
                          control={
                            <Checkbox 
                              checked={formData.events.includes(event as WebhookEvent)}
                              onChange={() => handleEventToggle(event as WebhookEvent)}
                              size="small"
                            />
                          }
                          label={
                            <Typography variant="body2">{eventLabels[event as WebhookEvent]}</Typography>
                          }
                        />
                      ))}
                    </FormGroup>
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Outros Eventos */}
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={1}>
                      <LabelIcon color="primary" sx={{ mr: 1 }} />
                      <Typography variant="subtitle2">Outros Eventos</Typography>
                      <Button 
                        size="small"
                        onClick={() => handleSelectAllInGroup(eventGroups.other as WebhookEvent[])}
                        sx={{ ml: 'auto' }}
                      >
                        {getGroupSelectStatus(eventGroups.other) === 'all' ? 'Desmarcar todos' : 'Marcar todos'}
                      </Button>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    <FormGroup>
                      {eventGroups.other.map((event) => (
                        <FormControlLabel
                          key={event}
                          control={
                            <Checkbox 
                              checked={formData.events.includes(event as WebhookEvent)}
                              onChange={() => handleEventToggle(event as WebhookEvent)}
                              size="small"
                            />
                          }
                          label={
                            <Typography variant="body2">{eventLabels[event as WebhookEvent]}</Typography>
                          }
                        />
                      ))}
                    </FormGroup>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </FormControl>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMessage}
        </Alert>
      )}

      <Box display="flex" justifyContent="space-between" mb={4}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSaveWebhook}
          disabled={saving}
        >
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
        
        <Box component="a" href="/api/webhook/documentation" target="_blank" sx={{ ml: 2 }}>
          <Button variant="outlined">
            Ver Documentação
          </Button>
        </Box>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Seção de teste do webhook */}
      <Typography variant="h6" gutterBottom>
        Testar Webhook
      </Typography>
      
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} md={8}>
          <TextField
            fullWidth
            label="URL para testar"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="https://seu-servidor.com/webhook"
            helperText="Digite a URL do webhook para enviar um evento de teste"
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<SendIcon />}
            onClick={handleTestWebhook}
            disabled={testing || !testUrl}
            fullWidth
          >
            {testing ? 'Enviando...' : 'Enviar Teste'}
          </Button>
        </Grid>
      </Grid>

      {testResult && (
        <Alert 
          severity={testResult.success ? 'success' : 'error'} 
          sx={{ mt: 2 }}
        >
          {testResult.message}
        </Alert>
      )}
    </Box>
  );
};

export default WebhookConfig; 