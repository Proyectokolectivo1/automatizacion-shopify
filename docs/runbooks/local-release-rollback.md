# Runbook local de contención y rollback

## Cuándo usarlo

Ante un fallo de startup, readiness, tasa de error, cola, integridad o seguridad durante un despliegue
autorizado. Este runbook describe la decisión; ejecutar cambios en un entorno real exige autorización
humana y acceso a ese entorno.

## Contención inmediata

1. Detener el avance del despliegue y preservar correlation IDs, métricas y versión del artefacto.
2. Desactivar por kill switch la entrada o el consumidor afectado antes de modificar datos.
3. Mantener activos health/readiness y telemetría; no imprimir payloads ni secretos al investigar.
4. Si hay sospecha de corrupción, congelar mutaciones relacionadas y capturar un backup conforme a la
   política aprobada antes de cualquier reparación.

## Decisión de recuperación

- **Código defectuoso, esquema compatible:** volver al último artefacto conocido compatible con el
  esquema ya aplicado y repetir el smoke.
- **Código anterior incompatible con el esquema:** no forzar el rollback. Publicar un hotfix hacia
  adelante o una fase de compatibilidad expand/contract.
- **Datos corruptos o perdidos:** restaurar únicamente con autorización explícita, primero en una base
  aislada y después de comparar migraciones, constraints, índices, secuencias y filas esperadas.
- **Dependencia externa degradada:** conservar flags/kill switches cerrados y recuperar hacia adelante;
  no fingir éxito con un mock en producción.

## Prohibiciones

- No ejecutar migraciones `down` durante un incidente.
- No restaurar un backup solo para corregir un defecto de aplicación.
- No borrar volúmenes, DLQ, outbox ni evidencia antes de completar el diagnóstico.
- No declarar rollback exitoso hasta que build/version, migraciones, readiness, métricas, BFF, headers
  y shutdown vuelvan a pasar.

## Verificación local

```powershell
pnpm release:smoke
pnpm database:status
pnpm security:verify
pnpm validate
```

Registrar versión origen/destino, autorizador, ventana, resultado y cualquier restore. La validación
E9-H4A solo ejercita startup/shutdown local; no ejecutó un rollback real.
