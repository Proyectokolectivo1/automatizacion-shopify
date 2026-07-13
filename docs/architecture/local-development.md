# Infraestructura local E0-H2

```mermaid
flowchart LR
  Host["Host de desarrollo"] -->|127.0.0.1:5433| PG["PostgreSQL 17.10"]
  Host -->|127.0.0.1:6380| Redis["Redis 7.4.9"]
  Host -->|127.0.0.1:9100/9101| MinIO["MinIO comunitario 2025-09-07"]
  PG --> PGV[(postgres_data)]
  Redis --> RV[(redis_data · AOF)]
  MinIO --> MV[(minio_data)]
```

Los servicios comparten únicamente la red bridge privada `backend`. Los puertos publicados se ligan
a `127.0.0.1`, no a todas las interfaces. Las credenciales se generan localmente en `.env`, archivo
excluido de Git.

Esta vertical no conecta todavía la API a las dependencias. Prisma, migraciones, outbox y BullMQ
pertenecen a E0-H3/E0-H4.
