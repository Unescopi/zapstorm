import React from 'react';
import {
  Box,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  InputAdornment,
  Paper,
  Slider,
  Switch,
  TextField,
  Typography,
  Tooltip,
  IconButton,
  Stack,
  Divider,
  Alert
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import SchoolIcon from '@mui/icons-material/School';

interface MessageInterval {
  min: number;
  max: number;
}

interface PauseDuration {
  min: number;
  max: number;
}

interface PauseAfter {
  count: number;
  duration: PauseDuration;
}

interface AntiSpamConfig {
  sendTyping: boolean;
  typingTime: number;
  messageInterval: MessageInterval;
  pauseAfter: PauseAfter;
  distributeDelivery: boolean;
  randomizeContent: boolean;
  avoidSimilarMessages: boolean;
  adaptiveThrottling: boolean;
}

interface AntiSpamSettingsProps {
  antiSpamConfig: AntiSpamConfig;
  onChange: (config: AntiSpamConfig) => void;
  rotateInstances: boolean;
  onRotateInstancesChange: (value: boolean) => void;
  rotationStrategy: string;
  onRotationStrategyChange: (value: string) => void;
}

const AntiSpamSettings = ({
  antiSpamConfig,
  onChange,
  rotateInstances,
  onRotateInstancesChange,
  rotationStrategy,
  onRotationStrategyChange
}: AntiSpamSettingsProps) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = event.target;
    
    // Para campos aninhados como 'messageInterval.min'
    if (name.includes('.')) {
      const parts = name.split('.');
      
      if (parts.length === 2) {
        // Campo aninhado simples, como messageInterval.min
        const [parent, child] = parts;
        
        if (parent === 'messageInterval') {
          const updated: MessageInterval = {
            ...antiSpamConfig.messageInterval,
            [child]: type === 'checkbox' ? checked : Number(value)
          };
          
          onChange({
            ...antiSpamConfig,
            messageInterval: updated
          });
        } else if (parent === 'pauseAfter') {
          if (child === 'count') {
            onChange({
              ...antiSpamConfig,
              pauseAfter: {
                ...antiSpamConfig.pauseAfter,
                count: Number(value)
              }
            });
          }
        }
      } else if (parts.length === 3) {
        // Campo duplamente aninhado, como pauseAfter.duration.min
        const [parent, middle, child] = parts;
        
        if (parent === 'pauseAfter' && middle === 'duration') {
          const updatedDuration: PauseDuration = {
            ...antiSpamConfig.pauseAfter.duration,
            [child]: Number(value)
          };
          
          onChange({
            ...antiSpamConfig,
            pauseAfter: {
              ...antiSpamConfig.pauseAfter,
              duration: updatedDuration
            }
          });
        }
      }
    } else {
      // Para campos simples
      onChange({
        ...antiSpamConfig,
        [name]: type === 'checkbox' ? checked : Number(value)
      });
    }
  };

  const handleSliderChange = (name: string) => (_: Event, value: number | number[]) => {
    if (typeof value === 'number') {
      // Para campos aninhados como 'messageInterval.min'
      if (name.includes('.')) {
        const parts = name.split('.');
        
        if (parts.length === 2) {
          const [parent, child] = parts;
          
          if (parent === 'messageInterval') {
            onChange({
              ...antiSpamConfig,
              messageInterval: {
                ...antiSpamConfig.messageInterval,
                [child]: value
              }
            });
          } else if (parent === 'pauseAfter') {
            onChange({
              ...antiSpamConfig,
              pauseAfter: {
                ...antiSpamConfig.pauseAfter,
                [child]: value
              }
            });
          }
        } else if (parts.length === 3) {
          const [parent, middle, child] = parts;
          
          if (parent === 'pauseAfter' && middle === 'duration') {
            onChange({
              ...antiSpamConfig,
              pauseAfter: {
                ...antiSpamConfig.pauseAfter,
                duration: {
                  ...antiSpamConfig.pauseAfter.duration,
                  [child]: value
                }
              }
            });
          }
        }
      } else {
        onChange({
          ...antiSpamConfig,
          [name]: value
        });
      }
    }
  };

  const handleSwitchChange = (name: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = event.target;
    
    if (name === 'rotateInstances') {
      onRotateInstancesChange(checked);
    } else {
      // Para campos simples
      onChange({
        ...antiSpamConfig,
        [name]: checked
      });
    }
  };

  const handleStrategyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onRotationStrategyChange(event.target.value);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box mb={2}>
        <Typography variant="h6" gutterBottom>
          Configurações Anti-Spam e Proteção de Bloqueio
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Box display="flex" alignItems="center">
            <SchoolIcon sx={{ mr: 1 }} />
            <Typography variant="body2">
              Estas configurações ajudam a tornar o envio de mensagens mais natural e reduzir chances de bloqueio.
            </Typography>
          </Box>
        </Alert>
      </Box>

      <Box mb={4}>
        <FormControl component="fieldset" fullWidth margin="normal">
          <FormLabel component="legend">Comportamento Natural</FormLabel>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={antiSpamConfig.sendTyping}
                  onChange={handleSwitchChange('sendTyping')}
                  name="sendTyping"
                  color="primary"
                />
              }
              label={
                <Box display="flex" alignItems="center">
                  <Typography>Simular digitação</Typography>
                  <Tooltip title="Envia o indicador de 'digitando...' antes de cada mensagem para simular comportamento natural">
                    <IconButton size="small">
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            />
            
            {antiSpamConfig.sendTyping && (
              <Box pl={4} pr={2} mt={1} mb={2}>
                <Typography gutterBottom>
                  Tempo de digitação (ms):
                </Typography>
                <Slider
                  value={antiSpamConfig.typingTime}
                  onChange={handleSliderChange('typingTime')}
                  aria-labelledby="typing-time-slider"
                  valueLabelDisplay="auto"
                  step={500}
                  marks
                  min={1000}
                  max={10000}
                />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="caption">1s</Typography>
                  <Typography variant="caption">10s</Typography>
                </Box>
              </Box>
            )}
            
            <FormControlLabel
              control={
                <Switch
                  checked={antiSpamConfig.distributeDelivery}
                  onChange={handleSwitchChange('distributeDelivery')}
                  name="distributeDelivery"
                  color="primary"
                />
              }
              label={
                <Box display="flex" alignItems="center">
                  <Typography>Distribuir entrega ao longo do tempo</Typography>
                  <Tooltip title="Distribui o envio de mensagens em lotes menores para evitar picos de atividade suspeitos">
                    <IconButton size="small">
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            />
          </FormGroup>
        </FormControl>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box mb={4}>
        <FormControl component="fieldset" fullWidth margin="normal">
          <FormLabel component="legend">Variação de Conteúdo</FormLabel>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={antiSpamConfig.randomizeContent}
                  onChange={handleSwitchChange('randomizeContent')}
                  name="randomizeContent"
                  color="primary"
                />
              }
              label={
                <Box display="flex" alignItems="center">
                  <Typography>Variar conteúdo sutilmente</Typography>
                  <Tooltip title="Adiciona variações sutis ao texto (espaços, caracteres especiais) para evitar detecção de mensagens idênticas">
                    <IconButton size="small">
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={antiSpamConfig.avoidSimilarMessages}
                  onChange={handleSwitchChange('avoidSimilarMessages')}
                  name="avoidSimilarMessages"
                  color="primary"
                />
              }
              label={
                <Box display="flex" alignItems="center">
                  <Typography>Evitar mensagens similares em sequência</Typography>
                  <Tooltip title="Agrupa os contatos para que mensagens muito similares não sejam enviadas em sequência">
                    <IconButton size="small">
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            />
          </FormGroup>
        </FormControl>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box mb={4}>
        <FormControl component="fieldset" fullWidth margin="normal">
          <FormLabel component="legend">Intervalos Entre Mensagens</FormLabel>
          <Box p={2}>
            <Typography gutterBottom>
              Intervalo entre mensagens (ms):
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" mb={2}>
              <TextField
                label="Mínimo"
                type="number"
                size="small"
                value={antiSpamConfig.messageInterval.min}
                onChange={handleChange}
                name="messageInterval.min"
                InputProps={{
                  endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                }}
                inputProps={{ min: 1000, max: 10000 }}
              />
              <TextField
                label="Máximo"
                type="number"
                size="small"
                value={antiSpamConfig.messageInterval.max}
                onChange={handleChange}
                name="messageInterval.max"
                InputProps={{
                  endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                }}
                inputProps={{ min: 1000, max: 30000 }}
              />
            </Stack>
            
            <Typography gutterBottom>
              Pausa após enviar várias mensagens:
            </Typography>
            <Box mb={2}>
              <TextField
                label="Pausa após quantas mensagens"
                type="number"
                size="small"
                fullWidth
                value={antiSpamConfig.pauseAfter.count}
                onChange={handleChange}
                name="pauseAfter.count"
                inputProps={{ min: 5, max: 100 }}
                sx={{ mb: 2 }}
              />
              
              <Typography variant="subtitle2" gutterBottom>
                Duração da pausa (ms):
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                  label="Mínimo"
                  type="number"
                  size="small"
                  value={antiSpamConfig.pauseAfter.duration.min}
                  onChange={handleChange}
                  name="pauseAfter.duration.min"
                  InputProps={{
                    endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                  }}
                  inputProps={{ min: 5000, max: 120000 }}
                />
                <TextField
                  label="Máximo"
                  type="number"
                  size="small"
                  value={antiSpamConfig.pauseAfter.duration.max}
                  onChange={handleChange}
                  name="pauseAfter.duration.max"
                  InputProps={{
                    endAdornment: <InputAdornment position="end">ms</InputAdornment>,
                  }}
                  inputProps={{ min: 5000, max: 300000 }}
                />
              </Stack>
            </Box>
          </Box>
        </FormControl>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box mb={2}>
        <FormControl component="fieldset" fullWidth margin="normal">
          <FormLabel component="legend">Proteção Avançada de Bloqueio</FormLabel>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={antiSpamConfig.adaptiveThrottling}
                  onChange={handleSwitchChange('adaptiveThrottling')}
                  name="adaptiveThrottling"
                  color="primary"
                />
              }
              label={
                <Box display="flex" alignItems="center">
                  <Typography>Throttling adaptativo</Typography>
                  <Tooltip title="Ajusta automaticamente as taxas de envio baseado no feedback da plataforma">
                    <IconButton size="small">
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={rotateInstances}
                  onChange={handleSwitchChange('rotateInstances')}
                  name="rotateInstances"
                  color="primary"
                />
              }
              label={
                <Box display="flex" alignItems="center">
                  <Typography>Rotação de instâncias</Typography>
                  <Tooltip title="Alterna entre instâncias disponíveis para distribuir o envio e reduzir risco de bloqueio">
                    <IconButton size="small">
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
            />

            {rotateInstances && (
              <Box pl={4} mt={1}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <FormLabel id="rotation-strategy-label" sx={{ mb: 1 }}>Estratégia de rotação</FormLabel>
                  <Stack direction="row" spacing={1}>
                    <FormControlLabel
                      value="round-robin"
                      control={
                        <Switch
                          checked={rotationStrategy === 'round-robin'}
                          onChange={handleStrategyChange}
                          name="rotationStrategy"
                          color="primary"
                          value="round-robin"
                        />
                      }
                      label="Round-Robin"
                    />
                    <FormControlLabel
                      value="health-based"
                      control={
                        <Switch
                          checked={rotationStrategy === 'health-based'}
                          onChange={handleStrategyChange}
                          name="rotationStrategy"
                          color="primary"
                          value="health-based"
                        />
                      }
                      label="Baseada em Saúde"
                    />
                    <FormControlLabel
                      value="load-balanced"
                      control={
                        <Switch
                          checked={rotationStrategy === 'load-balanced'}
                          onChange={handleStrategyChange}
                          name="rotationStrategy"
                          color="primary"
                          value="load-balanced"
                        />
                      }
                      label="Balanceamento de Carga"
                    />
                  </Stack>
                </FormControl>
              </Box>
            )}

            <Alert severity="warning" sx={{ mt: 2 }}>
              A rotação de instâncias requer múltiplas instâncias conectadas e configuradas.
            </Alert>
          </FormGroup>
        </FormControl>
      </Box>
    </Paper>
  );
};

export default AntiSpamSettings; 