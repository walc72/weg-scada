FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY src/ ./src/
ENV CONFIG_PATH=/app/config/config.json
CMD ["node", "src/index.js"]
