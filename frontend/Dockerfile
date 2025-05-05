# Estágio de compilação
FROM node:20-alpine AS build

WORKDIR /app

# Copiar arquivos de configuração
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Instalar terser explicitamente (necessário para minificação)
RUN npm install -D terser

# Copiar código fonte
COPY . .

# Construir aplicação
RUN npx vite build

# Estágio de produção
FROM nginx:alpine

# Copiar configuração do nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar e tornar executáveis os scripts
COPY fix-api-url.sh /usr/local/bin/fix-api-url.sh
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/fix-api-url.sh /usr/local/bin/docker-entrypoint.sh

# Copiar arquivos construídos da etapa anterior
COPY --from=build /app/dist /usr/share/nginx/html

# Expor porta 80
EXPOSE 80

# Iniciar nginx com o script de entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"] 