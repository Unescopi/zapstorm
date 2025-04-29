const mongoose = require('mongoose');
const { User } = require('./src/models');
const bcryptjs = require('bcryptjs');

// Conexão com MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/zapstorm')
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
      console.log('Usuário já existe. Atualizando senha...');
      
      const salt = await bcryptjs.genSalt(10);
      const hashedPassword = await bcryptjs.hash(newAdminUser.password, salt);
      
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
      const salt = await bcryptjs.genSalt(10);
      const hashedPassword = await bcryptjs.hash(newAdminUser.password, salt);
      
      await User.create({
        ...newAdminUser,
        password: hashedPassword
      });
      
      console.log('Novo usuário administrador criado com sucesso!');
    }
    
    console.log('Operação concluída.');
    
    // Esperar um pouco antes de sair para que o log seja exibido
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error('Erro ao criar/atualizar usuário administrador:', error);
    process.exit(1);
  }
};

// Executar a função
createAdmin(); 