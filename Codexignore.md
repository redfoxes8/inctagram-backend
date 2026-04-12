# Dependency directories

node_modules/
_/node_modules/
libs/_/node_modules/
apps/\*/node_modules/

# Build outputs

dist/
build/
.next/
out/
\*.tsbuildinfo

# IDE and System files

.vscode/
.idea/
.DS_Store
Thumbs.db
\*.swp

# Environment and Secrets (CRITICAL)

.env
_.env
.env._
!.env.example
secrets/
_.pem
_.key

# Logs

logs/
_.log
npm-debug.log_
yarn-debug.log*
yarn-error.log*

# Prisma & DB artifacts

prisma/migrations/

# Игнорируем саму схему, если хотим чтобы агент работал только с кодом,

# но обычно схему лучше оставить. Игнорируем только бинарники:

_.db
_.sqlite

# Docker

.docker/
docker-compose.override.yml

# Temporary and Cache

.cache/
.npm/
.turbo/
.nx/
coverage/
.nyc_output/

# Media Assets (Т.к. это соцсеть, тут может быть много мусора)

_.jpg
_.jpeg
_.png
_.gif
_.svg
_.mp4
\*.webp
assets/
public/static/

# Large documentation files that are not code-related

_.pdf
_.docx
