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
  Tabs,
  Tab
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import SettingsIcon from '@mui/icons-material/Settings';
import WebhookIcon from '@mui/icons-material/Webhook';
import api from '../../services/api';
import WebhookConfig from '../../components/WebhookConfig';
import { Instance as InstanceType } from '../../types/Instance';

// Definição do tipo para setTimeout/setInterval
type TimeoutType = ReturnType<typeof setTimeout>;

// Usando o tipo InstanceType do arquivo de tipos para evitar duplicação
type Instance = InstanceType;

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
  
  // Estado para diálogo de detalhes da instância
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [tabValue, setTabValue] = useState(0);

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

  // Abrir diálogo de detalhes da instância
  const openInstanceDetails = async (instance: Instance) => {
    setSelectedInstance(instance);
    setDetailsDialogOpen(true);
    setTabValue(0);
  };

  // Fechar diálogo de detalhes
  const handleCloseDetailsDialog = () => {
    setDetailsDialogOpen(false);
    setSelectedInstance(null);
  };

  // Lidar com mudança de abas
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Atualizar instância após alteração
  const handleInstanceUpdated = () => {
    if (selectedInstance) {
      loadInstanceDetails(selectedInstance._id);
    }
    loadInstances(false);
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Instâncias WhatsApp</Typography>
        <Box>
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<SyncIcon />}
            onClick={handleSyncInstances}
            disabled={syncLoading}
            sx={{ mr: 1 }}
          >
            {syncLoading ? 'Sincronizando...' : 'Sincronizar Instâncias'}
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setOpenDialog(true)}
          >
            Nova Instância
          </Button>
        </Box>
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
                    <TableCell>{instance.instanceName}</TableCell>
                    <TableCell>
                      <Chip 
                        label={statusLabels[instance.status]} 
                        color={statusColors[instance.status] as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {instance.owner ? (
                        <Box display="flex" alignItems="center">
                          {instance.profilePictureUrl && (
                            <Avatar 
                              src={instance.profilePictureUrl}
                              sx={{ width: 24, height: 24, mr: 1 }}
                            />
                          )}
                          {instance.owner.replace('@s.whatsapp.net', '')}
                        </Box>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {instance.lastConnection ? new Date(instance.lastConnection).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell>
                      {new Date(instance.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell align="center">
                      {refreshing[instance._id] ? (
                        <CircularProgress size={24} />
                      ) : (
                        <>
                          {instance.status === 'disconnected' && (
                            <IconButton 
                              color="primary" 
                              size="small"
                              onClick={() => handleConnect(instance)}
                              title="Conectar"
                            >
                              <QrCode2Icon fontSize="small" />
                            </IconButton>
                          )}
                          
                          {instance.status === 'connected' && (
                            <IconButton 
                              color="warning" 
                              size="small"
                              onClick={() => handleDisconnect(instance)}
                              title="Desconectar"
                            >
                              <LogoutIcon fontSize="small" />
                            </IconButton>
                          )}
                          
                          <IconButton 
                            color="info" 
                            size="small"
                            onClick={() => handleRestart(instance)}
                            title="Reiniciar"
                          >
                            <RefreshIcon fontSize="small" />
                          </IconButton>
                          
                          <IconButton 
                            color="success" 
                            size="small"
                            onClick={() => openInstanceDetails(instance)}
                            title="Configurações"
                          >
                            <SettingsIcon fontSize="small" />
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
                        </>
                      )}
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

      {/* Diálogo de detalhes da instância */}
      <Dialog 
        open={detailsDialogOpen} 
        onClose={handleCloseDetailsDialog} 
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedInstance?.instanceName}
          <Chip 
            label={selectedInstance?.status ? statusLabels[selectedInstance.status] : 'Desconhecido'} 
            color={selectedInstance?.status ? statusColors[selectedInstance.status] as any : 'default'}
            size="small"
            sx={{ ml: 1 }}
          />
        </DialogTitle>
        <DialogContent>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange}
            sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
          >
            <Tab label="Informações" icon={<PhoneAndroidIcon />} iconPosition="start" />
            <Tab label="Webhook" icon={<WebhookIcon />} iconPosition="start" />
          </Tabs>
          
          {tabValue === 0 && selectedInstance && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Informações da Instância
              </Typography>
              
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 'bold', width: '30%' }}>
                        Nome da Instância
                      </TableCell>
                      <TableCell>{selectedInstance.instanceName}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                        Status
                      </TableCell>
                      <TableCell>{statusLabels[selectedInstance.status]}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                        Telefone
                      </TableCell>
                      <TableCell>{selectedInstance.owner?.replace('@s.whatsapp.net', '') || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                        Nome do Perfil
                      </TableCell>
                      <TableCell>{selectedInstance.profileName || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                        Última Conexão
                      </TableCell>
                      <TableCell>
                        {selectedInstance.lastConnection 
                          ? new Date(selectedInstance.lastConnection).toLocaleString() 
                          : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>
                        Criado em
                      </TableCell>
                      <TableCell>
                        {new Date(selectedInstance.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
          
          {tabValue === 1 && selectedInstance && (
            <WebhookConfig 
              instance={selectedInstance} 
              onWebhookUpdated={handleInstanceUpdated} 
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetailsDialog}>Fechar</Button>
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