#!/bin/sh
set -e

echo "Iniciando contêiner frontend..."

# Listar arquivos na pasta dist para diagnóstico
echo "Verificando arquivos na pasta /usr/share/nginx/html:"
ls -la /usr/share/nginx/html

# Verificar se existem arquivos JavaScript
echo "Arquivos JavaScript:"
find /usr/share/nginx/html -name "*.js" | head -n 5

# Se a variável de ambiente API_URL estiver definida, substituir no env.js
if [ ! -z "$API_URL" ]; then
  echo "Configurando API_URL para: $API_URL"
  # Substituir a URL da API no arquivo env.js
  sed -i "s|API_URL: .*|API_URL: '$API_URL'|g" /usr/share/nginx/html/env.js
fi

# Garantir tipos MIME corretos no nginx
echo "Verificando configuração do nginx..."
cat /etc/nginx/conf.d/default.conf | grep -n Content-Type || echo "Configuração Content-Type não encontrada"

# Verificar permissões
echo "Ajustando permissões..."
chmod -R 755 /usr/share/nginx/html

# Executar o comando fornecido (nginx)
echo "Iniciando NGINX..."
exec "$@" 