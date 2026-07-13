# Deuda técnica

Actualizado: 2026-07-12

No se registra como deuda lo que pertenece a una vertical futura; se registra como backlog. Deuda
actual:

| ID     | Deuda                                                         | Impacto | Plan                                                                   |
| ------ | ------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| TD-001 | El health check API solo verifica el proceso, no dependencias | Medio   | Ampliar en E0-H3 con readiness de PostgreSQL, Redis y MinIO            |
| TD-002 | La web no tiene pruebas de componente/E2E todavía             | Bajo    | Añadir Playwright cuando exista el primer flujo de usuario             |
| TD-003 | No hay enforcement automático de fronteras modulares          | Medio   | Añadir reglas de dependencias al crear paquetes de dominio/aplicación  |
| TD-004 | El runner local usa Node 22.16.0, no el parche fijado 22.23.1 | Medio   | Actualizar toolchain local y repetir validación                        |
| TD-005 | PostCSS requiere override de seguridad transitivo             | Bajo    | Retirar al verificar que Next.js incluya PostCSS >=8.5.10              |
| TD-006 | MinIO comunitario ya no recibe parches                        | Alto    | Sustituir antes de piloto tras decisión de proveedor, licencia y costo |
