# Seguridad de alertas operativas

- Fail-closed: `OPERATIONAL_ALERTS_ENABLED=false` y `OPERATIONAL_ALERTS_KILL_SWITCH=true` por defecto.
- Tenant: FK obligatoria, predicado `organization_id` en evaluación y lectura, y RBAC compara ruta con
  el tenant autenticado.
- Privilegio mínimo: solo owner/admin/operations pueden leer; support, read-only y otros roles reciben 403.
- Dedupe: índice parcial único y locks transaccionales ordenados eliminan carreras entre evaluadores.
- Ventana/lote: lookback máximo configurable hasta 744 horas y lote máximo 100 tenants.
- Datos: se persisten únicamente regla, tipo, estado, conteo y timestamps; no se copian IDs fuente,
  payloads, contactos, nombres, URLs ni secretos.
- Auditoría: acciones `operations.alerts.evaluated|listed|rules_viewed` y variantes de fallo, con
  metadatos acotados.
- Métrica: `ecommerce_api_operational_alert_operations_total{action,outcome}`; ambas etiquetas tienen
  vocabulario cerrado.

No hay correo, WhatsApp, webhook saliente, exportación, autocorrección ni proveedor externo en E6-H4A.
