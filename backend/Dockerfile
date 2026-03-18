FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Dependencies
FROM base AS deps
WORKDIR /app
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
RUN pnpm build

# Production
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Copy token template for runtime contract deployment
COPY contracts/contracts/shield-token.clar ./contracts/shield-token.clar

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser && \
    chown -R appuser:nodejs /app
USER appuser

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001
ENV TOKEN_TEMPLATE_PATH=/app/contracts/shield-token.clar
CMD ["node", "dist/index.js"]
