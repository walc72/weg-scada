FROM node:20-alpine
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY src/ ./src/
# Credenciales OAuth de Drive (vacías = Drive no disponible); se pasan desde el release
ARG GOOGLE_CLIENT_ID=""
ARG GOOGLE_CLIENT_SECRET=""
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
USER appuser
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://localhost:3200/health || exit 1
CMD ["node", "src/server.js"]
