const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Rotas
const contactRoutes = require('./routes/contactRoutes');
const templateRoutes = require('./routes/templateRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const instanceRoutes = require('./routes/instanceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const alertRoutes = require('./routes/alertRoutes');
const { errorHandler } = require('./middlewares/errorMiddleware');

// Carregar variáveis de ambiente
dotenv.config();

// Inicializar app
const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Conectar ao MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zapstorm')
  .then(() => console.log('Conexão com MongoDB estabelecida'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/instances', instanceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/webhook', webhookRoutes);

// Rota de teste
app.get('/', (req, res) => {
  res.send('API ZapStorm está rodando!');
});

// Middleware de tratamento de erros
app.use(errorHandler);

// Exportar app
module.exports = app; 