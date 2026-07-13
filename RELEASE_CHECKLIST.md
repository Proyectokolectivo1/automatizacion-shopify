# Checklist de release

Actualizado: 2026-07-12

Estado global: **NO LISTO PARA RELEASE**.

- [ ] Alcance MVP y criterios de aceptación completos.
- [x] Prompt maestro disponible y requisitos reconciliados.
- [ ] Formatter, lint, typecheck, unit, integración, E2E y build verdes.
- [ ] Migraciones expand/contract revisadas y probadas.
- [ ] Idempotencia, duplicados, eventos tardíos y respuesta perdida probados.
- [ ] Adaptadores reales contrastados con documentación oficial.
- [ ] Credenciales gestionadas fuera de Git y secret scan limpio.
- [ ] Feature flags, modo simulación y kill switches verificados.
- [ ] Alertas, métricas, dashboards técnicos y runbooks operativos.
- [ ] Carga de 500 pedidos/día, ráfagas, acumulación y recuperación aprobadas.
- [ ] Backups y restauración con evidencia y tiempos medidos.
- [ ] Matriz de impresoras y piloto observado completados.
- [ ] Revisión legal de datos, retención, pagos y conversaciones.
- [ ] Rollback documentado y smoke tests exitosos.
- [ ] Despliegue a producción aprobado explícitamente por una persona autorizada.

## Evidencia de fundaciones

- [x] Monorepo, CI y quality gate reproducibles.
- [x] PostgreSQL, Redis y almacenamiento S3-compatible locales con health checks.
- [x] Persistencia local verificada después de recrear contenedores.
- [x] Secretos de desarrollo excluidos de Git y bindings limitados a localhost.
- [ ] Proveedor S3-compatible apto para producción seleccionado y aprobado.
