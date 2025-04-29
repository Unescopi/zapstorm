#!/bin/sh

# Substitui as variáveis de ambiente no template
envsubst < /usr/share/nginx/html/assets/env-config.js.template > /usr/share/nginx/html/assets/env-config.js

# Executa o comando passado para o entrypoint
exec "$@" 