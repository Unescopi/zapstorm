const fs = require('fs');
const path = require('path');

// Caminho para o arquivo do modelo
const userModelPath = path.join(process.cwd(), 'src', 'models', 'User.js');

// Ler o conteúdo do arquivo
try {
  let content = fs.readFileSync(userModelPath, 'utf8');
  
  // Substituir bcrypt por bcryptjs
  content = content.replace(/const bcrypt = require\(['"]bcrypt['"]\);/g, 
                          "const bcrypt = require('bcryptjs');");
  
  // Escrever o conteúdo modificado de volta para o arquivo
  fs.writeFileSync(userModelPath, content);
  
  console.log('Modelo User.js atualizado com sucesso para usar bcryptjs!');
} catch (error) {
  console.error('Erro ao modificar o arquivo:', error);
} 