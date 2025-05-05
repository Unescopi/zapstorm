# Estágio de compilação
FROM node:18-alpine as build

WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Construir aplicação
RUN npm run build

# Estágio de produção
FROM nginx:alpine

# Copiar os arquivos de build gerados
COPY --from=build /app/dist /usr/share/nginx/html

# Copiar arquivo de configuração personalizado do nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Adicionar script para ajustar a URL da API dinamicamente se necessário
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

# Expor porta 80
EXPOSE 80

# Iniciar nginx com o script de entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"] 