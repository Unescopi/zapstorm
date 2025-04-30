#!/bin/sh

# Cria o diretório assets se ele não existir
mkdir -p /usr/share/nginx/html/assets

# Escreve a configuração de ambiente no arquivo env-config.js
cat <<EOF > /usr/share/nginx/html/assets/env-config.js
window._env_ = {
  VITE_API_URL: "${VITE_API_URL}"
};
EOF

# Executa o comando passado para o entrypoint
exec "$@" 