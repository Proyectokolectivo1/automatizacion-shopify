# Seguridad de clasificación de pedidos

- El consumidor resuelve pedido y política usando `organization_id`; las FKs compuestas impiden
  cruzar tienda u organización.
- El worker es el único actor que cambia el estado en este corte; no existe mutación desde frontend.
- La auditoría, métricas y eventos no incluyen el snapshot ni PII.
- La evidencia inválida o ambigua falla cerrado y usa reintentos/DLQ; no se elige un modo por defecto.
- El historial es append-only con constraint de transición distinta y trigger contra edición/borrado.
- El payload de `order.classified.v1` contiene solo IDs internos, versión/regla, modo y estado.
- Conexiones reales siguen bloqueadas hasta resolver credenciales y retención legal de PII.
