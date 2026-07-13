# Arquitectura inicial

```mermaid
flowchart LR
  User["Usuario interno"] --> Web["Web · Next.js 15"]
  Web --> API["API · NestJS 11"]
  Shopify["Shopify"] --> API
  API --> Domain["Módulos de dominio"]
  Domain --> DB[(PostgreSQL)]
  Domain --> Outbox["Transactional Outbox"]
  Outbox --> Queue["BullMQ / Redis"]
  Queue --> Workers["Workers por capacidad"]
  Workers --> Providers["Adaptadores externos"]
```

En E0-H1 solo están implementadas las cajas Web y API. Base de datos, outbox, colas, workers y
adaptadores son objetivos posteriores y no deben interpretarse como disponibles.
