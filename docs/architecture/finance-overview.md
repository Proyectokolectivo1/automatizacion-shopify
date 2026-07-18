# Arquitectura — resumen financiero local

Actualizado: 2026-07-18.

E7-H1A añade una proyección de solo lectura sobre `payment_intents`. Una consulta tenant-bounded usa
`GROUPING SETS` para obtener total y desglose por estado sin N+1. El índice existente
`(organization_id, created_at, id)` acota la ventana `[from,to)`; proveedor y moneda también se filtran
en SQL.

La ruta atraviesa AuthGuard/RbacGuard y el permiso dedicado. El servicio aplica controles fail-closed,
convierte BIGINT monetario directamente a decimal string y solo convierte conteos después de comprobar
`Number.isSafeInteger`. Auditoría conserva `count` y duración de ventana; Prometheus usa únicamente
`action=view` y `outcome=success|failure`.

No se agregan tablas ni snapshots financieros. La fuente sigue siendo la intención Wompi simulada y
no se deriva utilidad. Costos de producto, fees reales, devoluciones, impuestos contables, conciliación
bancaria y atribución requieren decisiones/datos externos y permanecen fuera de esta proyección.
