# Evidencia E3-H1A — conexión WhatsApp simulada

Actualizado: 2026-07-14

## Cobertura

- contrato mock determinista, credencial inválida y ausencia de token en respuesta;
- AES-256-GCM, AAD tenant/tienda, keyring v1→v2 y fallo por AAD distinto;
- controles desactivado/kill switch/no simulación;
- configuración concurrente/replay, ciphertext en DB y outbox único;
- constraint de forma y unicidad global de `phoneNumberId`;
- RBAC, tenant de ruta y lookup ajeno no revelador;
- prueba saludable obligatoria, estados y separación del estado Shopify;
- rotación concurrente, prueba no saludable, auditoría y métrica sin secretos;
- 19 migraciones desde vacío, reaplicación no-op y cero drift.

## Comandos

```text
pnpm whatsapp:verify
pnpm database:verify
pnpm validate
```

No se usaron credenciales, números, mensajes, PII ni endpoints reales.
