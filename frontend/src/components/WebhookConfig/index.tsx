import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  CircularProgress,
  Typography,
  FormGroup,
  Divider,
  Alert,
  Paper,
  InputAdornment,
  IconButton,
  Tooltip,
  Stack
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import api from '../../services/api';

type WebhookConfigProps = {
  instanceId: string;
  instanceName: string;
  onSuccess: () => void;
};

const WebhookConfig: React.FC<WebhookConfigProps> = ({ instanceId, instanceName, onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    enabled: false,
    url: '',
    secretKey: '',
    events: {
      CONNECTION_UPDATE: true,
      QRCODE_UPDATED: true,
      MESSAGES_UPSERT: true,
      MESSAGES_UPDATE: true,
      MESSAGES_DELETE: false,
      SEND_MESSAGE: true,
      PRESENCE_UPDATE: false,
      CHATS_UPDATE: false,
      CONTACTS_UPDATE: false
    }
  });
  const [stats, setStats] = useState({
    totalReceived: 0,
    lastReceived: '',
    failedWebhooks: 0
  });

  useEffect(() => {
    if (open) {
      loadWebhookConfig();
    }
  }, [open, instanceId]);

  const loadWebhookConfig = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/instances/${instanceId}`);
      
      if (response.data.success && response.data.data.webhook) {
        const { webhook } = response.data.data;
        setFormData({
          enabled: webhook.enabled || false,
          url: webhook.url || '',
          secretKey: webhook.secretKey || '',
          events: webhook.events || {
            CONNECTION_UPDATE: true,
            QRCODE_UPDATED: true,
            MESSAGES_UPSERT: true,
            MESSAGES_UPDATE: true,
            MESSAGES_DELETE: false,
            SEND_MESSAGE: true,
            PRESENCE_UPDATE: false,
            CHATS_UPDATE: false,
            CONTACTS_UPDATE: false
          }
        });
      }
      
      // Carregar estatísticas
      await loadWebhookStats();
    } catch (error) {
      console.error('Erro ao carregar configuração de webhook:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWebhookStats = async () => {
    try {
      setStatsLoading(true);
      const response = await api.get(`/instances/${instanceId}/webhook/stats`);
      
      if (response.data.success) {
        const { webhookStats } = response.data.data;
        setStats({
          totalReceived: webhookStats.totalReceived || 0,
          lastReceived: webhookStats.lastReceived || '',
          failedWebhooks: webhookStats.failedWebhooks || 0
        });
      }
    } catch (error) {
      console.error('Erro ao carregar estatísticas de webhook:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSwitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData({
      ...formData,
      [name]: checked
    });
  };

  const handleEventChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData({
      ...formData,
      events: {
        ...formData.events,
        [name]: checked
      }
    });
  };

  const handleCopyWebhookUrl = () => {
    const webhookUrl = `${window.location.origin}/webhook?instance=${instanceName}`;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateSecretKey = () => {
    // Gerar chave aleatória de 32 caracteres
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    setFormData({
      ...formData,
      secretKey: result
    });
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      // Se o campo url estiver vazio, envie null
      const payload = {
        ...formData,
        url: formData.url && formData.url.trim() !== '' ? formData.url : null
      };
      const response = await api.post(`/instances/${instanceId}/webhook`, payload);
      if (response.data.success) {
        onSuccess();
        handleClose();
      }
    } catch (error) {
      console.error('Erro ao configurar webhook:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Nunca';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  return (
    <>
      <Tooltip title="Configurar Webhook">
        <IconButton color="primary" onClick={handleOpen}>
          <SettingsIcon />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Configurar Webhook para {instanceName}</DialogTitle>
        <DialogContent>
          {loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : (
            <Box mt={2}>
              <Stack spacing={3}>
                <Box>
                  <FormControlLabel
                    control={
                      <Switch
                        name="enabled"
                        checked={formData.enabled}
                        onChange={handleSwitchChange}
                        color="primary"
                      />
                    }
                    label="Ativar webhook"
                  />
                </Box>

                <Box>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      URL do webhook que deve ser configurada na Evolution API:
                    </Typography>
                    <Box display="flex" alignItems="center" mt={1}>
                      <TextField
                        fullWidth
                        variant="outlined"
                        size="small"
                        value={`${window.location.origin}/webhook?instance=${instanceName}`}
                        InputProps={{
                          readOnly: true,
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton 
                                edge="end" 
                                onClick={handleCopyWebhookUrl}
                                size="small"
                              >
                                <ContentCopyIcon />
                              </IconButton>
                            </InputAdornment>
                          )
                        }}
                      />
                    </Box>
                    {copied && (
                      <Typography variant="caption" color="success.main" sx={{ mt: 1 }}>
                        URL copiada para a área de transferência!
                      </Typography>
                    )}
                  </Alert>
                </Box>

                {formData.enabled && (
                  <>
                    <Box>
                      <TextField
                        fullWidth
                        label="URL do webhook (opcional para callbacks externos)"
                        name="url"
                        value={formData.url}
                        onChange={handleInputChange}
                        helperText="Deixe em branco para usar apenas o webhook interno do ZapStorm"
                      />
                    </Box>
                    
                    <Box>
                      <Box display="flex" alignItems="center">
                        <TextField
                          fullWidth
                          label="Chave secreta (para verificação HMAC)"
                          name="secretKey"
                          value={formData.secretKey}
                          onChange={handleInputChange}
                        />
                        <Button 
                          variant="outlined" 
                          sx={{ ml: 1, height: 56 }} 
                          onClick={handleGenerateSecretKey}
                        >
                          Gerar
                        </Button>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        Usar para validar a autenticidade dos webhooks recebidos
                      </Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="subtitle1" gutterBottom>
                        Eventos a receber
                      </Typography>
                      <FormGroup>
                        <Stack direction="row" spacing={2} flexWrap="wrap">
                          <Box sx={{ width: { xs: '100%', sm: '45%' }, mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name="CONNECTION_UPDATE"
                                  checked={formData.events.CONNECTION_UPDATE}
                                  onChange={handleEventChange}
                                />
                              }
                              label="Atualizações de conexão"
                            />
                          </Box>
                          <Box sx={{ width: { xs: '100%', sm: '45%' }, mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name="QRCODE_UPDATED"
                                  checked={formData.events.QRCODE_UPDATED}
                                  onChange={handleEventChange}
                                />
                              }
                              label="QR Code atualizado"
                            />
                          </Box>
                          <Box sx={{ width: { xs: '100%', sm: '45%' }, mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name="MESSAGES_UPSERT"
                                  checked={formData.events.MESSAGES_UPSERT}
                                  onChange={handleEventChange}
                                />
                              }
                              label="Novas mensagens"
                            />
                          </Box>
                          <Box sx={{ width: { xs: '100%', sm: '45%' }, mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name="MESSAGES_UPDATE"
                                  checked={formData.events.MESSAGES_UPDATE}
                                  onChange={handleEventChange}
                                />
                              }
                              label="Atualizações de mensagens"
                            />
                          </Box>
                          <Box sx={{ width: { xs: '100%', sm: '45%' }, mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name="MESSAGES_DELETE"
                                  checked={formData.events.MESSAGES_DELETE}
                                  onChange={handleEventChange}
                                />
                              }
                              label="Mensagens apagadas"
                            />
                          </Box>
                          <Box sx={{ width: { xs: '100%', sm: '45%' }, mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name="SEND_MESSAGE"
                                  checked={formData.events.SEND_MESSAGE}
                                  onChange={handleEventChange}
                                />
                              }
                              label="Envio de mensagens"
                            />
                          </Box>
                          <Box sx={{ width: { xs: '100%', sm: '45%' }, mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name="PRESENCE_UPDATE"
                                  checked={formData.events.PRESENCE_UPDATE}
                                  onChange={handleEventChange}
                                />
                              }
                              label="Atualizações de presença"
                            />
                          </Box>
                          <Box sx={{ width: { xs: '100%', sm: '45%' }, mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name="CHATS_UPDATE"
                                  checked={formData.events.CHATS_UPDATE}
                                  onChange={handleEventChange}
                                />
                              }
                              label="Atualizações de chats"
                            />
                          </Box>
                          <Box sx={{ width: { xs: '100%', sm: '45%' }, mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name="CONTACTS_UPDATE"
                                  checked={formData.events.CONTACTS_UPDATE}
                                  onChange={handleEventChange}
                                />
                              }
                              label="Atualizações de contatos"
                            />
                          </Box>
                        </Stack>
                      </FormGroup>
                    </Box>
                  </>
                )}

                <Box>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle1" gutterBottom>
                    Estatísticas de Webhook
                  </Typography>
                  {statsLoading ? (
                    <Box display="flex" justifyContent="center" p={1}>
                      <CircularProgress size={20} />
                    </Box>
                  ) : (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" spacing={2} flexWrap="wrap">
                        <Box sx={{ width: { xs: '100%', sm: '30%' } }}>
                          <Typography variant="body2" color="text.secondary">
                            Total recebido:
                          </Typography>
                          <Typography variant="body1" fontWeight="medium">
                            {stats.totalReceived}
                          </Typography>
                        </Box>
                        <Box sx={{ width: { xs: '100%', sm: '30%' } }}>
                          <Typography variant="body2" color="text.secondary">
                            Último recebido:
                          </Typography>
                          <Typography variant="body1" fontWeight="medium">
                            {formatDate(stats.lastReceived)}
                          </Typography>
                        </Box>
                        <Box sx={{ width: { xs: '100%', sm: '30%' } }}>
                          <Typography variant="body2" color="text.secondary">
                            Falhas:
                          </Typography>
                          <Typography 
                            variant="body1" 
                            fontWeight="medium"
                            color={stats.failedWebhooks > 0 ? 'error.main' : 'inherit'}
                          >
                            {stats.failedWebhooks}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  )}
                </Box>
                
                <Box>
                  <Button 
                    variant="text" 
                    color="primary" 
                    size="small"
                    onClick={() => window.open('/webhook-logs', '_blank')}
                    startIcon={<InfoIcon />}
                  >
                    Ver logs de webhooks
                  </Button>
                </Box>
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="inherit">
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            color="primary"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default WebhookConfig; 