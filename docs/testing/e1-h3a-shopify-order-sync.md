# Evidencia de pruebas E1-H3A

## Cobertura dedicada

- Normalizador: IDs, dinero sin flotantes, dirección, PII sintética y contrato inválido.
- PostgreSQL: migración desde vacío, 10 migraciones, drift, FKs tenant, unicidad y montos.
- Servicio: carrera concurrente, replay, actualización nueva, snapshot tardío y kill switch.
- Pipeline: webhook → outbox → Redis → worker → cliente/dirección/pedido/items.
- Resiliencia: Redis inaccesible y recuperado; recurso inexistente agota retry y llega a DLQ.
- Seguridad: no hay token, secreto HMAC ni dominio completo en auditoría/eventos.

## Comandos

```bash
pnpm database:verify
pnpm shopify:webhooks:verify
pnpm shopify:orders:verify
pnpm validate
```

Todos los fixtures contienen `_fixture.synthetic=true`, `test=true` y dominios/datos reservados para
pruebas. Ninguna suite realiza tráfico externo.
