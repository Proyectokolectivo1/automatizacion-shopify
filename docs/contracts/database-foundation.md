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
`failed`. `request_hash` permitirá detectar una clave reutilizada con otro contenido; el
comportamiento transaccional se implementará en E0-H4B.

`outbox_events` registra agregado UUID, evento/version, payload, correlación, disponibilidad e
intentos. Los intentos no pueden ser negativos y un evento `published` requiere `published_at`. El
publicador y la DLQ no forman parte de E0-H4A.

No hay API pública ni datos de negocio en esta vertical. Los checks SQL se contrastan contra el
esquema Prisma mediante `prisma migrate diff`.
