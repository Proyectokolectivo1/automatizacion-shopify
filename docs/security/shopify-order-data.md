# Seguridad de datos de pedidos Shopify

## Controles implementados

- El cuerpo crudo del webhook no se guarda; solo hash, resumen y `provider_resource_id` técnico.
- El token se descifra justo antes de llamar al proveedor y no entra en logs, métricas, auditoría ni
  eventos outbox.
- Los FKs compuestos impiden relacionar registros de organizaciones o tiendas distintas.
- Validación estricta limita tamaños, formatos de email/teléfono, cantidades, timestamps y montos.
- Flags, modo simulación y kill switch son independientes del ingreso webhook.
- Auditoría y métricas usan categorías acotadas, sin payloads ni PII.
- Errores del proveedor se persisten como categoría segura y pueden llegar a DLQ.

## Restricciones antes de una conexión real

- Aprobar retención legal, derecho de acceso/borrado y clasificación de PII.
- Definir cifrado o tokenización para campos que lo requieran y acceso operativo por RBAC.
- Añadir pruebas con payloads oficiales anonimizados, versiones API soportadas y límites reales.
- Implementar rotación de credenciales/secreto con solapamiento y reconciliación periódica.

Hasta entonces `SHOPIFY_ORDER_SYNC_ENABLED=false`, `SHOPIFY_ORDER_SYNC_KILL_SWITCH=true` y
`SHOPIFY_ORDER_SYNC_SIMULATION_MODE=true` son los valores seguros.
