# Check out https://hub.docker.com/_/node to select a new base image
FROM node:22-alpine
ARG port
ARG service
ENV SERVICE=$service
ENV PORT=$port
ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
# Set to a non-root built-in user `node`

USER node

# Create app directory (with user `node`)
RUN mkdir -p /home/node/dist/${SERVICE}

WORKDIR /home/node/dist/${SERVICE}

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)



COPY --chown=node package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

# Bundle app source code
COPY --chown=node . .

RUN pnpm exec prisma generate --schema=apps/micro-files-service/src/core/prisma/schema.prisma

RUN pnpm run build:${SERVICE}

# Bind to all network interfaces so that it can be mapped to the host OS

EXPOSE ${PORT}

CMD ["sh", "-c", "pnpm exec prisma migrate deploy --config apps/micro-files-service/src/core/prisma/prisma.config.ts && exec pnpm run start:micro-files-service"]
