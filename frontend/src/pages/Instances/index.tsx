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
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListItemText,
  Checkbox,
  OutlinedInput,
  SelectChangeEvent
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import WebhookIcon from '@mui/icons-material/Webhook';
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
  webhookUrl?: string;
  webhookEnabled?: boolean;
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
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [formData, setFormData] = useState({
    instanceName: ''
  });
  const [webhookData, setWebhookData] = useState({
    webhookUrl: '',
    events: [] as string[]
  });
  const [pollingInstance, setPollingInstance] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [syncLoading, setSyncLoading] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info' | 'warning'
  });

  // Lista de eventos disponíveis
  const availableEvents = [
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "MESSAGES_DELETE",
    "SEND_MESSAGE",
    "CONNECTION_UPDATE",
    "CONTACTS_SET",
    "CONTACTS_UPDATE",
    "PRESENCE_UPDATE",
    "CHATS_SET",
    "CHATS_UPDATE"
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

  const handleOpenWebhookDialog = async (instance: Instance) => {
    setSelectedInstance(instance);
    setWebhookLoading(true);
    setWebhookDialogOpen(true);
    
    try {
      // Carregar configuração atual de webhook
      const response = await api.get(`/instances/${instance._id}/webhook`);
      if (response.data.success && response.data.data) {
        const webhookInfo = response.data.data;
        setWebhookData({
          webhookUrl: webhookInfo.url || '',
          events: webhookInfo.events || []
        });
      } else {
        // Sem configuração de webhook, usar padrões
        setWebhookData({
          webhookUrl: instance.webhookUrl || '',
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE", "SEND_MESSAGE", "CONNECTION_UPDATE"]
        });
      }
    } catch (error) {
      console.error('Erro ao carregar configuração de webhook:', error);
      showSnackbar('Erro ao carregar configuração de webhook', 'error');
    } finally {
      setWebhookLoading(false);
    }
  };
  
  const handleWebhookInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setWebhookData({
      ...webhookData,
      [name]: value
    });
  };
  
  const handleEventsChange = (event: SelectChangeEvent<string[]>) => {
    setWebhookData({
      ...webhookData,
      events: event.target.value as string[]
    });
  };
  
  const handleSaveWebhook = async () => {
    if (!selectedInstance) return;
    
    setWebhookLoading(true);
    try {
      const response = await api.post(`/instances/${selectedInstance._id}/webhook`, {
        webhookUrl: webhookData.webhookUrl,
        events: webhookData.events
      });
      
      if (response.data.success) {
        showSnackbar('Webhook configurado com sucesso', 'success');
        setWebhookDialogOpen(false);
        loadInstances();
      } else {
        showSnackbar('Erro ao configurar webhook', 'error');
      }
    } catch (error) {
      console.error('Erro ao configurar webhook:', error);
      showSnackbar('Erro ao configurar webhook', 'error');
    } finally {
      setWebhookLoading(false);
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
                        color="success" 
                        size="small"
                        onClick={() => handleOpenWebhookDialog(instance)}
                        disabled={refreshing[instance._id]}
                        title="Configurar Webhook"
                      >
                        <WebhookIcon fontSize="small" />
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

      {/* Adicione o diálogo de Webhook */}
      <Dialog open={webhookDialogOpen} onClose={() => setWebhookDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Configurar Webhook - {selectedInstance?.instanceName}</DialogTitle>
        <DialogContent>
          {webhookLoading ? (
            <Box display="flex" justifyContent="center" my={4}>
              <CircularProgress />
            </Box>
          ) : (
            <Box mt={2} display="flex" flexDirection="column" gap={3}>
              <Typography variant="body2" color="text.secondary">
                Configure um webhook para receber eventos em tempo real da instância de WhatsApp.
                O webhook deve estar acessível publicamente para que a Evolution API possa enviar os eventos.
              </Typography>
              
              <TextField
                fullWidth
                label="URL do Webhook"
                name="webhookUrl"
                value={webhookData.webhookUrl}
                onChange={handleWebhookInputChange}
                required
                helperText="Ex: https://seu-dominio.com/api/webhook/nome-da-instancia"
              />
              
              <FormControl fullWidth>
                <InputLabel id="events-label">Eventos</InputLabel>
                <Select
                  labelId="events-label"
                  multiple
                  value={webhookData.events}
                  onChange={handleEventsChange}
                  input={<OutlinedInput label="Eventos" />}
                  renderValue={(selected) => (selected as string[]).join(', ')}
                >
                  {availableEvents.map((event) => (
                    <MenuItem key={event} value={event}>
                      <Checkbox checked={webhookData.events.indexOf(event) > -1} />
                      <ListItemText primary={event} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <Typography variant="caption" color="text.secondary">
                Eventos recomendados: MESSAGES_UPSERT, MESSAGES_UPDATE, MESSAGES_DELETE, SEND_MESSAGE, CONNECTION_UPDATE
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWebhookDialogOpen(false)}>Cancelar</Button>
          <Button 
            onClick={handleSaveWebhook} 
            variant="contained" 
            color="primary"
            disabled={!webhookData.webhookUrl || webhookLoading}
          >
            Salvar
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