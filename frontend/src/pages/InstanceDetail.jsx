import InstanceDetail from '../components/InstanceDetail';
import InstanceMetrics from '../components/InstanceMetrics';
import InstanceLogs from '../components/InstanceLogs';
import InstanceSettings from '../components/InstanceSettings';
import InstanceWebhookConfig from '../components/InstanceWebhookConfig';

const InstanceDetailPage = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [instance, setInstance] = useState(null);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const getInstanceData = async () => {
    // Implemente a lógica para obter os dados da instância
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {instance?.instanceName || 'Detalhes da Instância'}
        </Typography>
        
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="instance tabs">
            <Tab label="Detalhes" {...a11yProps(0)} />
            <Tab label="Métricas" {...a11yProps(1)} />
            <Tab label="Configurações" {...a11yProps(2)} />
            <Tab label="Logs" {...a11yProps(3)} />
            <Tab label="Webhook" {...a11yProps(4)} />
          </Tabs>
        </Box>
        
        <TabPanel value={activeTab} index={0}>
          <InstanceDetail instance={instance} refreshInstance={getInstanceData} />
        </TabPanel>
        
        <TabPanel value={activeTab} index={1}>
          <InstanceMetrics instanceId={id} />
        </TabPanel>
        
        <TabPanel value={activeTab} index={2}>
          <InstanceSettings instance={instance} refreshInstance={getInstanceData} />
        </TabPanel>
        
        <TabPanel value={activeTab} index={3}>
          <InstanceLogs instanceId={id} instanceName={instance?.instanceName} />
        </TabPanel>
        
        <TabPanel value={activeTab} index={4}>
          <InstanceWebhookConfig instanceId={id} instanceName={instance?.instanceName} />
        </TabPanel>
        
      </Box>
    </Container>
  );
};

export default InstanceDetailPage; 