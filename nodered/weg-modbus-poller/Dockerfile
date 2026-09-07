FROM node:20-alpine
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY src/ ./src/
ENV CONFIG_PATH=/app/config/config.json
USER appuser
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "try{require('fs').readFileSync('/tmp/poller-healthy');process.exit(0)}catch(e){process.exit(1)}"
CMD ["node", "src/index.js"]
