# Contrato de datos de fundación E0-H4A

## Convenciones

- IDs internos UUID generados por PostgreSQL.
- Timestamps `TIMESTAMPTZ(3)` en UTC.
- Nombres SQL `snake_case`; modelos Prisma en singular.
- Moneda en tres letras ISO 4217 mayúsculas.
- Configuración y payloads en `JSONB`.
- Migración expand-only: solo crea tipos, tablas, constraints e índices.

## Tablas

`organizations` es la raíz de propiedad. Exige nombre y timezone no vacíos y moneda con formato ISO.
Una organización no puede eliminarse mientras conserve tiendas (`ON DELETE RESTRICT`).

`stores` pertenece obligatoriamente a una organización. `shopify_shop_domain` es único, minúsculo y
debe terminar en `.myshopify.com`. Estados: `pending`, `active`, `disconnected`, `suspended`.

`idempotency_keys` hace única la combinación `(scope, key)`. Estados: `processing`, `completed` y
`failed`. `request_hash` detecta una clave reutilizada con otro contenido y el snapshot permite
repetir una respuesta perdida sin crear otro agregado.

`outbox_events` registra agregado UUID, evento/version, payload, correlación, disponibilidad e
intentos. Los intentos no pueden ser negativos y un evento `published` requiere `published_at`. El
E0-H4B añadió leases, error redactado y estado `dead_letter`. `job_executions` conserva el estado de
cada intento del consumidor. E0-H4C añadió ownership organizacional, backfill y generaciones de
entrega. Los checks de ownership se mantienen `NOT VALID` hasta verificar que no existan filas legacy
sin propietario, pero ya impiden escrituras nuevas incompletas. Consulte `outbox-events.md`.

No hay API pública ni datos de negocio en esta vertical. Los checks SQL se contrastan contra el
esquema Prisma mediante `prisma migrate diff`.
