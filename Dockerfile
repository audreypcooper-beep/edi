# =============================================================================
# Stage 1 — builder
# Install only production dependencies so the final image stays lean.
# =============================================================================
FROM node:18-alpine AS builder

# Install build tools needed by some native Node modules (e.g. bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first to leverage Docker layer caching
COPY backend/package.json backend/package-lock.json ./

# Install production-only dependencies
RUN npm ci --only=production

# =============================================================================
# Stage 2 — runtime
# Copy the installed node_modules and application source into a clean image.
# =============================================================================
FROM node:18-alpine AS runtime

# Keep the image up-to-date and install tini for proper PID 1 handling
RUN apk add --no-cache tini && \
    apk upgrade --no-cache

WORKDIR /app

# Copy production node_modules from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY backend/src ./src
COPY backend/package.json ./package.json

# Create a non-root user and switch to it
# The node user (uid 1000) already exists in the node:alpine image
RUN chown -R node:node /app
USER node

# Document the port the app listens on
EXPOSE 8080

# Health-check so orchestrators know when the container is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Use tini as the init process to handle signals correctly
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
