# =============================================================================
# Stage 1 — builder
# =============================================================================
FROM node:18-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --only=production

# =============================================================================
# Stage 2 — runtime
# =============================================================================
FROM node:18-alpine AS runtime

RUN apk add --no-cache tini && \
    apk upgrade --no-cache

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules

COPY src ./src
COPY package.json ./package.json

RUN chown -R node:node /app
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
