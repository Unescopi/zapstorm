import React, { useState, useEffect } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  CssBaseline,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  useTheme,
  Badge,
  Popover,
  Card,
  CardContent,
  CardActions,
  Button,
  Stack,
  Chip
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import CampaignIcon from '@mui/icons-material/Campaign';
import DescriptionIcon from '@mui/icons-material/Description';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeContext } from '../../App';
import LogoImage from '../../assets/images/logo.png';

const drawerWidth = 240;

// Tipo para os alertas
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

interface AlertSummary {
  total: number;
  byLevel: {
    critical: number;
    warning: number;
    info: number;
  };
  recentAlerts: Alert[];
}

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const theme = useTheme();
  const { mode, toggleColorMode } = useThemeContext();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(true);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationsAnchorEl, setNotificationsAnchorEl] = useState<null | HTMLElement>(null);
  const [alertSummary, setAlertSummary] = useState<AlertSummary | null>(null);

  // Novo: Polling para buscar alertas a cada 15 segundos
  useEffect(() => {
    // Buscar alertas imediatamente ao montar o componente
    fetchAlertSummary();
    
    // Configurar intervalo para buscar a cada 15 segundos
    const interval = setInterval(fetchAlertSummary, 15000);
    
    // Limpar intervalo ao desmontar
    return () => clearInterval(interval);
  }, []);

  const fetchAlertSummary = async () => {
    try {
      const response = await api.get('/alerts/unread-summary');
      if (response.data.success) {
        setAlertSummary(response.data.data);
      }
    } catch (error) {
      console.error('Erro ao buscar resumo de alertas:', error);
    }
  };

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationsOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationsAnchorEl(event.currentTarget);
  };

  const handleNotificationsClose = () => {
    setNotificationsAnchorEl(null);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const handleProfile = () => {
    handleClose();
    navigate('/profile');
  };

  const handleLogout = () => {
    handleClose();
    signOut();
    navigate('/login');
  };

  const handleViewAllAlerts = () => {
    handleNotificationsClose();
    navigate('/alerts');
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.post('/alerts/read-all');
      fetchAlertSummary();
    } catch (error) {
      console.error('Erro ao marcar alertas como lidos:', error);
    }
  };

  const handleMarkAsRead = async (alertId: string) => {
    try {
      await api.post(`/alerts/${alertId}/read`);
      fetchAlertSummary();
    } catch (error) {
      console.error('Erro ao marcar alerta como lido:', error);
    }
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
    { text: 'Contatos', icon: <PeopleIcon />, path: '/contacts' },
    { text: 'Campanhas', icon: <CampaignIcon />, path: '/campaigns' },
    { text: 'Templates', icon: <DescriptionIcon />, path: '/templates' },
    { text: 'Instâncias', icon: <PhoneAndroidIcon />, path: '/instances' },
    { text: 'Configurações', icon: <SettingsIcon />, path: '/settings' },
  ];

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // Obter o ícone correto para a notificação com base no número de alertas
  const getNotificationIcon = () => {
    if (!alertSummary || alertSummary.total === 0) {
      return <NotificationsIcon />;
    }
    
    return (
      <Badge 
        badgeContent={alertSummary.total} 
        color={alertSummary.byLevel.critical > 0 ? "error" : alertSummary.byLevel.warning > 0 ? "warning" : "info"}
      >
        <NotificationsActiveIcon />
      </Badge>
    );
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

  // Obter cor do alerta com base no nível
  const getAlertColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar 
        position="fixed" 
        sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1,
          width: open ? `calc(100% - ${drawerWidth}px)` : '100%',
          ml: open ? `${drawerWidth}px` : 0,
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="toggle drawer"
            onClick={handleDrawerToggle}
            edge="start"
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <Box 
              component="img" 
              src={LogoImage} 
              alt="ZapStorm Logo" 
              sx={{ 
                height: 55,
                mr: 1,
                display: { xs: 'none', sm: 'block' }
              }} 
            />
            <Typography variant="h6" noWrap component="div">
              ZapStorm
            </Typography>
          </Box>
          
          {/* Notification Icon */}
          <Tooltip title="Notificações">
            <IconButton 
              color="inherit" 
              onClick={handleNotificationsOpen} 
              sx={{ mr: 1 }}
            >
              {getNotificationIcon()}
            </IconButton>
          </Tooltip>
          
          <Tooltip title={mode === 'light' ? 'Modo Escuro' : 'Modo Claro'}>
            <IconButton 
              color="inherit" 
              onClick={toggleColorMode} 
              sx={{ mr: 1 }}
            >
              {mode === 'light' ? <Brightness4Icon /> : <Brightness7Icon />}
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Menu do usuário">
            <IconButton
              size="large"
              aria-label="user account"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleMenu}
              color="inherit"
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user ? getInitials(user.name) : 'U'}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu
            id="menu-appbar"
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorEl)}
            onClose={handleClose}
          >
            <MenuItem onClick={handleProfile}>
              <ListItemIcon>
                <AccountCircleIcon fontSize="small" />
              </ListItemIcon>
              Meu Perfil
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Sair
            </MenuItem>
          </Menu>

          {/* Notifications Popover */}
          <Popover
            open={Boolean(notificationsAnchorEl)}
            anchorEl={notificationsAnchorEl}
            onClose={handleNotificationsClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <Box sx={{ width: 400, maxWidth: '100%', p: 1 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" p={1}>
                <Typography variant="h6">Notificações</Typography>
                {(alertSummary && alertSummary.total > 0) ? (
                  <Button size="small" onClick={handleMarkAllAsRead}>
                    Marcar todas como lidas
                  </Button>
                ) : null}
              </Box>
              <Divider />
              
              {!alertSummary || alertSummary.total === 0 ? (
                <Box p={2} textAlign="center">
                  <Typography color="text.secondary">
                    Nenhuma notificação não lida
                  </Typography>
                </Box>
              ) : (
                <>
                  <Box p={1}>
                    <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                      {alertSummary.byLevel.critical > 0 && (
                        <Chip 
                          label={`${alertSummary.byLevel.critical} crítico(s)`} 
                          color="error" 
                          size="small" 
                        />
                      )}
                      {alertSummary.byLevel.warning > 0 && (
                        <Chip 
                          label={`${alertSummary.byLevel.warning} alerta(s)`} 
                          color="warning" 
                          size="small" 
                        />
                      )}
                      {alertSummary.byLevel.info > 0 && (
                        <Chip 
                          label={`${alertSummary.byLevel.info} informação(ões)`} 
                          color="info" 
                          size="small" 
                        />
                      )}
                    </Stack>
                    
                    <Stack spacing={1}>
                      {alertSummary.recentAlerts.map((alert) => (
                        <Card key={alert._id} variant="outlined">
                          <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                              <Chip 
                                label={alert.level} 
                                color={getAlertColor(alert.level) as any} 
                                size="small" 
                                sx={{ mb: 0.5 }}
                              />
                              <Typography variant="caption" color="text.secondary">
                                {formatDate(alert.createdAt)}
                              </Typography>
                            </Box>
                            <Typography variant="body2" gutterBottom>
                              {alert.message}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {alert.relatedTo?.type && `${alert.relatedTo.type}: ${alert.relatedTo.name || 'N/A'}`}
                            </Typography>
                          </CardContent>
                          <CardActions sx={{ justifyContent: 'flex-end', py: 0 }}>
                            <Button size="small" onClick={() => handleMarkAsRead(alert._id)}>
                              Marcar como lido
                            </Button>
                          </CardActions>
                        </Card>
                      ))}
                    </Stack>
                  </Box>
                  
                  {alertSummary.total > 5 && (
                    <Box p={1} textAlign="center">
                      <Button 
                        variant="outlined" 
                        size="small" 
                        fullWidth
                        onClick={handleViewAllAlerts}
                      >
                        Ver todas ({alertSummary.total})
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </Popover>
        </Toolbar>
      </AppBar>
      
      <Drawer
        variant="permanent"
        open={open}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => handleNavigate(item.path)}
                >
                  <ListItemIcon>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 0, mt: '64px' }}>
        {children}
      </Box>
    </Box>
  );
} 