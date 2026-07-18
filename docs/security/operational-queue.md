# Seguridad — cola operativa

Actualizado: 2026-07-17

## Autorización y aislamiento

- RBAC default-deny con permiso independiente `operations.queue.read`.
- Acceso únicamente para `owner`, `admin` y `operations`; soporte, finanzas, logística y solo lectura
  quedan denegados.
- La organización autenticada debe coincidir con la ruta.
- Cada rama SQL se acota por `organization_id`; el filtro externo nunca sustituye ese límite.

## Minimización

La proyección contiene solo UUID internos, estados, fechas y razones enumeradas. No consulta tablas
de PII ni columnas de contenido, payload, secretos o identificadores de proveedor. Las respuestas se
marcan `no-store`; auditoría y métricas usan dimensiones acotadas y no registran el cursor.

## Controles de fallo

Feature flag apagado y kill switch activo son los valores seguros. Query estricta, límites de página
y cursor validado reducen enumeración y abuso. Un recurso de otra organización no puede aparecer
aunque se conozca su UUID.

Antes de ampliar tipos o campos se debe repetir la revisión de minimización, añadir el índice tenant
correspondiente y probar explícitamente aislamiento y ausencia de PII.
