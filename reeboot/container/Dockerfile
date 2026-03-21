# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-slim

# Create non-root user (uid 1000) — rename existing node user if uid 1000 is taken
RUN if id -u 1000 >/dev/null 2>&1; then \
      usermod -l reeboot -d /home/reeboot -m $(getent passwd 1000 | cut -d: -f1); \
    else \
      useradd -m -u 1000 -s /bin/bash reeboot; \
    fi

USER reeboot
WORKDIR /home/reeboot

# Copy built output and runtime assets from builder
COPY --from=builder --chown=reeboot:reeboot /app/dist ./dist
COPY --from=builder --chown=reeboot:reeboot /app/extensions ./extensions
COPY --from=builder --chown=reeboot:reeboot /app/skills ./skills
COPY --from=builder --chown=reeboot:reeboot /app/templates ./templates
COPY --from=builder --chown=reeboot:reeboot /app/container ./container
COPY --from=builder --chown=reeboot:reeboot /app/webchat ./webchat
COPY --from=builder --chown=reeboot:reeboot /app/package.json ./package.json
COPY --from=builder --chown=reeboot:reeboot /app/package-lock.json ./package-lock.json

# Install production dependencies only
RUN npm ci --omit=dev

# Make entrypoint executable
RUN chmod +x ./container/entrypoint.sh

# Config and data directory (mount from host: -v ~/.reeboot:/home/reeboot/.reeboot)
VOLUME ["/home/reeboot/.reeboot"]

EXPOSE 3000

ENTRYPOINT ["./container/entrypoint.sh"]
