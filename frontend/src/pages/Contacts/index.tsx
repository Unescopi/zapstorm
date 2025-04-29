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
  GridLegacy as Grid,
  CircularProgress,
  TablePagination,
  InputAdornment,
  Snackbar,
  AlertColor,
  LinearProgress,
  Checkbox,
  Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api from '../../services/api';
import MuiAlert from '@mui/material/Alert';

type Contact = {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
  createdAt: string;
};

const Contacts: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    tags: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalContacts, setTotalContacts] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({ open: false, message: '', severity: 'success' });
  
  // Novos estados para importação de contatos
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState({ total: 0, success: 0, failed: 0 });

  // Novos estados para seleção múltipla
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [multipleDeleteConfirmOpen, setMultipleDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    loadContacts();
  }, [page, rowsPerPage, searchTerm]);

  // Limpar seleções quando mudar de página ou filtro
  useEffect(() => {
    setSelectedContacts([]);
  }, [page, rowsPerPage, searchTerm]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/contacts', {
        params: {
          page: page + 1,
          limit: rowsPerPage,
          search: searchTerm || undefined
        }
      });
      setContacts(response.data.data);
      setTotalContacts(response.data.total);
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao carregar contatos', severity: 'error' });
      console.error('Erro ao carregar contatos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (contact: Contact | null = null) => {
    if (contact) {
      setSelectedContact(contact);
      setFormData({
        name: contact.name,
        phone: contact.phone,
        email: contact.email || '',
        tags: contact.tags?.join(', ') || ''
      });
    } else {
      setSelectedContact(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        tags: ''
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedContact(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(0);
  };

  const handleSubmit = async () => {
    try {
      // Formatar número de telefone no formato internacional
      let formattedPhone = formData.phone.replace(/\D/g, ''); // Remove caracteres não numéricos
      
      // Adicionar código do país se não existir
      if (!formattedPhone.startsWith('55')) {
        formattedPhone = '55' + formattedPhone;
      }
      
      // Adicionar o sinal de + para formato internacional
      formattedPhone = '+' + formattedPhone;
      
      const payload = {
        name: formData.name,
        phone: formattedPhone,
        email: formData.email || undefined,
        tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : []
      };

      if (selectedContact) {
        await api.put(`/contacts/${selectedContact._id}`, payload);
        setSnackbar({ open: true, message: 'Contato atualizado com sucesso!', severity: 'success' });
      } else {
        await api.post('/contacts', payload);
        setSnackbar({ open: true, message: 'Contato criado com sucesso!', severity: 'success' });
      }
      
      handleCloseDialog();
      loadContacts();
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao salvar contato. Verifique se o número já está cadastrado ou se está no formato correto.', severity: 'error' });
      console.error('Erro ao salvar contato:', error);
    }
  };

  const handleDelete = async () => {
    if (!selectedContact) return;
    
    try {
      await api.delete(`/contacts/${selectedContact._id}`);
      setSnackbar({ open: true, message: 'Contato excluído com sucesso!', severity: 'success' });
      loadContacts();
      setDeleteConfirmOpen(false);
      setSelectedContact(null);
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao excluir contato', severity: 'error' });
      console.error('Erro ao excluir contato:', error);
    }
  };

  // Função para excluir múltiplos contatos
  const handleMultipleDelete = async () => {
    if (selectedContacts.length === 0) return;
    
    try {
      setLoading(true);
      
      // Excluir cada contato sequencialmente
      for (const contactId of selectedContacts) {
        await api.delete(`/contacts/${contactId}`);
      }
      
      setSnackbar({ 
        open: true, 
        message: `${selectedContacts.length} contato(s) excluído(s) com sucesso!`, 
        severity: 'success' 
      });
      
      // Limpar seleções e recarregar
      setSelectedContacts([]);
      loadContacts();
      setMultipleDeleteConfirmOpen(false);
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao excluir contatos', severity: 'error' });
      console.error('Erro ao excluir contatos:', error);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (contact: Contact) => {
    setSelectedContact(contact);
    setDeleteConfirmOpen(true);
  };

  // Manipuladores para checkboxes
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = contacts.map(contact => contact._id);
      setSelectedContacts(newSelected);
    } else {
      setSelectedContacts([]);
    }
  };

  const handleSelectOne = (id: string) => {
    const selectedIndex = selectedContacts.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = [...selectedContacts, id];
    } else {
      newSelected = selectedContacts.filter(item => item !== id);
    }

    setSelectedContacts(newSelected);
  };

  const isSelected = (id: string) => selectedContacts.indexOf(id) !== -1;

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const formatPhoneNumber = (phone: string) => {
    // Remove qualquer caractere não numérico
    const cleaned = phone.replace(/\D/g, '');
    
    // Verifica o formato do número (com ou sem código do país)
    if (cleaned.length === 13 && cleaned.startsWith('55')) {
      // Formato com código do país (+55)
      const ddd = cleaned.substring(2, 4);
      const part1 = cleaned.substring(4, 9);
      const part2 = cleaned.substring(9);
      return `+55 (${ddd}) ${part1}-${part2}`;
    } else if (cleaned.length === 11) {
      // Formato nacional com 9 dígitos (DDD + 9XXXXXXXX)
      const ddd = cleaned.substring(0, 2);
      const part1 = cleaned.substring(2, 7);
      const part2 = cleaned.substring(7);
      return `(${ddd}) ${part1}-${part2}`;
    } else {
      // Retorna o número como está se não se encaixar nos formatos acima
      return phone;
    }
  };

  // Função para formatar número de telefone para o formato internacional
  const formatPhoneForImport = (phone: string): string => {
    let formattedPhone = phone.replace(/\D/g, ''); // Remove caracteres não numéricos
    
    // Adicionar código do país se não existir
    if (!formattedPhone.startsWith('55')) {
      formattedPhone = '55' + formattedPhone;
    }
    
    // Adicionar o sinal de + para formato internacional
    return '+' + formattedPhone;
  };

  // Função para processar a importação de contatos
  const handleImport = async () => {
    if (!importText.trim()) {
      setSnackbar({ open: true, message: 'Por favor, insira alguns contatos para importar', severity: 'warning' });
      return;
    }

    try {
      setImportLoading(true);
      
      const lines = importText.split('\n').filter(line => line.trim());
      const totalLines = lines.length;
      let successCount = 0;
      let failedCount = 0;
      
      setImportStats({ total: totalLines, success: 0, failed: 0 });
      setImportProgress(0);

      for (let i = 0; i < totalLines; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(';');
        if (parts.length < 2) {
          failedCount++;
          setImportStats(prev => ({ ...prev, failed: prev.failed + 1 }));
          continue;
        }
        
        const [name, phone] = parts;
        
        try {
          const payload = {
            name: name.trim(),
            phone: formatPhoneForImport(phone.trim()),
            email: undefined,
            tags: []
          };
          
          await api.post('/contacts', payload);
          successCount++;
          setImportStats(prev => ({ ...prev, success: prev.success + 1 }));
        } catch (error) {
          failedCount++;
          setImportStats(prev => ({ ...prev, failed: prev.failed + 1 }));
          console.error(`Erro ao importar contato ${name}:`, error);
        }
        
        // Atualizar progresso
        setImportProgress(Math.round(((i + 1) / totalLines) * 100));
      }
      
      // Recarregar a lista após importação
      loadContacts();
      
      setSnackbar({ 
        open: true, 
        message: `Importação concluída: ${successCount} contatos adicionados com sucesso, ${failedCount} contatos falharam.`, 
        severity: successCount > 0 ? 'success' : 'warning' 
      });
      
      // Limpar o formulário, mas manter o diálogo aberto para ver as estatísticas
      setImportText('');
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao importar contatos', severity: 'error' });
      console.error('Erro ao importar contatos:', error);
    } finally {
      setImportLoading(false);
    }
  };

  // Manipulador para abrir o diálogo de importação
  const handleOpenImportDialog = () => {
    setImportDialogOpen(true);
    setImportText('');
    setImportProgress(0);
    setImportStats({ total: 0, success: 0, failed: 0 });
  };

  // Manipulador para fechar o diálogo de importação
  const handleCloseImportDialog = () => {
    setImportDialogOpen(false);
  };

  // Manipulador para o texto de importação
  const handleImportTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportText(e.target.value);
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Contatos</Typography>
        <Box>
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={<UploadFileIcon />}
            onClick={handleOpenImportDialog}
            sx={{ mr: 1 }}
          >
            Importar Contatos
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Novo Contato
          </Button>
        </Box>
      </Box>

      <Box mb={3}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Buscar contatos por nome ou telefone"
          value={searchTerm}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Botão de exclusão múltipla */}
      {selectedContacts.length > 0 && (
        <Box mb={2}>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setMultipleDeleteConfirmOpen(true)}
          >
            Excluir {selectedContacts.length} contato(s) selecionado(s)
          </Button>
        </Box>
      )}

      {loading && contacts.length === 0 ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selectedContacts.length > 0 && selectedContacts.length < contacts.length}
                      checked={contacts.length > 0 && selectedContacts.length === contacts.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>Nome</TableCell>
                  <TableCell>Telefone</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Tags</TableCell>
                  <TableCell>Criado em</TableCell>
                  <TableCell align="center">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contacts.length > 0 ? (
                  contacts.map((contact) => {
                    const isItemSelected = isSelected(contact._id);
                    
                    return (
                      <TableRow 
                        key={contact._id}
                        hover
                        role="checkbox"
                        aria-checked={isItemSelected}
                        selected={isItemSelected}
                        onClick={() => handleSelectOne(contact._id)}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox checked={isItemSelected} />
                        </TableCell>
                        <TableCell>{contact.name}</TableCell>
                        <TableCell>{formatPhoneNumber(contact.phone)}</TableCell>
                        <TableCell>{contact.email || '-'}</TableCell>
                        <TableCell>{contact.tags?.join(', ') || '-'}</TableCell>
                        <TableCell>{new Date(contact.createdAt).toLocaleString()}</TableCell>
                        <TableCell align="center">
                          <Tooltip title="Editar">
                            <IconButton 
                              color="primary" 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDialog(contact);
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Excluir">
                            <IconButton 
                              color="error" 
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDelete(contact);
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      Nenhum contato encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          
          <TablePagination
            component="div"
            count={totalContacts}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="Itens por página:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
          />
        </>
      )}

      {/* Modal para criar/editar contato */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{selectedContact ? 'Editar Contato' : 'Novo Contato'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nome"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Telefone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                required
                placeholder="Ex: 5511999999999"
                helperText="Digite o número com código do país (55) + DDD + número"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tags"
                name="tags"
                value={formData.tags}
                onChange={handleInputChange}
                helperText="Separe as tags por vírgula. Ex: cliente, ativo, prospect"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            color="primary"
            disabled={!formData.name || !formData.phone}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de confirmação de exclusão de um contato */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirmar Exclusão</DialogTitle>
        <DialogContent>
          Tem certeza que deseja excluir o contato "{selectedContact?.name}"?
          Esta ação não pode ser desfeita.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Excluir</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de confirmação de exclusão de múltiplos contatos */}
      <Dialog open={multipleDeleteConfirmOpen} onClose={() => setMultipleDeleteConfirmOpen(false)}>
        <DialogTitle>Confirmar Exclusão em Massa</DialogTitle>
        <DialogContent>
          Tem certeza que deseja excluir {selectedContacts.length} contato(s) selecionado(s)?
          Esta ação não pode ser desfeita.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMultipleDeleteConfirmOpen(false)}>Cancelar</Button>
          <Button onClick={handleMultipleDelete} color="error" variant="contained">Excluir</Button>
        </DialogActions>
      </Dialog>

      {/* Modal para importação de contatos */}
      <Dialog open={importDialogOpen} onClose={handleCloseImportDialog} maxWidth="md" fullWidth>
        <DialogTitle>Importar Contatos</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Cole sua lista de contatos abaixo, um por linha, no formato "Nome;Telefone"
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={10}
            variant="outlined"
            placeholder="Nome;Telefone"
            value={importText}
            onChange={handleImportTextChange}
            disabled={importLoading}
            sx={{ mt: 2 }}
          />
          
          {importLoading && (
            <Box sx={{ width: '100%', mt: 2 }}>
              <LinearProgress variant="determinate" value={importProgress} />
              <Box display="flex" justifyContent="space-between" mt={1}>
                <Typography variant="body2">
                  Progresso: {importProgress}%
                </Typography>
                <Typography variant="body2">
                  {importStats.success} sucesso / {importStats.failed} falha / {importStats.total} total
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseImportDialog} disabled={importLoading}>Fechar</Button>
          <Button 
            onClick={handleImport} 
            variant="contained" 
            color="primary"
            disabled={importLoading || !importText.trim()}
          >
            {importLoading ? 'Importando...' : 'Importar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar para feedback visual */}
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

export default Contacts; 