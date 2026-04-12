📝 Project Initialization: Inctagram Backend
Этот файл — твоя дорожная карта по развертыванию инфраструктуры.
Инструкция для Агента: Выполняй задачи по очереди. После выполнения каждой подзадачи ставь отметку [x]. Не перезаписывай существующие Agents.md и .codexignore.

🏗 Phase 1: Root Infrastructure & Hygiene
Завершение базовой настройки монорепозитория.

[ ] Create .editorconfig

Зачем: Гарантирует идентичные отступы и кодировку во всех сервисах.

[ ] Create .gitignore

Зачем: Исключение системного мусора и секретов из системы контроля версий.

[ ] Create package.json (Root)

Зачем: Настройка NPM Workspaces для управления apps/_ и libs/_ как единым целым.

🏛 Phase 2: Architectural Mapping
Фиксация структуры для понимания контекста.

[ ] Create Architecture.md

Зачем: Описание взаимодействия: Gateway -> Auth, Gateway -> Files через RabbitMQ. Карта портов и поддоменов для nymbi.org.

🛠 Phase 3: TypeScript & Shared Configs
Настройка типизации и переиспользуемых модулей.

[ ] Create tsconfig.base.json

Зачем: Базовый конфиг с алиасами @libs/\*. Позволяет делать чистые импорты без ../../.

[ ] Create nest-cli.json (Monorepo Mode)

Зачем: Перевод Nest CLI в режим монорепозитория для корректной сборки разных сервисов.

🐳 Phase 4: Dev Environment & Secrets
Подготовка к запуску и деплою.

[ ] Create docker-compose.yml

Зачем: Поднятие локального PostgreSQL (с БД для каждого сервиса) и RabbitMQ.

[ ] Create .env.example

Зачем: Список всех ключей для всех микросервисов. Служит шаблоном для локальной разработки.

📦 Phase 5: Folder Structure & Boilerplate
Создание каркаса папок и первых слоев.

[ ] Initialize directory tree

apps/main-gateway-service/src

apps/micro-files-service/src

libs/common/src (Shared DomainException, BaseEntity)

libs/contracts/src (RabbitMQ patterns/events)

[ ] Create K8s base folder

k8s/ingress.yaml (Для роутинга nymbi.org/api)

🏁 Текущий статус
Agents.md — READY (уже в корне)

.codexignore — READY (уже в корне)

Инструкция для Агента: Начни с Phase 1 (Editorconfig, Gitignore, Package.json). При создании package.json убедись, что workspaces настроены правильно.
