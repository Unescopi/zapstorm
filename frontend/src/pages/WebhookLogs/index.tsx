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
  TablePagination,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  SelectChangeEvent
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../../services/api';

interface WebhookLog {
  _id: string;
  instanceName: string;
  event: string;
  status: 'success' | 'failed' | 'invalid';
  payload: any;
  responseStatus: number;
  responseMessage: string;
  processingTimeMs: number;
  createdAt: string;
}

const WebhookLogs: React.FC = () => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalLogs, setTotalLogs] = useState(0);
  const [filters, setFilters] = useState({
    instanceName: '',
    event: '',
    status: ''
  });

  const loadLogs = async () => {
    try {
      setLoading(true);
      const response = await api.get('/webhook/logs', {
        params: {
          ...filters,
          page: page + 1,
          limit: rowsPerPage
        }
      });

      if (response.data.success) {
        setLogs(response.data.data.logs);
        setTotalLogs(response.data.data.pagination.total);
      }
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, rowsPerPage, filters]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleTextFieldChange = (field: string) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFilters(prev => ({
      ...prev,
      [field]: event.target.value
    }));
    setPage(0);
  };

  const handleSelectChange = (field: string) => (
    event: SelectChangeEvent
  ) => {
    setFilters(prev => ({
      ...prev,
      [field]: event.target.value
    }));
    setPage(0);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(dateString));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'failed':
        return 'error';
      case 'invalid':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Logs de Webhook</Typography>
        <Tooltip title="Atualizar">
          <IconButton onClick={() => loadLogs()}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Paper sx={{ mb: 2, p: 2 }}>
        <Stack direction="row" spacing={2}>
          <TextField
            label="Instância"
            size="small"
            value={filters.instanceName}
            onChange={handleTextFieldChange('instanceName')}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Evento</InputLabel>
            <Select
              value={filters.event}
              label="Evento"
              onChange={handleSelectChange('event')}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="CONNECTION_UPDATE">Atualização de Conexão</MenuItem>
              <MenuItem value="QRCODE_UPDATED">QR Code Atualizado</MenuItem>
              <MenuItem value="MESSAGES_UPSERT">Novas Mensagens</MenuItem>
              <MenuItem value="MESSAGES_UPDATE">Atualização de Mensagens</MenuItem>
              <MenuItem value="MESSAGES_DELETE">Mensagens Apagadas</MenuItem>
              <MenuItem value="SEND_MESSAGE">Envio de Mensagens</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status}
              label="Status"
              onChange={handleSelectChange('status')}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="success">Sucesso</MenuItem>
              <MenuItem value="failed">Falha</MenuItem>
              <MenuItem value="invalid">Inválido</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Data/Hora</TableCell>
              <TableCell>Instância</TableCell>
              <TableCell>Evento</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Tempo (ms)</TableCell>
              <TableCell>Resposta</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : logs.length > 0 ? (
              logs.map((log) => (
                <TableRow key={log._id}>
                  <TableCell>{formatDate(log.createdAt)}</TableCell>
                  <TableCell>{log.instanceName}</TableCell>
                  <TableCell>{log.event}</TableCell>
                  <TableCell>
                    <Chip
                      label={log.status}
                      size="small"
                      color={getStatusColor(log.status)}
                    />
                  </TableCell>
                  <TableCell>{log.processingTimeMs}</TableCell>
                  <TableCell>
                    {log.responseStatus} - {log.responseMessage}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  Nenhum log encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={totalLogs}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Linhas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
        />
      </TableContainer>
    </Box>
  );
};

export default WebhookLogs; 