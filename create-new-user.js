const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');

// Conexão com MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/zapstorm')
  .then(() => console.log('Conectado ao MongoDB'))
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

// Dados do usuário
const userData = {
  name: 'Admin',
  email: 'admin@zapstorm.com',
  password: 'admin123',
  role: 'admin'
};

// Função para criar usuário
const createUser = async () => {
  try {
    // Criar hash da senha
    const salt = await bcryptjs.genSalt(10);
    const hashedPassword = await bcryptjs.hash(userData.password, salt);
    
    // Inserir usuário diretamente no MongoDB
    await mongoose.connection.collection('users').insertOne({
      name: userData.name,
      email: userData.email,
      password: hashedPassword,
      role: userData.role,
      active: true,
      createdAt: new Date(),
      lastUpdated: new Date()
    });
    
    console.log('Novo usuário criado com sucesso!');
    console.log(`Email: ${userData.email}`);
    console.log(`Senha: ${userData.password}`);
    
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    process.exit(1);
  }
};

// Executar a função
createUser(); 