# Ecommerce Inteligente

Monorepo de la plataforma interna Shopify + Wompi + Mastershop + WhatsApp + impresión + BI.

Repositorio canónico: <https://github.com/Proyectokolectivo1/automatizacion-shopify>.

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
pnpm dlq:verify
pnpm auth:verify
pnpm identity:verify
pnpm shopify:verify
pnpm shopify:webhooks:verify
pnpm shopify:orders:verify
pnpm orders:classification:verify
pnpm shopify:reconciliation:verify
pnpm transport-rates:verify
pnpm wompi:verify
pnpm whatsapp:verify
pnpm operations:verify
pnpm alerts:verify
pnpm web:verify
```

Las migraciones se aplican con `pnpm database:migrate`; revise primero
`docs/runbooks/database-migrations.md`. No use `prisma db push` en entornos compartidos.

El publisher y el worker outbox nacen desactivados y con kill switch. Para una prueba local controlada,
consulte `docs/runbooks/outbox-operations.md`; el worker se ejecuta en otro proceso con
`pnpm --filter @ecommerce/api start:outbox-worker` después de compilar.

La API DLQ se valida con `pnpm dlq:verify` y permanece desactivada con kill switch activo por defecto.

La autenticación base se valida con `pnpm auth:verify`. No existe registro público ni cuenta inicial
por defecto; consulte `docs/runbooks/authentication.md` y no inserte contraseñas en claro.

El ingreso webhook Shopify se valida con `pnpm shopify:webhooks:verify`. Solo admite fixtures
sintéticos cuando la simulación está activa; consulte `docs/runbooks/shopify-webhooks.md`. La
suscripción y API reales continúan bloqueadas por credenciales.

La normalización de pedidos sintéticos se valida con `pnpm shopify:orders:verify`; consulte
`docs/runbooks/shopify-order-sync.md`. Dinero se almacena en unidades menores y snapshots tardíos no
reemplazan versiones más nuevas.

La clasificación prepago/COD se valida con `pnpm orders:classification:verify`; consulte
`docs/runbooks/order-classification.md`. Las reglas son versionadas por tienda, el historial es
inmutable y todo tráfico real permanece desactivado.

La reconciliación simulada se valida con `pnpm shopify:reconciliation:verify`; consulte
`docs/runbooks/shopify-reconciliation.md`. Detecta faltantes, webhooks fallidos y pedidos atascados,
y reprocesa exclusivamente mediante outbox con RBAC, idempotencia y kill switch.

Las tarifas de transporte simuladas se validan con `pnpm transport-rates:verify`; consulte
`docs/runbooks/transport-rates.md`. Las políticas son versionadas por alcance, la resolución falla
cerrada y Wompi/WhatsApp permanecen desactivados.

Las intenciones Wompi simuladas se validan con `pnpm wompi:verify`; consulte
`docs/runbooks/wompi-payment-intents.md`. Los links usan un dominio `.invalid`, no capturan tarjetas y
todo tráfico/credencial real permanece bloqueado.

El mismo gate valida recordatorios durables a +8/+16 horas; consulte
`docs/runbooks/payment-reminders.md`. Solo se crea outbox sintético, sin envío WhatsApp real.

También valida vencimiento a 24 horas, abandono y carreras contra webhooks; consulte
`docs/runbooks/payment-expiration.md`. `MARK`/`CANCEL` solo generan solicitudes simuladas y nunca
mutan Shopify en esta fase.

La conciliación diaria simulada usa el mismo gate; consulte
`docs/runbooks/wompi-reconciliation.md`. Persiste checkpoint, reportes e incidencias deduplicadas,
alerta por outbox y nunca corrige automáticamente estados o importes.

Las alertas operativas internas se validan con `pnpm alerts:verify`; consulte
`docs/runbooks/operational-alerts.md`. Persisten ciclos de atención v1 deduplicados y solo ofrecen
lectura tenant-safe; no envían notificaciones ni corrigen recursos.

El dashboard interno usa Next.js como BFF y se valida con `pnpm web:verify`; consulte
`docs/runbooks/web-dashboard.md`. Los tokens API solo viven en cookies HttpOnly, toda mutación de
sesión exige CSRF/origen y el navegador recibe una proyección operativa sin IDs ni PII.

## Estado real

Empiece por [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) para conocer el propósito, lo implementado y lo
pendiente. Consulte también [PROJECT_STATUS.md](PROJECT_STATUS.md),
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) y [TEST_REPORT.md](TEST_REPORT.md). La existencia de
estructura o diagramas no implica que una integración esté implementada.
