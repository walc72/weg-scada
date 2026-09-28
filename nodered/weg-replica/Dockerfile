FROM node:20-alpine
WORKDIR /app
# deps primero (capa estable, cache-friendly)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY src/ ./src/
# non-root (mismo uid que weg-api: comparten ./config) + /data para el cursor
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 && mkdir -p /data && chown -R appuser /app /data
USER appuser
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD wget --spider -q http://127.0.0.1:3300/health || exit 1
CMD ["node", "src/index.js"]
