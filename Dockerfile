##########################
FROM node:24.13.0-alpine3.23 AS base

WORKDIR /app
ENV NODE_ENV=production

##########################
FROM base AS native-deps

RUN apk add --no-cache openssl

##########################
FROM base AS package-strip

RUN apk add --no-cache jq moreutils
ADD package.json package-lock.json ./
RUN jq '.version="build"' package.json | sponge package.json
RUN jq '.version="build"' package-lock.json | sponge package-lock.json

##########################
FROM base AS installer

RUN apk add --no-cache python3 make g++ git jq moreutils
RUN npm i -g clean-modules@3.0.4
COPY --from=package-strip /app/package.json package.json
COPY --from=package-strip /app/package-lock.json package-lock.json
ADD ui/package.json ui/package.json
ADD api/package.json api/package.json
ADD shared/package.json shared/package.json
ADD lib-node/package.json lib-node/package.json
# full deps install used for types and ui building
# also used to fill the npm cache for faster install of api deps
RUN npm ci --omit=dev --no-audit --no-fund
# install dev dependencies for ui workspace
RUN npm install -w ui --include=dev --no-audit --no-fund

##########################
FROM installer AS types

ADD api/types api/types
ADD api/doc api/doc
ADD api/config api/config
ADD ui/src/components ui/src/components
RUN npm run build-types

##########################
FROM installer AS ui

COPY --from=types /app/api/config api/config
COPY --from=types /app/api/types api/types
COPY --from=types /app/api/doc api/doc
ADD /shared shared
ADD /lib-node lib-node
ADD /api/src/config.ts api/src/config.ts
ADD /api/src/ui-config.ts api/src/ui-config.ts
ADD /ui ui
COPY --from=types /app/ui/src/components/vjsf ui/src/components/vjsf

RUN npm -w ui run build

##########################
FROM installer AS api-installer

RUN npm ci -w api --prefer-offline --omit=dev --omit=optional --no-audit --no-fund && \
    npx clean-modules --yes
RUN mkdir -p /app/api/node_modules

##########################
FROM native-deps AS main

COPY --from=api-installer /app/node_modules node_modules
ADD /api api
ADD /shared shared
COPY --from=types /app/api/types api/types
COPY --from=types /app/api/doc api/doc
COPY --from=types /app/api/config api/config
COPY --from=api-installer /app/api/node_modules api/node_modules
COPY --from=ui /app/ui/dist ui/dist
ADD package.json README.md LICENSE BUILD.json* ./

EXPOSE 8080
EXPOSE 9090

USER node
WORKDIR /app/api

CMD ["node", "--max-http-header-size", "64000", "index.ts"]
