#!/bin/bash

RANDOM_NB=$((1024 + RANDOM % 48000))
echo "Use random base port $RANDOM_NB"

cat <<EOF > ".env"
NGINX_PORT=$((RANDOM_NB))

DEV_API_PORT=$((RANDOM_NB + 1))
DEV_UI_PORT=$((RANDOM_NB + 2))
DEV_UI_HMR_PORT=$((RANDOM_NB + 3))
MAILDEV_UI_PORT=$((RANDOM_NB + 4))
MAILDEV_SMTP_PORT=$((RANDOM_NB + 5))
DEV_UPSTREAM_API_PORT=$((RANDOM_NB + 6))

MONGO_PORT=$((RANDOM_NB + 10))

SD_PORT=$((RANDOM_NB + 20))
DF_PORT=$((RANDOM_NB + 21))
EVENTS_PORT=$((RANDOM_NB + 22))

# all dev services listen on the loopback, the SSRF protection of the default http agents
# would refuse them (cf @data-fair/lib-node http-agents)
SSRF_PUBLIC_IPS=127.0.0.1,::1
EOF
