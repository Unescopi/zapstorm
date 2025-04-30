#!/bin/sh

# Cria o diretório assets se ele não existir
mkdir -p /usr/share/nginx/html/assets

# Se VITE_API_URL não estiver definido, usar o valor padrão para o Easypanel
if [ -z "$VITE_API_URL" ]; then
  echo "VITE_API_URL não está definido, usando valor padrão http://api:3001/api"
  export VITE_API_URL="http://api:3001/api"
else
  echo "VITE_API_URL está definido como: $VITE_API_URL"
fi

# Escreve a configuração de ambiente no arquivo env-config.js
cat <<EOF > /usr/share/nginx/html/assets/env-config.js
// Arquivo gerado em: $(date)
window._env_ = {
  VITE_API_URL: "${VITE_API_URL}"
};
console.log('Configurações de ambiente carregadas:', window._env_);
EOF

echo "Configurações de ambiente geradas em /usr/share/nginx/html/assets/env-config.js:"
cat /usr/share/nginx/html/assets/env-config.js

# Verificar se o arquivo existe e é acessível
if [ -f /usr/share/nginx/html/assets/env-config.js ]; then
  echo "Arquivo env-config.js criado com sucesso!"
  ls -la /usr/share/nginx/html/assets/
else
  echo "ERRO: Falha ao criar o arquivo env-config.js!"
fi

# Executar o script de correção de URLs hardcoded
echo "Executando correção de URLs nos arquivos compilados..."
/fix-api-url.sh

# Executa o comando passado para o entrypoint
echo "Iniciando o servidor NGINX..."
exec "$@" 