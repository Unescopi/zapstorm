#!/bin/sh

# Substituir as variáveis de ambiente nos arquivos estáticos
/usr/local/bin/fix-api-url.sh

# Se houver argumentos, executá-los, senão iniciar o Nginx
if [ "$#" -ne 0 ]; then
  exec "$@"
else
  exec nginx -g 'daemon off;'
fi 