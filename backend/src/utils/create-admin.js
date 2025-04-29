const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { User } = require('../models');
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

// Dados do novo usuário administrador
const newAdminUser = {
  name: 'Guilherme Prado',
  email: 'gui10prado@hotmail.com',
  password: 'dyg123456',
  role: 'admin'
};

// Função para criar o usuário administrador
const createAdmin = async () => {
  try {
    // Verificar se o usuário já existe
    const existingUser = await User.findOne({ email: newAdminUser.email });
    
    if (existingUser) {
      console.log(`Usuário com email ${newAdminUser.email} já existe. Atualizando senha...`);
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newAdminUser.password, salt);
      
      await User.updateOne(
        { email: newAdminUser.email },
        { 
          $set: { 
            password: hashedPassword,
            role: 'admin',
            name: newAdminUser.name
          } 
        }
      );
      
      console.log('Usuário administrador atualizado com sucesso!');
    } else {
      // Criar novo usuário admin
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newAdminUser.password, salt);
      
      await User.create({
        ...newAdminUser,
        password: hashedPassword
      });
      
      console.log('Novo usuário administrador criado com sucesso!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Erro ao criar/atualizar usuário administrador:', error);
    process.exit(1);
  }
};

// Executar a função
createAdmin(); 