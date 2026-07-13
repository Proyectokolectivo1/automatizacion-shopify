# Ecommerce Inteligente

Monorepo de la plataforma interna Shopify + Wompi + Mastershop + WhatsApp + impresión + BI.

## Requisitos

- Node.js 22.23.1 LTS
- pnpm 10.25.0
- Docker Engine y Docker Compose (se usarán desde E0-H2)

## Inicio rápido

```bash
pnpm install --frozen-lockfile
pnpm infra:bootstrap
pnpm infra:verify
pnpm database:migrate
pnpm validate
pnpm dev
```

- Web: `http://localhost:3000`
- API health: `http://localhost:3001/health`
- API readiness: `http://localhost:3001/health/ready`
- Métricas Prometheus: `http://localhost:3001/metrics`

Copie `.env.example` a un archivo local no versionado cuando necesite cambiar valores. Nunca incluya
credenciales reales en Git.

La infraestructura local publica PostgreSQL, Redis y MinIO solo en `127.0.0.1`. Consulte
`docs/runbooks/local-infrastructure.md` antes de operar o solucionar fallos. No use el contenedor
comunitario MinIO de desarrollo en producción.

Para validar la observabilidad y recuperación ante caída de Redis:

```bash
pnpm test:integration
pnpm observability:verify
```

Para validar la migración inicial desde una base temporal vacía, su reaplicación, el cliente Prisma y
los constraints sin alterar datos de desarrollo:

```bash
pnpm database:verify
pnpm database:status
pnpm outbox:verify
pnpm auth:verify
```

Las migraciones se aplican con `pnpm database:migrate`; revise primero
`docs/runbooks/database-migrations.md`. No use `prisma db push` en entornos compartidos.

El publisher y el worker outbox nacen desactivados y con kill switch. Para una prueba local controlada,
consulte `docs/runbooks/outbox-operations.md`; el worker se ejecuta en otro proceso con
`pnpm --filter @ecommerce/api start:outbox-worker` después de compilar.

La autenticación base se valida con `pnpm auth:verify`. No existe registro público ni cuenta inicial
por defecto; consulte `docs/runbooks/authentication.md` y no inserte contraseñas en claro.

## Estado real

Empiece por [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) para conocer el propósito, lo implementado y lo
pendiente. Consulte también [PROJECT_STATUS.md](PROJECT_STATUS.md),
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) y [TEST_REPORT.md](TEST_REPORT.md). La existencia de
estructura o diagramas no implica que una integración esté implementada.
