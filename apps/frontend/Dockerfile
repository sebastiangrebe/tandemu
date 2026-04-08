FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json ./

# Copy all package.json files for dependency resolution
COPY apps/frontend/package.json apps/frontend/
COPY packages/types/package.json packages/types/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types/ packages/types/
COPY apps/frontend/ apps/frontend/

# Build
ARG APP_VERSION=0.0.0-dev
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @tandemu/types build && \
    pnpm --filter @tandemu/frontend build

EXPOSE 3000
CMD ["pnpm", "--filter", "@tandemu/frontend", "start"]
