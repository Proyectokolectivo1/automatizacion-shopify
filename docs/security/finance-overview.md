# Seguridad — resumen financiero local

Actualizado: 2026-07-18.

- RBAC default-deny: owner/admin/finance; read-only y demás roles reciben 403.
- El tenant se valida contra la membresía activa antes de ejecutar la consulta.
- Ventana máxima 31 días, una consulta agregada e índice tenant+fecha reducen abuso y scans.
- Respuesta `no-store`; no contiene IDs, tiendas, pedidos, referencias, URLs, clientes ni PII.
- Dinero se devuelve como string decimal exacto; no existe redondeo IEEE-754 silencioso.
- Auditoría y métricas omiten importes, estados dinámicos, IDs y términos de búsqueda.
- Feature flag apagada y kill switch activo por defecto; ambos fallan con 503.
- El contrato declara `simulation`; no inicia tráfico, mutaciones, pagos ni exportaciones.
