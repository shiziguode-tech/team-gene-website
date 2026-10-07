FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/data
RUN groupadd --system --gid 1001 nodegroup && useradd --system --uid 1001 --gid nodegroup nodeuser
COPY --from=builder --chown=nodeuser:nodegroup /app/public ./public
COPY --from=builder --chown=nodeuser:nodegroup /app/.next/standalone ./
COPY --from=builder --chown=nodeuser:nodegroup /app/.next/static ./.next/static
RUN mkdir -p /data/uploads && chown -R nodeuser:nodegroup /data
USER nodeuser
EXPOSE 3000
CMD ["node", "server.js"]
