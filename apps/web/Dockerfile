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

# Source maps για το error tracking (GlitchTip). Το `sentry-cli` γράφει debug id
# σε κάθε bundle και στο map του — έτσι ένα σφάλμα βρίσκει το σωστό map χωρίς να
# εξαρτάται από URL. Τα maps (μαζί με αντίγραφο των bundles, για το ζευγάρωμα)
# φεύγουν από τη ρίζα του nginx: ανεβαίνουν στο GlitchTip στην εκκίνηση του
# container (docker-entrypoint.sh) και δεν σερβίρονται ποτέ.
# Το GlitchTip 6.2 δέχεται το «artifact bundle» του sentry-cli· το glitchtip-cli
# 1.0.0 στέλνει μεμονωμένα αρχεία και το GlitchTip τα απορρίπτει.
ARG SENTRY_CLI_VERSION=3.8.0
ARG SENTRY_CLI_SHA256=13f8cb34ae01a6a272d7d7c22e277a105286615b4020de900ea95a8de47cdbb6
RUN wget -qO /usr/local/bin/sentry-cli \
      "https://github.com/getsentry/sentry-cli/releases/download/${SENTRY_CLI_VERSION}/sentry-cli-Linux-x86_64" \
 && echo "${SENTRY_CLI_SHA256}  /usr/local/bin/sentry-cli" | sha256sum -c - \
 && chmod +x /usr/local/bin/sentry-cli \
 && sentry-cli sourcemaps inject apps/web/dist/pwa \
 && mkdir -p /sourcemaps \
 && cd apps/web/dist/pwa \
 && find . -name '*.map' -exec sh -c 'for map; do mkdir -p "/sourcemaps/$(dirname "$map")"; cp "${map%.map}" "/sourcemaps/${map%.map}"; mv "$map" "/sourcemaps/$map"; done' sh {} + \
 && node -p "require('/repo/apps/web/package.json').version" > /sourcemaps/VERSION

FROM nginx:1.27-alpine AS runtime
# Το nginx config ΔΕΝ είναι στατικό: ο entrypoint το αποδίδει από το template
# με Content-Security-Policy που περιέχει τα origins του API/Authentik (runtime).
COPY apps/web/nginx.conf.template /opt/trifylli/nginx.conf.template
COPY apps/web/nginx-headers.conf /etc/nginx/trifylli-headers.conf
COPY --from=build /repo/apps/web/dist/pwa /usr/share/nginx/html
COPY --from=build /usr/local/bin/sentry-cli /usr/local/bin/sentry-cli
COPY --from=build /sourcemaps /opt/trifylli/sourcemaps
# Ο entrypoint του nginx τρέχει τα /docker-entrypoint.d/*.sh πριν ξεκινήσει ο
# server· εδώ γράφεται το runtime /config.js από μεταβλητές περιβάλλοντος.
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.d/40-trifylli-config.sh
RUN chmod +x /docker-entrypoint.d/40-trifylli-config.sh
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
