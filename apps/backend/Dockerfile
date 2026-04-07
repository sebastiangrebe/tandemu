FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json ./

# Copy all package.json files for dependency resolution
COPY apps/backend/package.json apps/backend/
COPY packages/types/package.json packages/types/
COPY packages/database/package.json packages/database/
COPY packages/telemetry/package.json packages/telemetry/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types/ packages/types/
COPY packages/database/ packages/database/
COPY packages/telemetry/ packages/telemetry/
COPY apps/backend/ apps/backend/

# Build packages first, then backend
RUN pnpm --filter @tandemu/types build && \
    pnpm --filter @tandemu/database build && \
    pnpm --filter @tandemu/telemetry build && \
    pnpm --filter @tandemu/backend build

ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=$APP_VERSION

EXPOSE 3001
CMD ["node", "apps/backend/dist/main.js"]
