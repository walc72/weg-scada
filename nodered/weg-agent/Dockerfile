FROM node:20-alpine
# CLI de Tailscale (misma versión que el tailscaled de las VMs): solo cliente,
# habla con el daemon del sistema por el socket montado.
ARG TS_VERSION=1.102.4
RUN wget -qO- https://pkgs.tailscale.com/stable/tailscale_${TS_VERSION}_amd64.tgz | tar xz -C /tmp \
  && mv /tmp/tailscale_${TS_VERSION}_amd64/tailscale /usr/local/bin/tailscale \
  && rm -rf /tmp/tailscale_*
WORKDIR /app
COPY package.json ./
COPY src/ ./src/
# Corre como root a propósito: operar tailscaled (login/logout) exige root o
# "operator". Mitigación: sin puertos publicados, AGENT_TOKEN, tres operaciones fijas.
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget --spider -q http://127.0.0.1:3400/health || exit 1
CMD ["node", "src/index.js"]
