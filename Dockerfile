# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ── Stage 2: production runtime ──────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Install backend dependencies (prod only)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY server.js ./
COPY src/ ./src/
COPY migrations/ ./migrations/

# Copy built frontend from stage 1
COPY --from=builder /build/client/dist ./client/dist

# Data directory for db-config.json and any local files
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000

CMD ["node", "server.js"]
