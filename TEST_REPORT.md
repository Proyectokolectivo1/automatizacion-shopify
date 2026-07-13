# Reporte de pruebas

Actualizado: 2026-07-12

## Baseline inicial

El repositorio no tenía aplicación ni comandos. Herramientas detectadas: Node 22.16.0, pnpm
10.25.0, Docker 29.1.3 y Compose 5.0.1.

## Iteración E0-H1

| Validación          | Comando                          | Resultado            |
| ------------------- | -------------------------------- | -------------------- |
| Instalación         | `pnpm install --frozen-lockfile` | OK                   |
| Quality gate        | `pnpm validate`                  | OK                   |
| Unitarias/cobertura | `pnpm test`                      | OK, health 100 %     |
| Build               | `pnpm build`                     | OK, NestJS y Next.js |
| Auditoría           | `pnpm audit --prod`              | OK                   |
| Smoke API/web       | artefactos compilados            | OK                   |

Incidencias corregidas: `rootDir` de pruebas, configuración ESLint de Next.js, PostCSS vulnerable
transitivo y espera insuficiente del smoke web.

## Iteración E0-H2

| Validación    | Comando                             | Resultado              |
| ------------- | ----------------------------------- | ---------------------- |
| Configuración | `pnpm infra:config`                 | OK                     |
| Servicios     | `pnpm infra:verify`                 | OK, 3/3 saludables     |
| PostgreSQL    | `pg_isready` + `SELECT 1`           | OK, autenticado        |
| Redis         | `PING` autenticado / sin credencial | OK / `NOAUTH` esperado |
| MinIO         | health + operaciones S3 reales      | OK                     |
| Persistencia  | recreación conservando volúmenes    | OK, 3/3                |
| Bindings      | inspección Docker                   | OK, solo `127.0.0.1`   |
| Migraciones   | N/A                                 | NO_APLICA              |

Incidencias corregidas: Docker inicialmente apagado, lint de scripts JS, colisión de puertos y prueba
MinIO fortalecida para verificar un objeto mediante protocolo S3.

## Iteración E0-H3

| Validación              | Comando                     | Resultado                                 |
| ----------------------- | --------------------------- | ----------------------------------------- |
| Unitarias y cobertura   | `pnpm test`                 | OK, 6/6; 100 % en lógica crítica incluida |
| Integración HTTP        | `pnpm test:integration`     | OK, 3/3                                   |
| Formatter, lint y tipos | `pnpm validate`             | OK                                        |
| Build                   | `pnpm build`                | OK, API y web                             |
| Runtime observable      | `pnpm observability:verify` | OK                                        |
| Readiness inicial       | `GET /health/ready`         | 200; PostgreSQL, Redis y MinIO sanos      |
| Correlación             | request/response/error      | OK, header y cuerpo propagados            |
| Métricas                | `GET /metrics`              | OK, Prometheus y etiquetas acotadas       |
| Redacción               | logs capturados             | OK, sin Authorization ni PII de query     |
| Fallo Redis             | detener/reiniciar servicio  | 503 degradado y recuperación a 200        |
| Seguridad               | `pnpm audit --prod`         | OK, sin vulnerabilidades reportadas       |
| Migraciones             | N/A                         | NO_APLICA; comienzan en E0-H4A            |

### Fallos encontrados y corregidos

1. Tipos inseguros en pruebas y genérico del cliente Redis.
2. Aborto de Nest durante diagnóstico e inyección accidental del constructor de configuración.
3. Mezcla de suites unitarias/integración en cobertura.
4. Rama no cubierta en validación SSL; la lógica crítica quedó al 100 %.
5. La prueba runtime ahora exige degradación exclusiva de Redis y restaura siempre el servicio.

E0-H3 está completa. OpenTelemetry, alertas conectadas y protección productiva de `/metrics`
permanecen explícitamente pendientes en E0-H3B.
