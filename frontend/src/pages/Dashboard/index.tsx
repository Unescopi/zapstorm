import { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  GridLegacy as Grid, 
  Paper, 
  CircularProgress,
  Divider,
  Alert
} from '@mui/material';
import {
  Message as MessageIcon,
  Campaign as CampaignIcon,
  People as PeopleIcon,
  Check as CheckIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';

// Interface atualizada conforme dados retornados pela API
interface DashboardData {
  counts: {
    contacts: number;
    campaigns: number;
    templates: number;
    instances: number;
    activeCampaigns: number;
    connectedInstances: number;
  };
  messages: {
    total: number;
    pending: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  rates: {
    success: string;
    failure: string;
  };
  dailyStats: {
    date: string;
    count: number;
  }[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<any[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        // Carregar estatísticas do dashboard
        const statsResponse = await api.get('/dashboard/stats');
        
        if (statsResponse.data && statsResponse.data.success) {
          setData(statsResponse.data.data);
        } else {
          throw new Error('Formato de resposta inválido');
        }
        
        // Carregar campanhas recentes
        const campaignsResponse = await api.get('/dashboard/recent-campaigns');
        if (campaignsResponse.data && campaignsResponse.data.success) {
          setRecentCampaigns(campaignsResponse.data.data);
        }
        
        setError(null);
      } catch (err: any) {
        console.error('Erro ao carregar dados do dashboard:', err);
        setError(
          err.response?.data?.message || 
          'Erro ao carregar as estatísticas do dashboard.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  // Formatar dados do gráfico
  const formatChartData = () => {
    if (!data || !data.dailyStats) return [];
    
    return data.dailyStats.map(stat => {
      // Formatar a data para exibição (de YYYY-MM-DD para DD/MM)
      const dateParts = stat.date.split('-');
      const formattedDate = `${dateParts[2]}/${dateParts[1]}`;
      
      return {
        date: formattedDate,
        sent: stat.count,
        // Podemos estimar a quantidade entregue (ou usar um valor real se disponível)
        delivered: Math.floor(stat.count * (parseFloat(data.rates.success) / 100))
      };
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
        Não foi possível carregar os dados do dashboard.
      </Alert>
    );
  }

  const chartData = formatChartData();

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="medium">
        Dashboard
      </Typography>
      
      <Grid container spacing={3}>
        {/* Cards de estatísticas */}
        <Grid item xs={12} sm={6} md={4}>
          <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
            <Box display="flex" alignItems="center">
              <Box sx={{ 
                bgcolor: 'primary.light', 
                borderRadius: '50%', 
                p: 1.5, 
                display: 'flex' 
              }}>
                <PeopleIcon sx={{ color: 'common.white' }} />
              </Box>
              <Box ml={2}>
                <Typography variant="subtitle2" color="textSecondary">
                  Total de Contatos
                </Typography>
                <Typography variant="h5" fontWeight="medium">
                  {data.counts.contacts.toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
            <Box display="flex" alignItems="center">
              <Box sx={{ 
                bgcolor: 'secondary.light', 
                borderRadius: '50%', 
                p: 1.5, 
                display: 'flex' 
              }}>
                <CampaignIcon sx={{ color: 'common.white' }} />
              </Box>
              <Box ml={2}>
                <Typography variant="subtitle2" color="textSecondary">
                  Campanhas Ativas
                </Typography>
                <Typography variant="h5" fontWeight="medium">
                  {data.counts.activeCampaigns} / {data.counts.campaigns}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
            <Box display="flex" alignItems="center">
              <Box sx={{ 
                bgcolor: 'success.light', 
                borderRadius: '50%', 
                p: 1.5, 
                display: 'flex' 
              }}>
                <MessageIcon sx={{ color: 'common.white' }} />
              </Box>
              <Box ml={2}>
                <Typography variant="subtitle2" color="textSecondary">
                  Mensagens Enviadas
                </Typography>
                <Typography variant="h5" fontWeight="medium">
                  {(data.messages.sent + data.messages.delivered + data.messages.read).toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Gráfico de mensagens */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Histórico de Envios (Últimos 7 dias)
            </Typography>
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="sent" name="Enviadas" stroke="#8884d8" activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="delivered" name="Entregues" stroke="#82ca9d" />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        {/* Estatísticas de entrega */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Estatísticas de Entrega
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Box display="flex" justifyContent="center">
                  <CheckIcon color="success" fontSize="large" />
                </Box>
                <Typography variant="body2" color="textSecondary">Entregues</Typography>
                <Typography variant="h6">{data.messages.delivered.toLocaleString()}</Typography>
              </Box>
              
              <Divider orientation="vertical" flexItem />
              
              <Box sx={{ textAlign: 'center' }}>
                <Box display="flex" justifyContent="center">
                  <ErrorIcon color="error" fontSize="large" />
                </Box>
                <Typography variant="body2" color="textSecondary">Falhas</Typography>
                <Typography variant="h6">{data.messages.failed.toLocaleString()}</Typography>
              </Box>
              
              <Divider orientation="vertical" flexItem />
              
              <Box sx={{ textAlign: 'center' }}>
                <Box display="flex" justifyContent="center">
                  <ScheduleIcon color="primary" fontSize="large" />
                </Box>
                <Typography variant="body2" color="textSecondary">Taxa de Sucesso</Typography>
                <Typography variant="h6">{data.rates.success}%</Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Campanhas Recentes */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Campanhas Recentes
            </Typography>
            <Box sx={{ mt: 2 }}>
              {recentCampaigns.length > 0 ? (
                recentCampaigns.map((campaign) => (
                  <Box key={campaign._id} sx={{ py: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body1">{campaign.name}</Typography>
                      <Typography variant="body2" color="textSecondary">
                        {new Date(campaign.createdAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="textSecondary">
                      {campaign.metrics ? 
                        `${campaign.metrics.sent || 0} enviadas • ${campaign.metrics.delivered || 0} entregues` : 
                        'Sem dados de métricas'
                      }
                    </Typography>
                    {recentCampaigns.indexOf(campaign) < recentCampaigns.length - 1 && (
                      <Divider sx={{ mt: 1.5 }} />
                    )}
                  </Box>
                ))
              ) : (
                <Typography variant="body2" color="textSecondary" align="center">
                  Nenhuma campanha recente
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
} 