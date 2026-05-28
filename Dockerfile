# === Multi-stage build para Painel Multiatendente WhatsApp ===

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /app

# Instalar apenas dependencias de producao
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copiar build
COPY --from=builder /app/dist ./dist

# Copiar arquivos estaticos
COPY public/ ./public/

# Copiar migrations
COPY src/infra/database/migrations ./migrations

# Usuario nao-root
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000 3001 3002

# Entrypoint definido no docker-compose por servico
CMD ["node", "dist/api/server.js"]
