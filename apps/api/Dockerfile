# Πολυσταδιακό build του API.
#
# Το context είναι η ρίζα του monorepo (βλ. docker-compose.yml), ώστε να
# μπορούμε να χτίσουμε και το `packages/shared` από το οποίο εξαρτάται το API.

# ─────────────────────────── deps ───────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# --frozen-lockfile: το image πρέπει να χτίζεται από ακριβώς τις ίδιες εκδόσεις
# με το lockfile, αλλιώς το «δούλευε τοπικά» δεν σημαίνει τίποτα.
RUN pnpm install --frozen-lockfile --filter @trifylli/api... --filter @trifylli/shared

# ─────────────────────────── build ──────────────────────────
FROM deps AS build
WORKDIR /repo
# Σε Docker build δεν υπάρχει TTY· χωρίς αυτό το `pnpm install --prod` ακυρώνει
# τον καθαρισμό του node_modules (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
ENV CI=true
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @trifylli/shared build \
 && pnpm --filter @trifylli/api exec prisma generate \
 && pnpm --filter @trifylli/api build

# Ξαναστήνουμε τα node_modules μόνο με production εξαρτήσεις.
RUN pnpm install --frozen-lockfile --prod --filter @trifylli/api... --filter @trifylli/shared \
 && pnpm --filter @trifylli/api exec prisma generate

# ─────────────────────────── runtime ────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /repo

ENV NODE_ENV=production

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/
# Το `packages/shared` δεν έχει runtime εξαρτήσεις, οπότε δεν υπάρχει node_modules
# να αντιγραφεί — το `@trifylli/shared` λύνεται από το symlink στο root node_modules.
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/prisma.config.ts ./apps/api/

WORKDIR /repo/apps/api
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini ως PID 1: χωρίς αυτό το Node δεν λαμβάνει σωστά SIGTERM και το
# `enableShutdownHooks` του Nest δεν κλείνει ποτέ τη σύνδεση με τη βάση.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
