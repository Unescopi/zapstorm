import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Chip,
  Avatar,
  Snackbar,
  Alert
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import SettingsIcon from '@mui/icons-material/Settings';
import api from '../../services/api';

// Definição do tipo para setTimeout/setInterval
type TimeoutType = ReturnType<typeof setTimeout>;

type Instance = {
  _id: string;
  instanceName: string;
  status: 'disconnected' | 'connected' | 'connecting' | 'error';
  qrcode?: string;
  lastConnection?: string;
  phone?: string;
  createdAt: string;
};

const statusColors = {
  disconnected: 'error',
  connected: 'success',
  connecting: 'warning',
  error: 'error'
};

const statusLabels = {
  disconnected: 'Desconectado',
  connected: 'Conectado',
  connecting: 'Conectando',
  error: 'Erro'
};

const Instances: React.FC = () => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [formData, setFormData] = useState({
    instanceName: ''
  });
  const [pollingInstance, setPollingInstance] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [syncLoading, setSyncLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info' | 'warning'
  });
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [webhookConfig, setWebhookConfig] = useState({
    enabled: false,
    url: '',
    webhookByEvents: false,
    webhookBase64: false,
    events: [] as string[]
  });
  const availableEvents = [
    "QRCODE_UPDATED",
    "CONNECTION_UPDATE",
    "MESSAGES_SET",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "MESSAGES_DELETE",
    "SEND_MESSAGE",
    "CONTACTS_SET",
    "CONTACTS_UPSERT",
    "CONTACTS_UPDATE",
    "PRESENCE_UPDATE",
    "CHATS_SET",
    "CHATS_UPDATE",
    "CHATS_UPSERT",
    "CHATS_DELETE",
    "GROUPS_UPSERT",
    "GROUPS_UPDATE",
    "GROUP_PARTICIPANTS_UPDATE"
  ];

  useEffect(() => {
    loadInstances();
    // Atualizar a cada 30 segundos
    const interval = setInterval(() => {
      loadInstances(false);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Polling para verificar status de conexão quando mostrar QR code
    let pollingInterval: TimeoutType | null = null;
    
    if (pollingInstance) {
      pollingInterval = setInterval(() => {
        checkInstanceState(pollingInstance);
      }, 5000);
    }
    
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInstance]);

  const loadInstances = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const response = await api.get('/instances');
      setInstances(response.data.data);
    } catch (error) {
      console.error('Erro ao carregar instâncias:', error);
      showSnackbar('Erro ao carregar instâncias', 'error');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleSyncInstances = async () => {
    try {
      setSyncLoading(true);
      const response = await api.post('/instances/sync-from-evolution');
      
      if (response.data.success) {
        showSnackbar(response.data.message, 'success');
        loadInstances();
      } else {
        showSnackbar('Erro ao sincronizar instâncias', 'error');
      }
    } catch (error) {
      console.error('Erro ao sincronizar instâncias:', error);
      showSnackbar('Erro ao sincronizar instâncias da Evolution API', 'error');
    } finally {
      setSyncLoading(false);
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info' | 'warning') => {
    setSnackbar({
      open: true,
      message,
      severity
    });
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        instanceName: formData.instanceName.trim()
      };

      await api.post('/instances', payload);
      handleCloseDialog();
      loadInstances();
    } catch (error) {
      console.error('Erro ao criar instância:', error);
    }
  };

  const handleDelete = async () => {
    if (!selectedInstance) return;
    
    try {
      await api.delete(`/instances/${selectedInstance._id}`);
      loadInstances();
      setDeleteConfirmOpen(false);
      setSelectedInstance(null);
      showSnackbar('Instância excluída com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao excluir instância:', error);
      showSnackbar('Erro ao excluir instância', 'error');
    }
  };

  const confirmDelete = (instance: Instance) => {
    setSelectedInstance(instance);
    setDeleteConfirmOpen(true);
  };

  const handleConnect = async (instance: Instance) => {
    try {
      setRefreshing(prev => ({ ...prev, [instance._id]: true }));
      const response = await api.post(`/instances/${instance._id}/connect`);
      
      if (response.data.success) {
        setSelectedInstance(instance);
        setQrCodeDialogOpen(true);
        setPollingInstance(instance._id);
        
        // Atualizar a instância para obter o QR code
        loadInstanceDetails(instance._id);
      }
    } catch (error) {
      console.error('Erro ao conectar instância:', error);
      showSnackbar('Erro ao conectar instância', 'error');
    } finally {
      setRefreshing(prev => ({ ...prev, [instance._id]: false }));
    }
  };

  const handleDisconnect = async (instance: Instance) => {
    try {
      setRefreshing(prev => ({ ...prev, [instance._id]: true }));
      await api.post(`/instances/${instance._id}/logout`);
      loadInstances();
      showSnackbar('Instância desconectada com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao desconectar instância:', error);
      showSnackbar('Erro ao desconectar instância', 'error');
    } finally {
      setRefreshing(prev => ({ ...prev, [instance._id]: false }));
    }
  };

  const handleRestart = async (instance: Instance) => {
    try {
      setRefreshing(prev => ({ ...prev, [instance._id]: true }));
      await api.post(`/instances/${instance._id}/restart`);
      loadInstances();
      showSnackbar('Instância reiniciada com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao reiniciar instância:', error);
      showSnackbar('Erro ao reiniciar instância', 'error');
    } finally {
      setRefreshing(prev => ({ ...prev, [instance._id]: false }));
    }
  };

  const loadInstanceDetails = async (instanceId: string) => {
    try {
      const response = await api.get(`/instances/${instanceId}`);
      if (response.data.success) {
        // Atualizar a instância selecionada com o QR code
        setSelectedInstance(response.data.data);
        
        // Atualizar também na lista
        setInstances(prev => 
          prev.map(inst => 
            inst._id === instanceId ? response.data.data : inst
          )
        );
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes da instância:', error);
    }
  };

  const checkInstanceState = async (instanceId: string) => {
    try {
      const response = await api.get(`/instances/${instanceId}/state`);
      if (response.data.success) {
        const status = response.data.data.status;
        
        // Se conectado, atualizar e fechar o diálogo
        if (status === 'connected') {
          loadInstances();
          setQrCodeDialogOpen(false);
          setPollingInstance(null);
          showSnackbar('Instância conectada com sucesso', 'success');
        } else if (status === 'disconnected') {
          // Se desconectado, atualizar QR code
          loadInstanceDetails(instanceId);
        }
      }
    } catch (error) {
      console.error('Erro ao verificar estado da instância:', error);
    }
  };

  const handleQrCodeClose = () => {
    setQrCodeDialogOpen(false);
    setPollingInstance(null);
    loadInstances();
  };

  // Função para abrir o diálogo de configuração de webhook
  const handleOpenWebhookDialog = async (instance: Instance) => {
    setSelectedInstance(instance);
    
    try {
      // Carregar configuração atual do webhook
      const response = await api.get(`/instances/${instance._id}/webhook`);
      
      if (response.data.success) {
        const webhookData = response.data.data;
        setWebhookConfig({
          enabled: webhookData.enabled || false,
          url: webhookData.url || '',
          webhookByEvents: webhookData.webhookByEvents || false,
          webhookBase64: webhookData.webhookBase64 || false,
          events: webhookData.events || []
        });
      } else {
        // Configuração padrão se não tiver webhook configurado
        setWebhookConfig({
          enabled: false,
          url: '',
          webhookByEvents: false,
          webhookBase64: false,
          events: []
        });
      }
      
      setWebhookDialogOpen(true);
    } catch (error) {
      console.error('Erro ao carregar configurações do webhook:', error);
      
      // Mesmo com erro, abrir o diálogo com configurações padrão
      setWebhookConfig({
        enabled: false,
        url: '',
        webhookByEvents: false,
        webhookBase64: false,
        events: []
      });
      setWebhookDialogOpen(true);
    }
  };
  
  // Função para salvar a configuração do webhook
  const handleSaveWebhook = async () => {
    if (!selectedInstance) return;
    
    try {
      if (webhookConfig.enabled) {
        // Configurar webhook
        const response = await api.post(`/instances/${selectedInstance._id}/webhook`, {
          webhookUrl: webhookConfig.url,
          webhookByEvents: webhookConfig.webhookByEvents,
          webhookBase64: webhookConfig.webhookBase64,
          events: webhookConfig.events
        });
        
        if (response.data.success) {
          showSnackbar('Webhook configurado com sucesso', 'success');
        } else {
          showSnackbar('Erro ao configurar webhook', 'error');
        }
      } else {
        // Remover webhook
        const response = await api.delete(`/instances/${selectedInstance._id}/webhook`);
        
        if (response.data.success) {
          showSnackbar('Webhook removido com sucesso', 'success');
        } else {
          showSnackbar('Erro ao remover webhook', 'error');
        }
      }
      
      setWebhookDialogOpen(false);
    } catch (error) {
      console.error('Erro ao salvar configurações do webhook:', error);
      showSnackbar('Erro ao salvar configurações do webhook', 'error');
    }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Instâncias WhatsApp</Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<SyncIcon />}
          onClick={handleSyncInstances}
          disabled={syncLoading}
        >
          {syncLoading ? 'Sincronizando...' : 'Sincronizar Instâncias'}
        </Button>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Telefone</TableCell>
                <TableCell>Última Conexão</TableCell>
                <TableCell>Criado em</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {instances.length > 0 ? (
                instances.map((instance) => (
                  <TableRow key={instance._id}>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <Avatar sx={{ width: 30, height: 30, mr: 1, bgcolor: 'primary.main' }}>
                          <PhoneAndroidIcon fontSize="small" />
                        </Avatar>
                        {instance.instanceName}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={statusLabels[instance.status]} 
                        color={statusColors[instance.status] as any} 
                        size="small" 
                      />
                    </TableCell>
                    <TableCell>{instance.phone || '-'}</TableCell>
                    <TableCell>
                      {instance.lastConnection 
                        ? new Date(instance.lastConnection).toLocaleString() 
                        : 'Nunca conectado'}
                    </TableCell>
                    <TableCell>{new Date(instance.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="center">
                      {instance.status !== 'connected' && (
                        <IconButton 
                          color="primary" 
                          size="small" 
                          onClick={() => handleConnect(instance)}
                          disabled={refreshing[instance._id]}
                          title="Conectar"
                        >
                          {refreshing[instance._id] ? (
                            <CircularProgress size={20} />
                          ) : (
                            <QrCode2Icon fontSize="small" />
                          )}
                        </IconButton>
                      )}
                      
                      {instance.status === 'connected' && (
                        <IconButton 
                          color="warning" 
                          size="small"
                          onClick={() => handleDisconnect(instance)}
                          disabled={refreshing[instance._id]}
                          title="Desconectar"
                        >
                          {refreshing[instance._id] ? (
                            <CircularProgress size={20} />
                          ) : (
                            <LogoutIcon fontSize="small" />
                          )}
                        </IconButton>
                      )}
                      
                      <IconButton 
                        color="info" 
                        size="small"
                        onClick={() => handleRestart(instance)}
                        disabled={refreshing[instance._id]}
                        title="Reiniciar"
                      >
                        {refreshing[instance._id] ? (
                          <CircularProgress size={20} />
                        ) : (
                          <RefreshIcon fontSize="small" />
                        )}
                      </IconButton>
                      
                      <IconButton 
                        color="error" 
                        size="small"
                        onClick={() => confirmDelete(instance)}
                        disabled={instance.status === 'connected' || refreshing[instance._id]}
                        title="Excluir"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleOpenWebhookDialog(instance)}
                        title="Configurar Webhook"
                      >
                        <SettingsIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Nenhuma instância encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Modal para criar instância */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Nova Instância</DialogTitle>
        <DialogContent>
          <Box mt={2}>
            <TextField
              fullWidth
              label="Nome da Instância"
              name="instanceName"
              value={formData.instanceName}
              onChange={handleInputChange}
              required
              helperText="Use apenas letras, números e sublinhados. Sem espaços ou caracteres especiais."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            color="primary"
            disabled={!formData.instanceName}
          >
            Criar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de confirmação de exclusão */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirmar Exclusão</DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja excluir a instância "{selectedInstance?.instanceName}"?
            Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Excluir</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo do QR Code */}
      <Dialog open={qrCodeDialogOpen} onClose={handleQrCodeClose} maxWidth="sm" fullWidth>
        <DialogTitle>Conectar WhatsApp</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" alignItems="center" mt={2}>
            <Typography variant="body1" gutterBottom textAlign="center">
              Escaneie o QR code com seu WhatsApp para conectar a instância "{selectedInstance?.instanceName}"
            </Typography>
            
            {selectedInstance?.qrcode ? (
              <Box mt={2} p={1} bgcolor="#FFFFFF">
                <img 
                  src={selectedInstance.qrcode} 
                  alt="QR Code" 
                  style={{ width: '100%', maxWidth: 300 }} 
                />
              </Box>
            ) : (
              <Box display="flex" justifyContent="center" my={4}>
                <CircularProgress />
              </Box>
            )}
            
            <Typography variant="caption" color="text.secondary" mt={2} textAlign="center">
              O QR code é válido por 60 segundos. Se expirar, feche este diálogo e tente novamente.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleQrCodeClose}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de configuração de webhook */}
      <Dialog
        open={webhookDialogOpen}
        onClose={() => setWebhookDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Configurar Webhook para {selectedInstance?.instanceName}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ p: 1 }}>
            <Typography variant="body2" gutterBottom>
              Configure o webhook para receber eventos da API Evolution para esta instância.
            </Typography>

            <Box display="flex" alignItems="center" mb={2}>
              <Typography variant="subtitle1" mr={2}>
                Ativar Webhook:
              </Typography>
              <Chip 
                label={webhookConfig.enabled ? "Ativado" : "Desativado"} 
                color={webhookConfig.enabled ? "success" : "default"}
                onClick={() => setWebhookConfig({...webhookConfig, enabled: !webhookConfig.enabled})}
              />
            </Box>
            
            {webhookConfig.enabled && (
              <>
                <TextField
                  fullWidth
                  label="URL do Webhook"
                  value={webhookConfig.url}
                  onChange={(e) => setWebhookConfig({...webhookConfig, url: e.target.value})}
                  placeholder="https://seu-dominio.com/api/webhook/nome-da-instancia"
                  margin="normal"
                  helperText="URL para onde os eventos do WhatsApp serão enviados"
                  required
                />
                
                <Box display="flex" mt={2} mb={1}>
                  <Box flex={1} mr={1}>
                    <Chip
                      clickable
                      color={webhookConfig.webhookByEvents ? "primary" : "default"}
                      label="Webhook por Eventos"
                      onClick={() => setWebhookConfig({...webhookConfig, webhookByEvents: !webhookConfig.webhookByEvents})}
                      sx={{ width: '100%' }}
                    />
                    <Typography variant="caption" display="block" mt={0.5}>
                      Criar URLs específicas para cada evento (adiciona /nome-do-evento no final da URL)
                    </Typography>
                  </Box>
                  
                  <Box flex={1} ml={1}>
                    <Chip
                      clickable
                      color={webhookConfig.webhookBase64 ? "primary" : "default"}
                      label="Mídia em Base64"
                      onClick={() => setWebhookConfig({...webhookConfig, webhookBase64: !webhookConfig.webhookBase64})}
                      sx={{ width: '100%' }}
                    />
                    <Typography variant="caption" display="block" mt={0.5}>
                      Enviar imagens, vídeos e arquivos como base64 no webhook
                    </Typography>
                  </Box>
                </Box>
                
                <Typography variant="subtitle1" mt={3} mb={1}>
                  Eventos a monitorar:
                </Typography>
                
                <Box sx={{ 
                  display: 'grid', 
                  gridTemplateColumns: {
                    xs: '1fr', 
                    sm: '1fr 1fr', 
                    md: '1fr 1fr 1fr'
                  },
                  gap: 1
                }}>
                  {availableEvents.map((event) => (
                    <Chip
                      key={event}
                      label={event}
                      clickable
                      color={webhookConfig.events.includes(event) ? "primary" : "default"}
                      onClick={() => {
                        if (webhookConfig.events.includes(event)) {
                          setWebhookConfig({
                            ...webhookConfig,
                            events: webhookConfig.events.filter(e => e !== event)
                          });
                        } else {
                          setWebhookConfig({
                            ...webhookConfig,
                            events: [...webhookConfig.events, event]
                          });
                        }
                      }}
                      sx={{ mb: 1 }}
                    />
                  ))}
                </Box>
                
                <Box display="flex" justifyContent="space-between" mt={2}>
                  <Button 
                    variant="outlined"
                    onClick={() => setWebhookConfig({...webhookConfig, events: []})}
                  >
                    Limpar Seleção
                  </Button>
                  
                  <Button 
                    variant="outlined"
                    onClick={() => setWebhookConfig({...webhookConfig, events: [...availableEvents]})}
                  >
                    Selecionar Todos
                  </Button>
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWebhookDialogOpen(false)}>Cancelar</Button>
          <Button 
            onClick={handleSaveWebhook} 
            variant="contained"
            color="primary"
            disabled={webhookConfig.enabled && !webhookConfig.url}
          >
            {webhookConfig.enabled ? 'Salvar Configuração' : 'Remover Webhook'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar para mensagens */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Instances; 