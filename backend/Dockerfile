FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

# Remover bcrypt que não funciona e adicionar bcryptjs
RUN npm uninstall bcrypt && \
    npm install bcryptjs && \
    mkdir -p /app/node_modules/bcrypt

COPY . .

# Criar um arquivo de substituição para bcrypt que usa bcryptjs
RUN echo 'module.exports = require("bcryptjs");' > /app/node_modules/bcrypt.js && \
    echo '{ "name": "bcrypt", "main": "../bcrypt.js" }' > /app/node_modules/bcrypt/package.json

CMD ["node", "src/server.js"] 