FROM node:20-alpine
# CLI de Tailscale (misma versión que el tailscaled de las VMs): solo cliente,
# habla con el daemon del sistema por el socket montado.
ARG TS_VERSION=1.102.4
# sha256 del tgz oficial (coincide con el .sha256 publicado por Tailscale).
# Al subir TS_VERSION hay que actualizarlo: si no coincide, el build falla.
ARG TS_SHA256=50748df1045e60b5b695f19f4c56b0da36c019948b440fb456b6584a50f0d8b9
RUN wget -qO /tmp/ts.tgz https://pkgs.tailscale.com/stable/tailscale_${TS_VERSION}_amd64.tgz \
  && echo "${TS_SHA256}  /tmp/ts.tgz" | sha256sum -c - \
  && tar xzf /tmp/ts.tgz -C /tmp \
  && mv /tmp/tailscale_${TS_VERSION}_amd64/tailscale /usr/local/bin/tailscale \
  && rm -rf /tmp/ts.tgz /tmp/tailscale_*
WORKDIR /app
COPY package.json ./
COPY src/ ./src/
# Corre como root a propósito: operar tailscaled (login/logout) exige root o
# "operator". Mitigación: sin puertos publicados, AGENT_TOKEN, tres operaciones fijas.
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget --spider -q http://127.0.0.1:3400/health || exit 1
CMD ["node", "src/index.js"]
