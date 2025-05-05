#!/bin/sh
set -e

# Se a variável de ambiente API_URL estiver definida, substituir no env.js
if [ ! -z "$API_URL" ]; then
  echo "Configurando API_URL para: $API_URL"
  # Substituir a URL da API no arquivo env.js
  sed -i "s|API_URL: .*|API_URL: '$API_URL'|g" /usr/share/nginx/html/env.js
fi

# Executar o comando fornecido (nginx)
exec "$@" 