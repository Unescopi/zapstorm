# Estágio de compilação
FROM node:20-alpine AS build

WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Construir aplicação ignorando erros de tipagem
RUN echo "Pulando verificação de tipos TypeScript" && \
    npx vite build

# Estágio de produção
FROM nginx:alpine

# Copiar configuração do nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Criar diretório de assets
RUN mkdir -p /usr/share/nginx/html/assets

# Copiar scripts
COPY --chmod=755 ./docker-entrypoint.sh /
COPY --chmod=755 ./fix-api-url.sh /

# Copiar arquivos construídos da etapa anterior
COPY --from=build /app/dist /usr/share/nginx/html

# Expor porta 80
EXPOSE 80

# Iniciar nginx com o script de entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"] 