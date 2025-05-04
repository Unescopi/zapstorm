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
  Tooltip,
  TableSortLabel,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import FindReplaceIcon from '@mui/icons-material/FindReplace';
import api from '../../services/api';
import MuiAlert from '@mui/material/Alert';

type Contact = {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
  createdAt: string;
  lastUpdated: string;
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
  
  // Estados para ordenação
  const [sortField, setSortField] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Novos estados para importação de contatos
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState({ total: 0, success: 0, failed: 0 });

  // Novos estados para seleção múltipla
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [multipleDeleteConfirmOpen, setMultipleDeleteConfirmOpen] = useState(false);
  
  // Novo estado para exportação
  const [exportLoading, setExportLoading] = useState(false);

  // Novos estados para verificação de duplicados
  const [duplicatesDialogOpen, setDuplicatesDialogOpen] = useState(false);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<{ [key: string]: Contact[] }>({});
  const [removingDuplicates, setRemovingDuplicates] = useState(false);

  useEffect(() => {
    loadContacts();
  }, [page, rowsPerPage, searchTerm, sortField, sortOrder]);

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
          search: searchTerm || undefined,
          sortField,
          sortOrder
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
      await api.post('/contacts/delete-multiple', { ids: selectedContacts });
      
      setSnackbar({ 
        open: true, 
        message: `${selectedContacts.length} contato(s) excluído(s) com sucesso!`, 
        severity: 'success' 
      });
      
      loadContacts();
      setMultipleDeleteConfirmOpen(false);
      setSelectedContacts([]);
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao excluir contatos', severity: 'error' });
      console.error('Erro ao excluir múltiplos contatos:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Função para ordenar os contatos
  const handleSort = (field: string) => {
    // Se clicar no mesmo campo que já está ordenando, inverte a direção
    if (field === sortField) {
      setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Se clicar em um novo campo, ordena ascendente por padrão
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Função para exportar contatos
  const handleExport = async () => {
    try {
      setExportLoading(true);
      
      // Criar URL para download com os mesmos filtros da visualização atual
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      params.append('sortField', sortField);
      params.append('sortOrder', sortOrder);
      
      // Fazer requisição para o endpoint de exportação com os parâmetros de filtro
      const response = await api.get(`/contacts/export?${params.toString()}`, {
        responseType: 'blob' // Importante para receber o arquivo como blob
      });
      
      // Criar URL para o blob e iniciar download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Nome do arquivo
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'contatos.csv';
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch && filenameMatch.length > 1) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      // Limpar URL criada
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      
      setSnackbar({ open: true, message: 'Exportação concluída com sucesso!', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao exportar contatos', severity: 'error' });
      console.error('Erro ao exportar contatos:', error);
    } finally {
      setExportLoading(false);
    }
  };

  const confirmDelete = (contact: Contact) => {
    setSelectedContact(contact);
    setDeleteConfirmOpen(true);
  };

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = contacts.map(contact => contact._id);
      setSelectedContacts(newSelected);
      return;
    }
    setSelectedContacts([]);
  };

  const handleSelectOne = (id: string) => {
    const selectedIndex = selectedContacts.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedContacts, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedContacts.slice(1));
    } else if (selectedIndex === selectedContacts.length - 1) {
      newSelected = newSelected.concat(selectedContacts.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedContacts.slice(0, selectedIndex),
        selectedContacts.slice(selectedIndex + 1)
      );
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
    // Remover qualquer caractere não numérico e o sinal de +
    let digits = phone.replace(/\D/g, '');
    
    // Garantir que temos apenas dígitos
    if (!digits) return phone;
    
    // Se começar com 55 (código do Brasil), formatar como número brasileiro
    if (digits.startsWith('55') && digits.length >= 12) {
      // Formato: +55 (XX) XXXXX-XXXX
      return `+55 (${digits.substring(2, 4)}) ${digits.substring(4, 9)}-${digits.substring(9)}`;
    }
    
    // Se não reconhecer o formato, retornar o número original formatado com +
    return '+' + digits;
  };

  const formatPhoneForImport = (phone: string): string => {
    // Remove todos os caracteres não numéricos, exceto o sinal de +
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // Verificar se já tem o + no início
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    
    // Se não tiver +, verificar se tem o código do país
    if (cleaned.startsWith('55')) {
      return '+' + cleaned;
    }
    
    // Se não tiver código do país, adicionar +55 (Brasil)
    return '+55' + cleaned;
  };

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

  // Função para encontrar contatos com telefones duplicados
  const findDuplicates = async () => {
    try {
      setDuplicatesLoading(true);
      // Buscar todos os contatos (sem paginação)
      const response = await api.get('/contacts', {
        params: {
          limit: 1000000, // Número grande para obter todos
        }
      });
      
      const allContacts = response.data.data;
      
      // Organizar contatos por número de telefone
      const contactsByPhone: { [key: string]: Contact[] } = {};
      
      allContacts.forEach((contact: Contact) => {
        // Normalizar o telefone para comparação (remover formatações)
        const normalizedPhone = contact.phone.replace(/\D/g, '');
        
        if (!contactsByPhone[normalizedPhone]) {
          contactsByPhone[normalizedPhone] = [];
        }
        
        contactsByPhone[normalizedPhone].push(contact);
      });
      
      // Filtrar apenas os números que têm mais de um contato
      const duplicatesFound: { [key: string]: Contact[] } = {};
      
      Object.keys(contactsByPhone).forEach(phone => {
        if (contactsByPhone[phone].length > 1) {
          duplicatesFound[phone] = contactsByPhone[phone];
        }
      });
      
      setDuplicates(duplicatesFound);
      setDuplicatesDialogOpen(true);
      
      // Se não encontrou duplicados, exibir mensagem
      if (Object.keys(duplicatesFound).length === 0) {
        setSnackbar({ 
          open: true, 
          message: 'Não foram encontrados contatos com números duplicados!', 
          severity: 'info' 
        });
      }
      
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: 'Erro ao buscar contatos duplicados', 
        severity: 'error' 
      });
      console.error('Erro ao buscar duplicados:', error);
    } finally {
      setDuplicatesLoading(false);
    }
  };
  
  // Função para remover contatos duplicados
  const removeDuplicates = async () => {
    try {
      setRemovingDuplicates(true);
      
      // Para cada conjunto de telefones duplicados, manter apenas o primeiro e excluir os demais
      const deletionPromises: Promise<any>[] = [];
      
      Object.values(duplicates).forEach(duplicateContacts => {
        // Ordenar por data de criação (manter o mais antigo)
        const sortedContacts = [...duplicateContacts].sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        // Pular o primeiro contato (mais antigo) e excluir os demais
        for (let i = 1; i < sortedContacts.length; i++) {
          deletionPromises.push(api.delete(`/contacts/${sortedContacts[i]._id}`));
        }
      });
      
      await Promise.all(deletionPromises);
      
      setSnackbar({ 
        open: true, 
        message: `${deletionPromises.length} contato(s) duplicado(s) removido(s) com sucesso!`, 
        severity: 'success' 
      });
      
      // Fechar o diálogo e recarregar os contatos
      setDuplicatesDialogOpen(false);
      loadContacts();
      
    } catch (error) {
      setSnackbar({ 
        open: true, 
        message: 'Erro ao remover contatos duplicados', 
        severity: 'error' 
      });
      console.error('Erro ao remover duplicados:', error);
    } finally {
      setRemovingDuplicates(false);
    }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Contatos</Typography>
        <Box>
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={<FindReplaceIcon />}
            onClick={findDuplicates}
            disabled={duplicatesLoading}
            sx={{ mr: 1 }}
          >
            {duplicatesLoading ? 'Buscando...' : 'Verificar Duplicados'}
          </Button>
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={exportLoading || contacts.length === 0}
            sx={{ mr: 1 }}
          >
            {exportLoading ? 'Exportando...' : 'Exportar Contatos'}
          </Button>
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
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'name'}
                      direction={sortField === 'name' ? sortOrder : 'asc'}
                      onClick={() => handleSort('name')}
                    >
                      Nome
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'phone'}
                      direction={sortField === 'phone' ? sortOrder : 'asc'}
                      onClick={() => handleSort('phone')}
                    >
                      Telefone
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Tags</TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'createdAt'}
                      direction={sortField === 'createdAt' ? sortOrder : 'asc'}
                      onClick={() => handleSort('createdAt')}
                    >
                      Criado em
                    </TableSortLabel>
                  </TableCell>
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
                        <TableCell>
                          {contact.tags && contact.tags.length > 0 ? (
                            <Box display="flex" flexWrap="wrap" gap={0.5}>
                              {contact.tags.map((tag, index) => (
                                <Chip key={index} label={tag} size="small" />
                              ))}
                            </Box>
                          ) : '-'}
                        </TableCell>
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
                    <TableCell colSpan={8} align="center">
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

      {/* Diálogo para mostrar contatos duplicados */}
      <Dialog 
        open={duplicatesDialogOpen} 
        onClose={() => setDuplicatesDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Contatos com Números Duplicados</DialogTitle>
        <DialogContent>
          {Object.keys(duplicates).length === 0 ? (
            <Typography>Não foram encontrados contatos com números duplicados.</Typography>
          ) : (
            <>
              <Typography variant="body1" gutterBottom>
                Foram encontrados {Object.keys(duplicates).length} números de telefone com contatos duplicados.
                Ao remover duplicados, será mantido o registro mais antigo de cada número.
              </Typography>
              
              <List>
                {Object.entries(duplicates).map(([phone, contacts]) => (
                  <React.Fragment key={phone}>
                    <ListItem>
                      <ListItemText 
                        primary={`Telefone: ${formatPhoneNumber(contacts[0].phone)}`} 
                        secondary={`${contacts.length} contatos com este número`} 
                      />
                    </ListItem>
                    {contacts.map((contact, index) => (
                      <ListItem key={contact._id} sx={{ pl: 4 }}>
                        <ListItemText
                          primary={`${index + 1}. ${contact.name}`}
                          secondary={`Criado em: ${new Date(contact.createdAt).toLocaleString()}`}
                        />
                        {index === 0 && (
                          <ListItemSecondaryAction>
                            <Chip label="Será mantido" color="success" size="small" />
                          </ListItemSecondaryAction>
                        )}
                      </ListItem>
                    ))}
                  </React.Fragment>
                ))}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicatesDialogOpen(false)}>Cancelar</Button>
          {Object.keys(duplicates).length > 0 && (
            <Button 
              onClick={removeDuplicates} 
              variant="contained" 
              color="primary"
              disabled={removingDuplicates}
            >
              {removingDuplicates ? 'Removendo...' : 'Remover Duplicados'}
            </Button>
          )}
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