# Contenedor de backup: cron mensual de InfluxDB + guardián de disco.
FROM alpine:3.20

ARG INFLUX_CLI_VERSION=2.7.5
RUN apk add --no-cache bash curl tar coreutils findutils tzdata \
    && curl -sL "https://dl.influxdata.com/influxdb/releases/influxdb2-client-${INFLUX_CLI_VERSION}-linux-amd64.tar.gz" -o /tmp/influx.tgz \
    && tar xzf /tmp/influx.tgz -C /tmp \
    && find /tmp -name influx -type f -exec mv {} /usr/local/bin/influx \; \
    && chmod +x /usr/local/bin/influx \
    && rm -rf /tmp/*

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh \
    && mkdir -p /backups \
    # Día 1 de cada mes, 03:00
    && echo "0 3 1 * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
