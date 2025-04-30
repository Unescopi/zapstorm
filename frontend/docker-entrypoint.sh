#!/bin/sh

# Cria o diretório assets se ele não existir
mkdir -p /usr/share/nginx/html/assets

# Se VITE_API_URL não estiver definido, usar o valor padrão para o Easypanel
if [ -z "$VITE_API_URL" ]; then
  export VITE_API_URL="http://api:3001/api"
fi

# Escreve a configuração de ambiente no arquivo env-config.js
cat <<EOF > /usr/share/nginx/html/assets/env-config.js
window._env_ = {
  VITE_API_URL: "${VITE_API_URL}"
};
EOF

echo "Configurações de ambiente geradas:"
cat /usr/share/nginx/html/assets/env-config.js

# Executa o comando passado para o entrypoint
exec "$@" 