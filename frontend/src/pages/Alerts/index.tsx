import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Button,
  Stack,
  CircularProgress,
  Tooltip,
  Alert
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import api from '../../services/api';

interface Alert {
  _id: string;
  type: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  details: any;
  relatedTo: {
    type: string;
    id: string;
    name: string;
  };
  createdAt: string;
  isRead: boolean;
}

interface AlertsResponse {
  success: boolean;
  data: {
    alerts: Alert[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    }
  }
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [filters, setFilters] = useState({
    type: '',
    level: '',
    isRead: ''
  });

  useEffect(() => {
    fetchAlerts();
  }, [page, filters]);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      
      // Construir query string para filtros
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      
      if (filters.type) params.append('type', filters.type);
      if (filters.level) params.append('level', filters.level);
      if (filters.isRead) params.append('isRead', filters.isRead);
      
      const response = await api.get<AlertsResponse>(`/alerts?${params.toString()}`);
      
      if (response.data.success) {
        setAlerts(response.data.data.alerts);
        setTotalPages(response.data.data.pagination.pages);
        setTotalAlerts(response.data.data.pagination.total);
      } else {
        setError('Erro ao buscar alertas');
      }
    } catch (error) {
      console.error('Erro ao buscar alertas:', error);
      setError('Erro ao buscar alertas. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
  };

  const handleFilterChange = (event: SelectChangeEvent) => {
    const { name, value } = event.target;
    setFilters({
      ...filters,
      [name]: value
    });
    setPage(1); // Resetar para primeira página ao mudar filtros
  };

  const handleMarkAsRead = async (alertId: string) => {
    try {
      await api.post(`/alerts/${alertId}/read`);
      
      // Atualizar estado para refletir a mudança
      setAlerts(alerts.map(alert => 
        alert._id === alertId ? { ...alert, isRead: true } : alert
      ));
    } catch (error) {
      console.error('Erro ao marcar alerta como lido:', error);
      setError('Erro ao marcar alerta como lido');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      // Construir query string para filtros (manter os filtros atuais)
      const params = new URLSearchParams();
      if (filters.type) params.append('type', filters.type);
      if (filters.level) params.append('level', filters.level);
      
      await api.post(`/alerts/read-all?${params.toString()}`);
      
      // Atualizar alertas
      fetchAlerts();
    } catch (error) {
      console.error('Erro ao marcar todos alertas como lidos:', error);
      setError('Erro ao marcar todos alertas como lidos');
    }
  };

  // Formatar data para exibição
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Obter cor do chip baseado no nível
  const getChipColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  };

  // Traduzir tipo de alerta para português
  const getAlertTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      'campaign_failure': 'Falha de Campanha',
      'connection_lost': 'Conexão Perdida',
      'high_failure_rate': 'Alta Taxa de Falha',
      'system': 'Sistema',
      'webhook_event': 'Evento de Webhook',
      'connection_update': 'Atualização de Conexão',
      'messages_received': 'Mensagens Recebidas',
      'message_sent': 'Mensagem Enviada',
      'messages_status_update': 'Atualização de Status',
      'messages_deleted': 'Mensagens Excluídas',
      'new_contact': 'Novo Contato'
    };
    
    return typeMap[type] || type;
  };

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Alertas e Notificações
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack 
          direction={{ xs: 'column', sm: 'row' }} 
          spacing={2} 
          sx={{ mb: 2 }}
          alignItems="center"
        >
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="filter-type-label">Tipo</InputLabel>
            <Select
              labelId="filter-type-label"
              name="type"
              value={filters.type}
              label="Tipo"
              onChange={handleFilterChange}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="campaign_failure">Falha de Campanha</MenuItem>
              <MenuItem value="connection_lost">Conexão Perdida</MenuItem>
              <MenuItem value="high_failure_rate">Alta Taxa de Falha</MenuItem>
              <MenuItem value="system">Sistema</MenuItem>
              <MenuItem value="webhook_event">Evento de Webhook</MenuItem>
              <MenuItem value="connection_update">Atualização de Conexão</MenuItem>
              <MenuItem value="messages_received">Mensagens Recebidas</MenuItem>
              <MenuItem value="message_sent">Mensagem Enviada</MenuItem>
              <MenuItem value="messages_status_update">Atualização de Status</MenuItem>
              <MenuItem value="messages_deleted">Mensagens Excluídas</MenuItem>
              <MenuItem value="new_contact">Novo Contato</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="filter-level-label">Nível</InputLabel>
            <Select
              labelId="filter-level-label"
              name="level"
              value={filters.level}
              label="Nível"
              onChange={handleFilterChange}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="info">Informação</MenuItem>
              <MenuItem value="warning">Alerta</MenuItem>
              <MenuItem value="critical">Crítico</MenuItem>
            </Select>
          </FormControl>
          
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="filter-read-label">Leitura</InputLabel>
            <Select
              labelId="filter-read-label"
              name="isRead"
              value={filters.isRead}
              label="Leitura"
              onChange={handleFilterChange}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="false">Não lidos</MenuItem>
              <MenuItem value="true">Lidos</MenuItem>
            </Select>
          </FormControl>
          
          <Box sx={{ flexGrow: 1 }} />
          
          <Button 
            variant="contained" 
            onClick={handleMarkAllAsRead}
            disabled={loading || totalAlerts === 0}
          >
            Marcar todos como lidos
          </Button>
        </Stack>
        
        {loading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : alerts.length === 0 ? (
          <Box textAlign="center" p={3}>
            <Typography color="textSecondary">
              Nenhum alerta encontrado com os filtros selecionados
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table sx={{ minWidth: 650 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Nível</TableCell>
                    <TableCell>Mensagem</TableCell>
                    <TableCell>Relacionado a</TableCell>
                    <TableCell>Data</TableCell>
                    <TableCell align="center">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow 
                      key={alert._id}
                      sx={{ 
                        backgroundColor: alert.isRead ? 'inherit' : 'rgba(25, 118, 210, 0.04)',
                        '&:hover': {
                          backgroundColor: alert.isRead ? 'rgba(0, 0, 0, 0.04)' : 'rgba(25, 118, 210, 0.08)'
                        }
                      }}
                    >
                      <TableCell>
                        {getAlertTypeLabel(alert.type)}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={alert.level} 
                          size="small" 
                          color={getChipColor(alert.level) as any}
                        />
                      </TableCell>
                      <TableCell>{alert.message}</TableCell>
                      <TableCell>
                        {alert.relatedTo?.type && (
                          <Typography variant="body2" color="textSecondary">
                            {alert.relatedTo.type}: {alert.relatedTo.name || 'N/A'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(alert.createdAt)}</TableCell>
                      <TableCell align="center">
                        {!alert.isRead && (
                          <Tooltip title="Marcar como lido">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => handleMarkAsRead(alert._id)}
                            >
                              <CheckCircleIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            
            <Box display="flex" justifyContent="center" p={2}>
              <Pagination 
                count={totalPages} 
                page={page} 
                onChange={handlePageChange} 
                color="primary" 
              />
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
} 