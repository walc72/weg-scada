#!/bin/sh
# Arranque y healthcheck de Mosquitto.
# Con MQTT_PASSWORD el listener 1883 pide usuario (MQTT_USERNAME, por defecto weg);
# sin ella queda anónimo, como antes de tenerla.
#   arranque.sh         -> genera el archivo de claves y la config activa, y arranca
#   arranque.sh salud   -> healthcheck (lee $SYS por el 1883 con las mismas credenciales)
set -e
usuario="${MQTT_USERNAME:-weg}"

if [ "$1" = salud ]; then
  if [ -n "$MQTT_PASSWORD" ]; then
    exec mosquitto_sub -t '$SYS/#' -C 1 -i healthcheck -W 3 -u "$usuario" -P "$MQTT_PASSWORD"
  fi
  exec mosquitto_sub -t '$SYS/#' -C 1 -i healthcheck -W 3
fi

if [ -n "$MQTT_PASSWORD" ]; then
  rm -f /mosquitto/passwd
  mosquitto_passwd -c -b /mosquitto/passwd "$usuario" "$MQTT_PASSWORD"
  chmod 0700 /mosquitto/passwd
  sed -e 's/^#AUTH //' -e '/^#ANON /d' /mosquitto/config/mosquitto.conf > /mosquitto/activo.conf
else
  echo "[mosquitto] Sin MQTT_PASSWORD: el listener 1883 queda anónimo"
  sed -e 's/^#ANON //' -e '/^#AUTH /d' /mosquitto/config/mosquitto.conf > /mosquitto/activo.conf
fi
# El entrypoint de la imagen pasa /mosquitto al usuario mosquitto (incluidos passwd y activo.conf)
exec /docker-entrypoint.sh /usr/sbin/mosquitto -c /mosquitto/activo.conf
