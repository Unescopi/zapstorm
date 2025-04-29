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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  SelectChangeEvent,
  Snackbar,
  Alert
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PreviewIcon from '@mui/icons-material/Preview';
import api from '../../services/api';
import { AlertColor } from '@mui/material/Alert';

type Template = {
  _id: string;
  name: string;
  content: string;
  variables: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'none';
  createdAt: string;
};

const mediaTypeLabels = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
  none: 'Nenhum'
};

const Templates: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    content: '',
    variables: '',
    mediaUrl: '',
    mediaType: 'none'
  });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: AlertColor }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/templates');
      setTemplates(response.data.data);
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao carregar templates', severity: 'error' });
      console.error('Erro ao carregar templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (template: Template | null = null) => {
    if (template) {
      setSelectedTemplate(template);
      setFormData({
        name: template.name,
        content: template.content,
        variables: template.variables.join(', '),
        mediaUrl: template.mediaUrl || '',
        mediaType: template.mediaType || 'none'
      });
    } else {
      setSelectedTemplate(null);
      setFormData({
        name: '',
        content: '',
        variables: '',
        mediaUrl: '',
        mediaType: 'none'
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedTemplate(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name as string]: value
    });
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        name: formData.name,
        content: formData.content,
        variables: formData.variables ? formData.variables.split(',').map(v => v.trim()) : [],
        mediaUrl: formData.mediaUrl || undefined,
        mediaType: formData.mediaType === 'none' ? undefined : formData.mediaType
      };

      if (selectedTemplate) {
        await api.put(`/templates/${selectedTemplate._id}`, payload);
      } else {
        await api.post('/templates', payload);
      }
      
      setSnackbar({ open: true, message: selectedTemplate ? 'Template atualizado com sucesso!' : 'Template criado com sucesso!', severity: 'success' });
      handleCloseDialog();
      loadTemplates();
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao salvar template', severity: 'error' });
      console.error('Erro ao salvar template:', error);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    
    try {
      await api.delete(`/templates/${selectedTemplate._id}`);
      setSnackbar({ open: true, message: 'Template excluído com sucesso!', severity: 'success' });
      loadTemplates();
      setDeleteConfirmOpen(false);
      setSelectedTemplate(null);
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao excluir template', severity: 'error' });
      console.error('Erro ao excluir template:', error);
    }
  };

  const confirmDelete = (template: Template) => {
    setSelectedTemplate(template);
    setDeleteConfirmOpen(true);
  };

  const handleDuplicate = async (template: Template) => {
    try {
      const payload = {
        name: `${template.name} (Cópia)`,
        content: template.content,
        variables: template.variables,
        mediaUrl: template.mediaUrl,
        mediaType: template.mediaType
      };
      
      await api.post('/templates', payload);
      setSnackbar({ open: true, message: 'Template duplicado com sucesso!', severity: 'success' });
      loadTemplates();
    } catch (error) {
      setSnackbar({ open: true, message: 'Erro ao duplicar template', severity: 'error' });
      console.error('Erro ao duplicar template:', error);
    }
  };

  const handlePreview = (template: Template) => {
    setSelectedTemplate(template);
    setPreviewOpen(true);
  };

  const shortenContent = (content: string, maxLength = 50) => {
    if (content.length <= maxLength) return content;
    return `${content.substring(0, maxLength)}...`;
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Templates</Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Novo Template
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
                <TableCell>Conteúdo</TableCell>
                <TableCell>Variáveis</TableCell>
                <TableCell>Mídia</TableCell>
                <TableCell>Criado em</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.length > 0 ? (
                templates.map((template) => (
                  <TableRow key={template._id}>
                    <TableCell>{template.name}</TableCell>
                    <TableCell>{shortenContent(template.content)}</TableCell>
                    <TableCell>
                      {template.variables.map((variable, index) => (
                        <Chip 
                          key={index} 
                          label={variable} 
                          size="small" 
                          variant="outlined"
                          sx={{ m: 0.5 }} 
                        />
                      ))}
                    </TableCell>
                    <TableCell>
                      {template.mediaType && template.mediaType !== 'none' ? (
                        <Chip 
                          label={mediaTypeLabels[template.mediaType]} 
                          color="primary" 
                          size="small" 
                        />
                      ) : 'Nenhuma'}
                    </TableCell>
                    <TableCell>{new Date(template.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="center">
                      <IconButton 
                        color="info" 
                        size="small" 
                        onClick={() => handlePreview(template)}
                      >
                        <PreviewIcon fontSize="small" />
                      </IconButton>
                      <IconButton 
                        color="primary" 
                        size="small" 
                        onClick={() => handleOpenDialog(template)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton 
                        color="success" 
                        size="small"
                        onClick={() => handleDuplicate(template)}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                      <IconButton 
                        color="error" 
                        size="small"
                        onClick={() => confirmDelete(template)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Nenhum template encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Modal para criar/editar template */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{selectedTemplate ? 'Editar Template' : 'Novo Template'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Nome do Template"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Conteúdo da Mensagem"
                name="content"
                value={formData.content}
                onChange={handleInputChange}
                required
                multiline
                rows={6}
                helperText="Use {{variável}} para inserir variáveis dinâmicas."
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Variáveis"
                name="variables"
                value={formData.variables}
                onChange={handleInputChange}
                helperText="Separe as variáveis por vírgula. Ex: nome, data, código"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Mídia</InputLabel>
                <Select
                  name="mediaType"
                  value={formData.mediaType}
                  onChange={handleSelectChange}
                  label="Tipo de Mídia"
                >
                  <MenuItem value="none">Nenhum</MenuItem>
                  <MenuItem value="image">Imagem</MenuItem>
                  <MenuItem value="video">Vídeo</MenuItem>
                  <MenuItem value="audio">Áudio</MenuItem>
                  <MenuItem value="document">Documento</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            {formData.mediaType !== 'none' && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="URL da Mídia"
                  name="mediaUrl"
                  value={formData.mediaUrl}
                  onChange={handleInputChange}
                  required={formData.mediaType !== 'none'}
                  placeholder="https://exemplo.com/imagem.jpg"
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            color="primary"
            disabled={!formData.name || !formData.content || (formData.mediaType !== 'none' && !formData.mediaUrl)}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo de confirmação de exclusão */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirmar Exclusão</DialogTitle>
        <DialogContent>
          Tem certeza que deseja excluir o template "{selectedTemplate?.name}"?
          Esta ação não pode ser desfeita.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Excluir</Button>
        </DialogActions>
      </Dialog>

      {/* Modal de visualização */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Visualização do Template</DialogTitle>
        <DialogContent>
          {selectedTemplate && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                {selectedTemplate.name}
              </Typography>
              
              {selectedTemplate.mediaUrl && selectedTemplate.mediaType === 'image' && (
                <Box mb={2} display="flex" justifyContent="center">
                  <img 
                    src={selectedTemplate.mediaUrl} 
                    alt="Imagem do template" 
                    style={{ maxWidth: '100%', maxHeight: '300px' }} 
                  />
                </Box>
              )}
              
              <Typography variant="body1" style={{ whiteSpace: 'pre-line' }}>
                {selectedTemplate.content}
              </Typography>
              
              {selectedTemplate.variables.length > 0 && (
                <Box mt={3}>
                  <Typography variant="subtitle1" gutterBottom>
                    Variáveis disponíveis:
                  </Typography>
                  <Box>
                    {selectedTemplate.variables.map((variable, index) => (
                      <Chip 
                        key={index} 
                        label={variable} 
                        color="primary"
                        size="small" 
                        sx={{ m: 0.5 }} 
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar para feedback visual */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert elevation={6} variant="filled" onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Templates; 