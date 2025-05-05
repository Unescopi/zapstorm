#!/bin/sh

# Script para substituir referências a localhost nos arquivos compilados e injetar variáveis de ambiente
echo "Iniciando configuração do ambiente para o frontend..."

# Procurar e substituir ocorrências de localhost em arquivos JavaScript
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|http://localhost:3001/api|/api|g' {} \;
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|localhost:3001/api|/api|g' {} \;

echo "Verificando substituições:"
grep -r "localhost:3001" /usr/share/nginx/html || echo "Nenhuma referência a localhost:3001 encontrada!"

# Criar arquivo env-config.js no diretório HTML do Nginx
ENV_CONFIG_FILE=/usr/share/nginx/html/env-config.js

echo "window.env = {" > $ENV_CONFIG_FILE
echo "  API_URL: '${VITE_API_URL:-/api}'," >> $ENV_CONFIG_FILE
echo "};" >> $ENV_CONFIG_FILE

echo "Arquivo env-config.js criado com conteúdo:"
cat $ENV_CONFIG_FILE

# Injetar a tag de script no index.html
sed -i 's|</head>|<script src="/env-config.js"></script></head>|g' /usr/share/nginx/html/index.html

echo "Configuração do ambiente concluída!" 