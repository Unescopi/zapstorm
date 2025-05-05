#!/bin/sh

# Script para substituir referências a URLs incorretas nos arquivos compilados
echo "Iniciando correção de URLs hardcoded nos arquivos compilados..."

# Procurar e substituir todas as ocorrências de localhost:3001 em arquivos JavaScript
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|http://localhost:3001/api|https://api.prado-cafe.com/api|g' {} \;
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|localhost:3001/api|https://api.prado-cafe.com/api|g' {} \;

# Substituir referências ao domínio com HTTP para HTTPS
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|http://api.prado-cafe.com|https://api.prado-cafe.com|g' {} \;

# Corrigir URLs que usam o nome do serviço Docker em vez do domínio
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|https://api:3001/api|https://api.prado-cafe.com/api|g' {} \;
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|http://api:3001/api|https://api.prado-cafe.com/api|g' {} \;

# Corrigir referências a domínios antigos/incorretos
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|https://api.cdinterapi.com/api|https://api.prado-cafe.com/api|g' {} \;
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|http://api.cdinterapi.com/api|https://api.prado-cafe.com/api|g' {} \;
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|https://api.scrab-cafe.com/api|https://api.prado-cafe.com/api|g' {} \;
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|http://api.scrab-cafe.com/api|https://api.prado-cafe.com/api|g' {} \;

# Corrigir referências relativas
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|/api|https://api.prado-cafe.com/api|g' {} \;

echo "Verificando substituições:"
grep -r "localhost:3001" /usr/share/nginx/html || echo "Nenhuma referência a localhost:3001 encontrada!"
grep -r "api:3001" /usr/share/nginx/html || echo "Nenhuma referência a api:3001 encontrada!"
grep -r "cdinterapi.com" /usr/share/nginx/html || echo "Nenhuma referência a cdinterapi.com encontrada!"
grep -r "scrab-cafe.com" /usr/share/nginx/html || echo "Nenhuma referência a scrab-cafe.com encontrada!"

echo "Correção de URLs concluída." 