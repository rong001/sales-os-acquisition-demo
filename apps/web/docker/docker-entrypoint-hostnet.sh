#!/bin/sh
set -eu
export HOST_WEB_PORT="${HOST_WEB_PORT:-19280}"
export HOST_API_PORT="${HOST_API_PORT:-39300}"
envsubst '${HOST_WEB_PORT} ${HOST_API_PORT}' \
  < /etc/nginx/templates/nginx.hostnet.conf.template \
  > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
