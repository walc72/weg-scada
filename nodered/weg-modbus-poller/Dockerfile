FROM node:20-alpine
WORKDIR /app
# deps primero (capa estable, cache-friendly — se reusa si package.json no cambia)
COPY package.json package-lock.json* ./
RUN npm install --production
# codigo despues (cambia seguido, no invalida la capa de deps)
COPY src/ ./src/
ENV CONFIG_PATH=/app/config/config.json
# hardening al final (no requiere red, no invalida la cache de npm)
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 && chown -R appuser /app
USER appuser
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "try{require('fs').readFileSync('/tmp/poller-healthy');process.exit(0)}catch(e){process.exit(1)}"
CMD ["node", "src/index.js"]
