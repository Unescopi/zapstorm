#!/bin/sh
set -e

echo "Iniciando contêiner frontend..."

# Listar arquivos na pasta dist para diagnóstico
echo "Verificando arquivos na pasta /usr/share/nginx/html:"
ls -la /usr/share/nginx/html

# Verificar arquivos JavaScript e seu conteúdo
echo "Verificando arquivos JavaScript:"
find /usr/share/nginx/html -name "*.js" | head -n 5

# Verificar o conteúdo específico do arquivo env.js
if [ -f /usr/share/nginx/html/env.js ]; then
  echo "Conteúdo do arquivo env.js:"
  cat /usr/share/nginx/html/env.js
else
  echo "AVISO: env.js não encontrado! Criando arquivo..."
  echo "window.env = { API_URL: '${API_URL:-/api}' };" > /usr/share/nginx/html/env.js
  chmod 644 /usr/share/nginx/html/env.js
fi

# Verificar index.html para garantir que os caminhos estão corretos
echo "Verificando index.html:"
cat /usr/share/nginx/html/index.html | grep -n script || echo "Nenhum script encontrado em index.html!"

# Se a variável de ambiente API_URL estiver definida, substituir no env.js
if [ ! -z "$API_URL" ]; then
  echo "Configurando API_URL para: $API_URL"
  # Substituir a URL da API no arquivo env.js com expressão mais segura
  sed -i "s|API_URL:.*|API_URL: '${API_URL}'|g" /usr/share/nginx/html/env.js
  echo "Arquivo env.js atualizado:"
  cat /usr/share/nginx/html/env.js
fi

# Garantir tipos MIME corretos no nginx
echo "Verificando configuração do nginx..."
cat /etc/nginx/conf.d/default.conf | grep -n Content-Type || echo "Configuração Content-Type não encontrada"

# Verificar permissões e ajustá-las para garantir acesso
echo "Ajustando permissões..."
chmod -R 755 /usr/share/nginx/html

# Executar o comando fornecido (nginx)
echo "Iniciando NGINX..."
exec "$@" 