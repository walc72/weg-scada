# Contenedor de backup: ciclo de 1 min (run.sh) para config + histórico de InfluxDB,
# cifrado (openssl), destinos externos (rclone/ssh) y guardián de disco.
FROM alpine:3.20

ARG INFLUX_CLI_VERSION=2.7.5
RUN apk add --no-cache bash curl tar coreutils findutils tzdata jq openssl rclone openssh-client procps \
    && curl -sL "https://dl.influxdata.com/influxdb/releases/influxdb2-client-${INFLUX_CLI_VERSION}-linux-amd64.tar.gz" -o /tmp/influx.tgz \
    && tar xzf /tmp/influx.tgz -C /tmp \
    && find /tmp -name influx -type f -exec mv {} /usr/local/bin/influx \; \
    && chmod +x /usr/local/bin/influx \
    && rm -rf /tmp/*

COPY lib.sh backup.sh run.sh restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/run.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh \
    && mkdir -p /backups /config

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
