const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { 
  User, 
  Contact, 
  Template, 
  Instance
} = require('../models');
const bcrypt = require('bcrypt');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Conexão com MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/zapstorm')
  .then(() => console.log('Conectado ao MongoDB'))
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

// Dados de seed
const adminUser = {
  name: 'Administrador',
  email: 'admin@zapstorm.com',
  password: 'admin123',
  role: 'admin'
};

const templates = [
  {
    name: 'Boas-vindas',
    content: 'Olá {{nome}}, bem-vindo(a) à nossa plataforma! Estamos felizes em tê-lo(a) conosco.',
    mediaType: 'none'
  },
  {
    name: 'Confirmação',
    content: 'Olá {{nome}}, confirmamos o seu agendamento para {{data}} às {{hora}}. Qualquer dúvida, estamos à disposição.',
    mediaType: 'none'
  },
  {
    name: 'Promoção',
    content: 'Olá {{nome}}! Temos uma promoção especial para você. Use o cupom {{cupom}} e ganhe {{desconto}} de desconto em sua próxima compra.',
    mediaType: 'none'
  }
];

const contacts = [
  {
    phone: '+5511987654321',
    name: 'João Silva',
    tags: ['cliente', 'vip']
  },
  {
    phone: '+5511976543210',
    name: 'Maria Oliveira',
    tags: ['cliente']
  },
  {
    phone: '+5511965432109',
    name: 'Pedro Santos',
    tags: ['cliente', 'devedor']
  },
  {
    phone: '+5511954321098',
    name: 'Ana Souza',
    tags: ['cliente', 'vip']
  },
  {
    phone: '+5511943210987',
    name: 'Carlos Pereira',
    tags: ['cliente']
  }
];

const instance = {
  instanceName: 'instancia1',
  serverUrl: 'https://api.evolution.example.com',
  apiKey: 'sua_api_key_aqui',
  status: 'disconnected',
  throttling: {
    messagesPerSecond: 1,
    messagesPerMinute: 50,
    messagesPerHour: 1000
  }
};

// Função para seed dos dados
const seedData = async () => {
  try {
    // Limpar dados existentes
    await User.deleteMany({});
    await Contact.deleteMany({});
    await Template.deleteMany({});
    await Instance.deleteMany({});
    
    console.log('Dados existentes removidos');
    
    // Criar usuário admin
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminUser.password, salt);
    
    await User.create({
      ...adminUser,
      password: hashedPassword
    });
    
    console.log('Usuário admin criado');
    
    // Criar templates
    await Template.insertMany(templates);
    console.log('Templates criados');
    
    // Criar contatos
    await Contact.insertMany(contacts);
    console.log('Contatos criados');
    
    // Criar instância
    await Instance.create(instance);
    console.log('Instância criada');
    
    console.log('Seed concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('Erro ao realizar seed:', error);
    process.exit(1);
  }
};

// Executar seed
seedData(); 