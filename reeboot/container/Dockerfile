# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install main app dependencies first (better layer caching)
# --legacy-peer-deps: TanStack AI packages have zod v4 peer dep conflicting with our zod v3
# ONNXRUNTIME_NODE_INSTALL=skip: onnxruntime-node downloads hundreds of MB of CUDA libs on Linux
# which we don't need — this is a chat server, not a GPU inference pipeline
COPY package*.json ./
RUN ONNXRUNTIME_NODE_INSTALL=skip npm ci --legacy-peer-deps

# Install webchat dependencies separately (it's a separate Vite project)
COPY webchat/package.json webchat/
COPY webchat/package-lock.json webchat/
RUN cd webchat && ONNXRUNTIME_NODE_INSTALL=skip npm ci

# Copy source and build everything
COPY . .
RUN npm run build
RUN cd webchat && npm run build

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
ENV PATH="/home/reeboot/node_modules/.bin:$PATH"

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
# ONNXRUNTIME_NODE_INSTALL=skip: skip CUDA binaries for onnxruntime-node (not needed)
RUN ONNXRUNTIME_NODE_INSTALL=skip npm ci --omit=dev --legacy-peer-deps

# Make entrypoint executable
RUN chmod +x ./container/entrypoint.sh

# Config and data directory (mount from host: -v ~/.reeboot:/home/reeboot/.reeboot)
VOLUME ["/home/reeboot/.reeboot"]

EXPOSE 3000

ENTRYPOINT ["./container/entrypoint.sh"]
