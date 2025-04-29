FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Instalar dependências
RUN npm install

# Remover bcrypt que não funciona e adicionar bcryptjs
RUN npm uninstall bcrypt && \
    npm install bcryptjs

COPY . .

# Criar um arquivo de substituição para bcrypt que usa bcryptjs
RUN echo 'module.exports = require("bcryptjs");' > /app/node_modules/bcrypt.js && \
    echo '{ "name": "bcrypt", "main": "../bcrypt.js" }' > /app/node_modules/bcrypt/package.json

EXPOSE 3000

CMD ["npm", "start"] 