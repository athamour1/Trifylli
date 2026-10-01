#!/bin/sh
# Idempotent bootstrap του Garage για το dev stack: layout + bucket + σταθερό key.
set -eu

echo "[garage-init] waiting for Garage RPC..."
until garage status 2>/dev/null | grep -q "HEALTHY NODES"; do sleep 2; done

NODE=$(garage status 2>/dev/null | awk '/NO ROLE ASSIGNED/{print $1}')
if [ -n "${NODE:-}" ]; then
  echo "[garage-init] assigning layout to $NODE"
  garage layout assign -z dc1 -c 1G "$NODE"
  garage layout apply --version 1
else
  echo "[garage-init] layout already assigned"
fi

if garage key info trifylli >/dev/null 2>&1; then
  echo "[garage-init] key exists"
else
  echo "[garage-init] importing fixed key"
  garage key import --yes -n trifylli "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"
fi

if garage bucket info trifylli >/dev/null 2>&1; then
  echo "[garage-init] bucket exists"
else
  echo "[garage-init] creating bucket"
  garage bucket create trifylli
fi

garage bucket allow --read --write --owner trifylli --key trifylli
echo "[garage-init] done."
