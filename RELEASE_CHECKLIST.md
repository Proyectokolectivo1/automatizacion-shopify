# Checklist de release

Actualizado: 2026-07-14

Estado global: **NO LISTO PARA RELEASE**.

- [ ] Alcance MVP y criterios de aceptación completos.
- [x] Prompt maestro disponible y requisitos reconciliados.
- [ ] Formatter, lint, typecheck, unit, integración, E2E y build verdes para todo el MVP.
- [ ] Migraciones expand/contract revisadas y probadas; falta validar checks legacy `NOT VALID`.
- [ ] Idempotencia base, duplicados y respuesta perdida probados; faltan eventos funcionales tardíos.
- [ ] Adaptadores reales contrastados con documentación oficial.
- [ ] Credenciales gestionadas fuera de Git y secret scan limpio.
- [ ] Flags, simulación y kill switches de outbox/correo verificados; faltan proveedores futuros.
- [ ] Alertas, métricas, dashboards técnicos y runbooks operativos completos.
- [ ] Carga de 500 pedidos/día, ráfagas, acumulación y recuperación aprobadas.
- [ ] Backups y restauración con evidencia y tiempos medidos.
- [ ] Matriz de impresoras y piloto observado completados.
- [ ] Revisión legal de datos, retención, pagos y conversaciones.
- [ ] Rollback documentado y smoke tests exitosos.
- [ ] Despliegue aprobado explícitamente por una persona autorizada.

## Evidencia de fundaciones

- [x] Monorepo, CI y quality gate reproducibles.
- [x] PostgreSQL, Redis y almacenamiento S3-compatible locales con health checks.
- [x] Persistencia local verificada después de recrear contenedores.
- [x] Secretos de desarrollo excluidos de Git y bindings limitados a localhost.
- [x] Logs JSON redactados, correlation ID, errores seguros y métricas base.
- [x] Readiness real de PostgreSQL, Redis y MinIO con recuperación Redis probada.
- [x] Migración inicial expand-only probada desde vacío, reaplicada y sin drift.
- [x] Constraints base de ownership, dominio, moneda, idempotencia y outbox probados.
- [x] Outbox transaccional, publisher, reintentos y DLQ implementados.
- [x] Login base, sesiones revocables, refresh rotativo, RBAC y tenant isolation probados.
- [x] Invitación y recuperación seguras con replay, expiración y controles fail-closed probados.
- [ ] Administración de roles, bootstrap inicial y mecanismo UI cookie/CSRF completos.
- [x] Inspección/reproceso manual de DLQ autenticado, aislado, idempotente y auditado.
- [ ] OpenTelemetry y alertas conectadas a un backend verificable.
- [ ] Acceso a `/metrics` restringido por red/proxy en producción.
- [ ] Proveedor S3-compatible apto para producción seleccionado y aprobado.
