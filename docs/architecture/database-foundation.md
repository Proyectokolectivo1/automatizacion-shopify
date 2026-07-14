# Arquitectura de persistencia inicial

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ STORES : owns
    ORGANIZATIONS ||--o{ OUTBOX_EVENTS : owns
    ORGANIZATIONS {
      uuid id PK
      varchar name
      char default_currency
      timestamptz created_at
      timestamptz updated_at
    }
    STORES {
      uuid id PK
      uuid organization_id FK
      varchar shopify_shop_domain UK
      store_status status
      jsonb settings_json
    }
    IDEMPOTENCY_KEYS {
      uuid id PK
      varchar scope
      varchar key
      varchar request_hash
      idempotency_status status
      timestamptz expires_at
    }
    OUTBOX_EVENTS {
      uuid id PK
      uuid organization_id FK
      uuid aggregate_id
      varchar event_type
      outbox_status status
      timestamptz available_at
      int attempt_count
      int delivery_version
    }
```

Prisma 7.8.0 genera un cliente tipado en `apps/api/src/generated/prisma`, excluido de Git y regenerado
durante build y pruebas. `@prisma/adapter-pg` utiliza el driver PostgreSQL existente. La URL se
construye desde `POSTGRES_*`; `DATABASE_URL` puede sobrescribirla para pruebas aisladas.

La migración versionada es la fuente de estructura. `db push` no se usa porque omite el historial
revisable. Los checks SQL protegen invariantes incluso frente a escrituras fuera de Prisma.
