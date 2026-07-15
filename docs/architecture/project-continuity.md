# Continuidad y relevo entre sesiones

Actualizado: 2026-07-14

## Objetivo

Evitar que una sesión nueva reinicie el proyecto, dé por completa una integración simulada o pierda
decisiones, bloqueos y evidencia. El repositorio es la fuente de verdad; el chat no lo es.

## Fuentes que se leen antes de editar

1. Especificación maestra y prompt maestro indicados en `NEXT_SESSION_PROMPT.md`.
2. `PROJECT_OVERVIEW.md` para propósito, avance y siguiente vertical.
3. `PROJECT_STATUS.md`, `IMPLEMENTATION_PLAN.md` y `BACKLOG.md` para estado ejecutable.
4. `DECISIONS.md`, `RISKS.md` y `TECHNICAL_DEBT.md` para restricciones vigentes.
5. `TEST_REPORT.md` y `RELEASE_CHECKLIST.md` para evidencia y condiciones de salida.
6. `SESSION_LOG.md` para la secuencia cronológica y el último punto de relevo.
7. `NEXT_SESSION_PROMPT.md` para el baseline y la vertical exacta.

## Protocolo de cierre de cada sesión

1. Ejecutar los gates aplicables y registrar resultados reales, incluidos fallos y bloqueos.
2. Actualizar el resumen, estado, plan y backlog con una única siguiente vertical concreta.
3. Actualizar decisiones, riesgos y deuda solo cuando cambien; nunca borrar historial material.
4. Actualizar reporte de pruebas y checklist de release sin declarar producción prematuramente.
5. Agregar una entrada append-only a `SESSION_LOG.md` con objetivo, cambios, evidencia, bloqueos,
   commit/PR y siguiente paso.
6. Regenerar `NEXT_SESSION_PROMPT.md` con rutas, branch, baseline, bloqueos y criterios exactos.
7. Verificar que los diez documentos no se contradigan antes del commit.

## Reglas de consistencia

- `PROJECT_OVERVIEW.md` responde qué es, qué existe, qué falta y qué sigue.
- `PROJECT_STATUS.md` contiene el estado técnico confirmado en la sesión más reciente.
- `IMPLEMENTATION_PLAN.md` mantiene fases y criterios de salida; `BACKLOG.md`, prioridad y estado.
- `SESSION_LOG.md` no se reescribe: corrige entradas antiguas mediante una nota nueva.
- Una integración simulada conserva el bloqueo real y sus flags/kill switch cerrados por defecto.
- Un gate no ejecutado o bloqueado nunca se registra como verde.
- El proyecto permanece `EN_DESARROLLO` mientras exista cualquier criterio obligatorio pendiente.

## Verificación rápida de relevo

Antes de comenzar una vertical, confirmar: árbol Git, rama/PR, último commit, migraciones, baseline,
bloqueos externos y siguiente historia. Si cualquiera difiere de los documentos, primero se corrige
la documentación viva y se registra la discrepancia.
