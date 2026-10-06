# Πολυσταδιακό build της PWA. Το context είναι η ρίζα του monorepo.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# Οι ρυθμίσεις είναι **runtime**, όχι build-time: τις γράφει ο entrypoint στο
# /config.js σε κάθε εκκίνηση (βλ. apps/web/docker-entrypoint.sh), ώστε η ίδια
# image να ρυθμίζεται ανά περιβάλλον χωρίς rebuild — όπως στο OuchTracker.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @trifylli/web... --filter @trifylli/shared

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN pnpm --filter @trifylli/shared build \
 && pnpm --filter @trifylli/web build

FROM nginx:1.27-alpine AS runtime
# Το nginx config ΔΕΝ είναι στατικό: ο entrypoint το αποδίδει από το template
# με Content-Security-Policy που περιέχει τα origins του API/Authentik (runtime).
COPY apps/web/nginx.conf.template /opt/trifylli/nginx.conf.template
COPY apps/web/nginx-headers.conf /etc/nginx/trifylli-headers.conf
COPY --from=build /repo/apps/web/dist/pwa /usr/share/nginx/html
# Ο entrypoint του nginx τρέχει τα /docker-entrypoint.d/*.sh πριν ξεκινήσει ο
# server· εδώ γράφεται το runtime /config.js από μεταβλητές περιβάλλοντος.
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.d/40-trifylli-config.sh
RUN chmod +x /docker-entrypoint.d/40-trifylli-config.sh
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
