# Pruebas E6-H3A — dashboard web seguro

Actualizado: 2026-07-17

## Cobertura dedicada

- 16 pruebas auth/PostgreSQL: opciones tras credenciales, membresías activas, tenant, rotación atómica,
  revocación anterior, respuesta uniforme y auditoría sin secretos.
- 8 pruebas BFF: flags de cookies, ausencia de tokens en body, selección backend-only, CSRF negativo,
  refresh, logout, tenant derivado y eliminación de IDs/PII.
- Typecheck/lint/build de Next.js, rutas dinámicas, headers de seguridad y timeout de API.
- Revisión visual en navegador de escritorio/móvil, labels accesibles, hidratación y error seguro.

El navegador no contiene Bearer, email ni IDs de recursos en el payload del dashboard. La prueba
maliciosa con `organizationId` se rechaza antes de contactar NestJS.

La regresión completa y los resultados finales se registran en `TEST_REPORT.md`.
