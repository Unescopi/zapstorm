const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');

// Conexão com MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongodb:27017/zapstorm')
  .then(() => console.log('Conectado ao MongoDB'))
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });

// Função para testar autenticação
const testAuth = async () => {
  try {
    // Obter o usuário diretamente do MongoDB (sem usar o modelo)
    const user = await mongoose.connection.collection('users').findOne({
      email: 'admin@zapstorm.com'
    });
    
    if (!user) {
      console.log('Usuário não encontrado!');
      process.exit(1);
    }
    
    console.log('Usuário encontrado:');
    console.log(`Email: ${user.email}`);
    console.log(`Hash da senha: ${user.password}`);
    
    // Testar comparação de senha usando bcryptjs diretamente
    const password = 'admin123';
    const isMatch = await bcryptjs.compare(password, user.password);
    
    console.log(`\nComparação de senha com '${password}':`);
    console.log(`Resultado: ${isMatch}`);
    
    // Testar outro tipo de comparação
    const rawUserFromEmail = await mongoose.connection.collection('users').findOne({
      email: 'gui10prado@hotmail.com'
    });
    
    console.log('\nOutro usuário encontrado:');
    console.log(`Email: ${rawUserFromEmail.email}`);
    console.log(`Hash da senha: ${rawUserFromEmail.password}`);
    
    // Testar comparação de senha para este usuário
    const otherPassword = 'dyg123456';
    const otherIsMatch = await bcryptjs.compare(otherPassword, rawUserFromEmail.password);
    
    console.log(`\nComparação de senha com '${otherPassword}':`);
    console.log(`Resultado: ${otherIsMatch}`);
    
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error('Erro ao testar autenticação:', error);
    process.exit(1);
  }
};

// Executar a função
testAuth(); 