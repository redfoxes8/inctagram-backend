FROM node:22-alpine

ARG port
ARG service

ENV SERVICE=$service
ENV PORT=$port
ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

USER node

RUN mkdir -p /home/node/dist/${SERVICE}

WORKDIR /home/node/dist/${SERVICE}

COPY --chown=node package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY --chown=node . .

RUN pnpm run build:${SERVICE}

EXPOSE ${PORT}

CMD ["sh", "-c", "pnpm exec prisma migrate deploy --config apps/micro-notification-service/src/core/prisma/prisma.config.ts && exec pnpm run start:micro-notification-service"]
