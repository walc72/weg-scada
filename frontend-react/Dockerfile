# Frontend SCADA: build de Vite (modo live, ver .env.production) servido por nginx.
# La config de nginx (proxy /api y /mqtt) la monta docker-compose desde
# nodered/nginx/frontend.conf.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund --loglevel=error
COPY . .
# Versión que muestra «Acerca de» (el workflow de release pasa la etiqueta vX.Y.Z)
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
RUN npm run build

FROM nginx:1.31-alpine
COPY --from=build /app/dist /usr/share/nginx/html
