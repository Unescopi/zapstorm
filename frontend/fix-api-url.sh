#!/bin/sh

# Script para substituir referências a localhost:3001 nos arquivos compilados
echo "Iniciando correção de URLs hardcoded nos arquivos compilados..."

# Procurar e substituir todas as ocorrências de localhost:3001 em arquivos JavaScript
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|http://localhost:3001/api|/api|g' {} \;
find /usr/share/nginx/html -type f -name "*.js" -exec sed -i 's|localhost:3001/api|/api|g' {} \;

echo "Verificando substituições:"
grep -r "localhost:3001" /usr/share/nginx/html || echo "Nenhuma referência a localhost:3001 encontrada!"

echo "Correção de URLs concluída." 