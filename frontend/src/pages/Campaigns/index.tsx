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
  Chip, 
  IconButton, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  GridLegacy as Grid,
  CircularProgress,
  SelectChangeEvent,
  Checkbox,
  ListItemText,
  InputAdornment,
  Divider,
  List,
  ListItem,
  ListItemButton,
  Pagination,
  FormControlLabel,
  Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import ReplayIcon from '@mui/icons-material/Replay';
import SearchIcon from '@mui/icons-material/Search';
import api from '../../services/api';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert, { AlertColor } from '@mui/material/Alert';

const statusColors = {
  draft: 'default',
  queued: 'info',
  running: 'success',
  paused: 'warning',
  completed: 'success',
  failed: 'error',
  canceled: 'error'
};

const statusLabels = {
  draft: 'Rascunho',
  queued: 'Agendada',
  running: 'Em Execução',
  paused: 'Pausada',
  completed: 'Concluída',
  failed: 'Falha',
  canceled: 'Cancelada'
};

interface Contact {
  _id: string;
  name: string;
  phone: string;
}

interface Campaign {
  _id: string;
  name: string;
  templateId: {
    _id: string;
    name: string;
  };
  instanceId: string;
  status: 'draft' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled';
  schedule: {
    type: string;
    startAt?: string;
    endAt?: string;
    recurrencePattern?: 'daily' | 'weekly' | 'monthly';
    recurrenceTime?: string;
    recurrenceDays?: number[];
  };
  contacts?: string[];
  createdAt: string;
  metrics: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    pending: number;
  };
}

type Template = {
  _id: string;
  name: string;
};

type Instance = {
  _id: string;
  instanceName: string;
  status: string;
};

const Campaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsTotalCount, setContactsTotalCount] = useState(0);
  const [contactsCurrentPage, setContactsCurrentPage] = useState(1);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    templateId: '',
    instanceId: '',
    scheduleType: 'immediate',
    startAt: '',
    endAt: '',
    contacts: [] as string[],
    recurrencePattern: 'daily',
    recurrenceTime: '09:00',
    recurrenceDays: [] as number[],
  });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({ open: false, message: '', severity: 'success' });
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsPerPage] = useState(10);

  useEffect(() => {
    loadCampaigns();
    loadTemplates();
    loadInstances();
    loadContactsFirstPage();
  }, []);

  useEffect(() => {
    if (contacts.length > 0) {
      const filtered = contacts.filter(contact => 
        contact.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        contact.phone.toLowerCase().includes(contactSearch.toLowerCase())
      );
      setFilteredContacts(filtered);
    }
  }, [contactSearch, contacts]);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const response = await api.get('/campaigns');
      setCampaigns(response.data.data);
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao carregar campanhas', severity: 'error' });
      console.error('Erro ao carregar campanhas:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await api.get('/templates');
      setTemplates(response.data.data);
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao carregar templates', severity: 'error' });
      console.error('Erro ao carregar templates:', error);
    }
  };

  const loadInstances = async () => {
    try {
      const response = await api.get('/instances');
      setInstances(response.data.data);
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao carregar instâncias', severity: 'error' });
      console.error('Erro ao carregar instâncias:', error);
    }
  };

  const loadContactsFirstPage = async () => {
    try {
      setContactsLoading(true);
      const response = await api.get('/contacts', {
        params: {
          page: 1,
          limit: 100
        }
      });
      
      setContacts(response.data.data);
      setContactsTotalCount(response.data.total);
      setContactsCurrentPage(1);
      
      if (response.data.total > response.data.data.length) {
        loadRemainingContacts(2, response.data.total);
      }
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao carregar contatos', severity: 'error' });
      console.error('Erro ao carregar contatos:', error);
    } finally {
      setContactsLoading(false);
    }
  };
  
  const loadRemainingContacts = async (startPage: number, totalContacts: number) => {
    try {
      const limit = 100;
      const totalPages = Math.ceil(totalContacts / limit);
      
      let allContacts = [...contacts];
      
      for (let page = startPage; page <= totalPages; page++) {
        const response = await api.get('/contacts', {
          params: {
            page,
            limit
          }
        });
        
        allContacts = [...allContacts, ...response.data.data];
        
        setContacts(allContacts);
        setContactsCurrentPage(page);
        
        if (allContacts.length >= totalContacts) {
          break;
        }
      }
    } catch (error) {
      console.error('Erro ao carregar contatos adicionais:', error);
    }
  };

  const handleOpenDialog = (campaign: Campaign | null = null) => {
    if (campaign) {
      setSelectedCampaign(campaign);
      setFormData({
        name: campaign.name || '',
        templateId: campaign.templateId && campaign.templateId._id ? campaign.templateId._id : '',
        instanceId: campaign.instanceId || '',
        scheduleType: campaign.schedule?.type || 'immediate',
        startAt: campaign.schedule?.startAt || '',
        endAt: campaign.schedule?.endAt || '',
        contacts: campaign.contacts || [],
        recurrencePattern: campaign.schedule?.recurrencePattern || 'daily',
        recurrenceTime: campaign.schedule?.recurrenceTime || '09:00',
        recurrenceDays: campaign.schedule?.recurrenceDays || [],
      });
    } else {
      setSelectedCampaign(null);
      setFormData({
        name: '',
        templateId: '',
        instanceId: '',
        scheduleType: 'immediate',
        startAt: '',
        endAt: '',
        contacts: [],
        recurrencePattern: 'daily',
        recurrenceTime: '09:00',
        recurrenceDays: [],
      });
    }
    setFilteredContacts(contacts);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedCampaign(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name as string]: value,
    });
  };
  
  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleRecurrenceDaysChange = (event: SelectChangeEvent<number[]>) => {
    setFormData(prev => ({
      ...prev,
      recurrenceDays: event.target.value as number[]
    }));
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        name: formData.name,
        templateId: formData.templateId,
        instanceId: formData.instanceId,
        schedule: {
          type: formData.scheduleType,
          startAt: formData.startAt || undefined,
          endAt: formData.endAt || undefined,
          recurrencePattern: formData.scheduleType === 'recurring' ? formData.recurrencePattern : undefined,
          recurrenceTime: formData.scheduleType === 'recurring' ? formData.recurrenceTime : undefined,
          recurrenceDays: formData.scheduleType === 'recurring' && formData.recurrencePattern === 'weekly' ? formData.recurrenceDays : undefined
        },
        contacts: formData.contacts,
      };

      console.log('Enviando payload para o backend:', payload);

      if (selectedCampaign) {
        await api.put(`/campaigns/${selectedCampaign._id}`, payload);
      } else {
        await api.post('/campaigns', payload);
      }
      
      setSnackbar({ open: true, message: selectedCampaign ? 'Campanha atualizada com sucesso!' : 'Campanha criada com sucesso!', severity: 'success' });
      handleCloseDialog();
      loadCampaigns();
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao salvar campanha', severity: 'error' });
      console.error('Erro ao salvar campanha:', error);
    }
  };

  const handleDelete = async () => {
    if (!selectedCampaign) return;
    
    try {
      await api.delete(`/campaigns/${selectedCampaign._id}`);
      setSnackbar({ open: true, message: 'Campanha deletada com sucesso!', severity: 'success' });
      setDeleteConfirmOpen(false);
      loadCampaigns();
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao deletar campanha', severity: 'error' });
      console.error('Erro ao deletar campanha:', error);
    }
  };

  const confirmDelete = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setDeleteConfirmOpen(true);
  };

  const handleCampaignAction = async (campaignId: string, action: string) => {
    try {
      console.log('Token atual:', localStorage.getItem('@ZapStorm:token'));
      console.log('Iniciando ação de campanha:', action, 'para ID:', campaignId);
      
      const currentCampaign = campaigns.find(c => c._id === campaignId);
      console.log('Campanha atual:', currentCampaign);
      console.log('instanceId da campanha:', currentCampaign?.instanceId);
      
      await api.post(`/campaigns/${campaignId}/${action}`);
      console.log('Ação de campanha concluída com sucesso');
      setSnackbar({ open: true, message: 'Ação realizada com sucesso!', severity: 'success' });
      loadCampaigns();
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao executar ação', severity: 'error' });
      console.error('Erro ao executar ação:', error);
    }
  };

  const handleContactSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContactSearch(e.target.value);
    setContactsPage(1);
  };

  const handleContactDialogOpen = () => {
    setContactDialogOpen(true);
    setContactSearch('');
    setContactsPage(1);
    
    if (contacts.length < contactsTotalCount) {
      loadRemainingContacts(contactsCurrentPage + 1, contactsTotalCount);
    }
  };

  const handleContactDialogClose = () => {
    setContactDialogOpen(false);
  };

  const handleContactToggle = (contactId: string) => {
    setFormData(prevState => {
      const currentContacts = [...prevState.contacts];
      const currentIndex = currentContacts.indexOf(contactId);
      
      if (currentIndex === -1) {
        currentContacts.push(contactId);
      } else {
        currentContacts.splice(currentIndex, 1);
      }
      
      return {
        ...prevState,
        contacts: currentContacts
      };
    });
  };

  const handleSelectAllContacts = () => {
    const allFilteredContactIds = filteredContacts.map(contact => contact._id);
    const allSelected = allFilteredContactIds.every(id => formData.contacts.includes(id));
    
    if (allSelected) {
      const newSelection = formData.contacts.filter(id => !allFilteredContactIds.includes(id));
      setFormData({...formData, contacts: newSelection});
    } else {
      const newSelection = [...new Set([...formData.contacts, ...allFilteredContactIds])];
      setFormData({...formData, contacts: newSelection});
    }
  };

  const indexOfLastContact = contactsPage * contactsPerPage;
  const indexOfFirstContact = indexOfLastContact - contactsPerPage;
  const currentContacts = filteredContacts.slice(indexOfFirstContact, indexOfLastContact);
  const pageCount = Math.ceil(filteredContacts.length / contactsPerPage);

  const handleContactPageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setContactsPage(value);
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Campanhas</Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Nova Campanha
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
                <TableCell>Template</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Progresso</TableCell>
                <TableCell>Criada em</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length > 0 ? (
                campaigns.map((campaign) => (
                  <TableRow key={campaign._id}>
                    <TableCell>{campaign.name}</TableCell>
                    <TableCell>{campaign.templateId && campaign.templateId.name ? campaign.templateId.name : 'Template não disponível'}</TableCell>
                    <TableCell>
                      {campaign.status === 'queued' ? (
                        <Tooltip 
                          title={
                            <Box>
                              <Typography variant="subtitle2">Informações do Agendamento:</Typography>
                              <Typography variant="body2">
                                {campaign.schedule?.type === 'scheduled' ? (
                                  <>
                                    <strong>Data de Início:</strong> {campaign.schedule?.startAt ? new Date(campaign.schedule.startAt).toLocaleString() : 'Não definida'}<br/>
                                    <strong>Data de Término:</strong> {campaign.schedule?.endAt ? new Date(campaign.schedule.endAt).toLocaleString() : 'Não definida'}
                                  </>
                                ) : campaign.schedule?.type === 'recurring' ? (
                                  <>
                                    <strong>Recorrência:</strong> {
                                      campaign.schedule?.recurrencePattern === 'daily' ? 'Diária' :
                                      campaign.schedule?.recurrencePattern === 'weekly' ? 'Semanal' :
                                      campaign.schedule?.recurrencePattern === 'monthly' ? 'Mensal' : 'Não definida'
                                    }<br/>
                                    <strong>Horário:</strong> {campaign.schedule?.recurrenceTime || 'Não definido'}<br/>
                                    {campaign.schedule?.recurrencePattern === 'weekly' && Array.isArray(campaign.schedule?.recurrenceDays) && campaign.schedule?.recurrenceDays.length > 0 && (
                                      <>
                                        <strong>Dias:</strong> {
                                          campaign.schedule?.recurrenceDays.map(
                                            day => ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][day]
                                          ).join(', ')
                                        }
                                      </>
                                    )}
                                  </>
                                ) : 'Sem detalhes disponíveis'}
                              </Typography>
                            </Box>
                          }
                          arrow
                          placement="top"
                        >
                          <Chip 
                            label={statusLabels[campaign.status]} 
                            color={statusColors[campaign.status] as any} 
                            size="small" 
                          />
                        </Tooltip>
                      ) : (
                        <Chip 
                          label={statusLabels[campaign.status]} 
                          color={statusColors[campaign.status] as any} 
                          size="small" 
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {campaign.metrics && campaign.metrics.total > 0 ? (
                        `${campaign.metrics.sent || 0}/${campaign.metrics.total} (${Math.round(((campaign.metrics.sent || 0) / campaign.metrics.total) * 100)}%)`
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>{campaign.createdAt ? new Date(campaign.createdAt).toLocaleString() : 'Data não disponível'}</TableCell>
                    <TableCell align="center">
                      <IconButton 
                        color="primary" 
                        size="small" 
                        onClick={() => handleOpenDialog(campaign)}
                        disabled={campaign.status !== 'draft' && campaign.status !== 'paused'}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      
                      {campaign.status === 'draft' && (
                        <IconButton 
                          color="primary" 
                          size="small"
                          onClick={() => handleCampaignAction(campaign._id, 'start')}
                        >
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                      )}
                      
                      {campaign.status === 'running' && (
                        <IconButton 
                          color="warning" 
                          size="small"
                          onClick={() => handleCampaignAction(campaign._id, 'pause')}
                        >
                          <PauseIcon fontSize="small" />
                        </IconButton>
                      )}
                      
                      {campaign.status === 'paused' && (
                        <IconButton 
                          color="success" 
                          size="small"
                          onClick={() => handleCampaignAction(campaign._id, 'resume')}
                        >
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                      )}
                      
                      {['running', 'paused', 'queued'].includes(campaign.status) && (
                        <IconButton 
                          color="error" 
                          size="small"
                          onClick={() => handleCampaignAction(campaign._id, 'cancel')}
                        >
                          <StopIcon fontSize="small" />
                        </IconButton>
                      )}
                      
                      {campaign.status === 'completed' && campaign.metrics.failed > 0 && (
                        <IconButton 
                          color="warning" 
                          size="small"
                          onClick={() => handleCampaignAction(campaign._id, 'resend-failed')}
                        >
                          <ReplayIcon fontSize="small" />
                        </IconButton>
                      )}
                      
                      <IconButton 
                        color="error" 
                        size="small"
                        onClick={() => confirmDelete(campaign)}
                        disabled={campaign.status === 'running'}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Nenhuma campanha encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{selectedCampaign ? 'Editar Campanha' : 'Nova Campanha'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nome da Campanha"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Template</InputLabel>
                <Select
                  name="templateId"
                  value={formData.templateId}
                  onChange={handleSelectChange}
                  label="Template"
                >
                  {templates.map(template => (
                    <MenuItem key={template._id} value={template._id}>
                      {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Instância</InputLabel>
                <Select
                  name="instanceId"
                  value={formData.instanceId}
                  onChange={handleSelectChange}
                  label="Instância"
                >
                  {instances.map(instance => (
                    <MenuItem 
                      key={instance._id} 
                      value={instance._id}
                      disabled={instance.status !== 'connected'}
                    >
                      {instance.instanceName} {instance.status !== 'connected' ? '(Desconectada)' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight="medium">Contatos Selecionados ({formData.contacts.length})</Typography>
                  <Button 
                    variant="outlined" 
                    size="small" 
                    onClick={handleContactDialogOpen}
                    startIcon={<AddIcon />}
                  >
                    Gerenciar Contatos
                  </Button>
                </Box>
                
                {formData.contacts.length > 0 ? (
                  <Box sx={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: 0.5, 
                    p: 1, 
                    border: '1px solid rgba(0, 0, 0, 0.23)', 
                    borderRadius: 1,
                    minHeight: '56px'
                  }}>
                    {formData.contacts.map((contactId) => {
                      const contact = contacts.find(c => c._id === contactId);
                      return contact ? (
                        <Chip 
                          key={contactId} 
                          label={contact.name} 
                          onDelete={() => handleContactToggle(contactId)}
                          size="small"
                        />
                      ) : null;
                    })}
                  </Box>
                ) : (
                  <Box sx={{ 
                    p: 2, 
                    border: '1px solid rgba(0, 0, 0, 0.23)', 
                    borderRadius: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    color: 'text.secondary'
                  }}>
                    Nenhum contato selecionado
                  </Box>
                )}
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Agendamento</InputLabel>
                <Select
                  name="scheduleType"
                  value={formData.scheduleType}
                  onChange={handleSelectChange}
                  label="Tipo de Agendamento"
                >
                  <MenuItem value="immediate">Imediato</MenuItem>
                  <MenuItem value="scheduled">Data Específica</MenuItem>
                  <MenuItem value="recurring">Recorrente</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            {formData.scheduleType === 'scheduled' && (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Data de Início"
                    name="startAt"
                    type="datetime-local"
                    value={formData.startAt}
                    onChange={handleInputChange}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Data de Término (opcional)"
                    name="endAt"
                    type="datetime-local"
                    value={formData.endAt}
                    onChange={handleInputChange}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </>
            )}

            {formData.scheduleType === 'recurring' && (
              <>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Padrão de Recorrência</InputLabel>
                    <Select
                      name="recurrencePattern"
                      value={formData.recurrencePattern}
                      onChange={handleSelectChange}
                      label="Padrão de Recorrência"
                    >
                      <MenuItem value="daily">Diariamente</MenuItem>
                      <MenuItem value="weekly">Semanalmente</MenuItem>
                      <MenuItem value="monthly">Mensalmente</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Horário de Execução"
                    name="recurrenceTime"
                    type="time"
                    value={formData.recurrenceTime}
                    onChange={handleInputChange}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                {formData.recurrencePattern === 'weekly' && (
                  <Grid item xs={12}>
                    <FormControl fullWidth>
                      <InputLabel>Dias da Semana</InputLabel>
                      <Select
                        multiple
                        value={formData.recurrenceDays}
                        onChange={handleRecurrenceDaysChange}
                        label="Dias da Semana"
                        renderValue={(selected: number[]) => (
                          selected.map(day => ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][day]).join(', ')
                        )}
                      >
                        <MenuItem value={0}>Domingo</MenuItem>
                        <MenuItem value={1}>Segunda</MenuItem>
                        <MenuItem value={2}>Terça</MenuItem>
                        <MenuItem value={3}>Quarta</MenuItem>
                        <MenuItem value={4}>Quinta</MenuItem>
                        <MenuItem value={5}>Sexta</MenuItem>
                        <MenuItem value={6}>Sábado</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                )}
              </>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            color="primary"
            disabled={!formData.name || !formData.templateId || !formData.instanceId || formData.contacts.length === 0}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={contactDialogOpen} onClose={handleContactDialogClose} maxWidth="md" fullWidth>
        <DialogTitle>Selecionar Contatos</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, mt: 1 }}>
            <TextField
              fullWidth
              placeholder="Pesquisar contato por nome ou telefone"
              value={contactSearch}
              onChange={handleContactSearchChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography>
              {filteredContacts.length} contatos encontrados (Total no sistema: {contactsTotalCount})
            </Typography>
            <FormControlLabel
              control={
                <Checkbox 
                  checked={
                    filteredContacts.length > 0 &&
                    filteredContacts.every(contact => formData.contacts.includes(contact._id))
                  }
                  indeterminate={
                    filteredContacts.some(contact => formData.contacts.includes(contact._id)) &&
                    !filteredContacts.every(contact => formData.contacts.includes(contact._id))
                  }
                  onChange={handleSelectAllContacts}
                />
              }
              label="Selecionar todos"
            />
          </Box>

          <Divider />

          <List sx={{ minHeight: '300px', maxHeight: '400px', overflow: 'auto' }}>
            {contactsLoading && contacts.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : currentContacts.length > 0 ? (
              <>
                {currentContacts.map((contact) => (
                  <ListItem key={contact._id} disablePadding>
                    <ListItemButton dense onClick={() => handleContactToggle(contact._id)}>
                      <Checkbox 
                        edge="start"
                        checked={formData.contacts.includes(contact._id)}
                        tabIndex={-1}
                        disableRipple
                      />
                      <ListItemText 
                        primary={contact.name} 
                        secondary={contact.phone} 
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
                {contactsLoading && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
                    <CircularProgress size={20} />
                  </Box>
                )}
              </>
            ) : (
              <ListItem>
                <ListItemText 
                  primary="Nenhum contato encontrado" 
                  primaryTypographyProps={{ align: 'center', color: 'text.secondary' }} 
                />
              </ListItem>
            )}
          </List>

          {pageCount > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination 
                count={pageCount} 
                page={contactsPage} 
                onChange={handleContactPageChange} 
                color="primary"
              />
            </Box>
          )}

          <Box sx={{ 
            mt: 2, 
            p: 2, 
            bgcolor: 'rgba(0, 0, 0, 0.03)', 
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <Typography>
              {formData.contacts.length} contatos selecionados
            </Typography>
            <Button 
              variant="outlined" 
              size="small" 
              color="primary"
              onClick={() => setFormData({...formData, contacts: []})}
            >
              Limpar seleção
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleContactDialogClose}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirmar Exclusão</DialogTitle>
        <DialogContent>
          Tem certeza que deseja excluir a campanha "{selectedCampaign?.name}"?
          Esta ação não pode ser desfeita.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Excluir</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <MuiAlert elevation={6} variant="filled" onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </MuiAlert>
      </Snackbar>
    </Box>
  );
};

export default Campaigns; 