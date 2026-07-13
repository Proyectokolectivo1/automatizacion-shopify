# Reporte de pruebas

Actualizado: 2026-07-12

## Baseline inicial

No aplicable: el repositorio no tenía `package.json`, código ni comandos. Herramientas detectadas:
Node 22.16.0, pnpm 10.25.0, Docker 29.1.3 y Compose 5.0.1.

## Iteración E0-H1

| Validación             | Comando                          | Resultado                                             |
| ---------------------- | -------------------------------- | ----------------------------------------------------- |
| Instalación            | `pnpm install --frozen-lockfile` | OK                                                    |
| Formatter              | `pnpm format:check`              | OK                                                    |
| Lint                   | `pnpm lint`                      | OK, 2 paquetes                                        |
| Typecheck              | `pnpm typecheck`                 | OK, TypeScript strict en 2 paquetes                   |
| Unitarias              | `pnpm test`                      | OK, 1/1 prueba API; web sin pruebas aplicables        |
| Integración            | N/A en E0-H1                     | NO_APLICA                                             |
| E2E                    | N/A en E0-H1                     | NO_APLICA                                             |
| Cobertura              | `pnpm test`                      | API health: 100 % statements/branches/functions/lines |
| Build                  | `pnpm build`                     | OK, NestJS y Next.js 15.5.20                          |
| Seguridad dependencias | `pnpm audit --prod`              | OK, sin vulnerabilidades conocidas                    |
| Smoke API              | `dist/main.js`, `GET /health`    | OK, `status=ok`                                       |
| Smoke web              | standalone Next.js 15, `GET /`   | OK, respuesta y contenido esperado                    |

## Incidencias corregidas

1. El typecheck inicial falló porque las pruebas quedaban fuera de `rootDir`; se separó `rootDir` en
   `tsconfig.build.json`.
2. Next.js no detectaba sus reglas en la configuración ESLint raíz; se añadió configuración local
   oficial mediante `FlatCompat`.
3. La auditoría detectó GHSA-qx2v-qp2m-jg93 en PostCSS transitivo; el override a 8.5.10 eliminó el
   hallazgo y la puerta completa volvió a pasar.
4. El primer smoke web usó un tiempo de arranque insuficiente; el smoke final espera el artefacto
   standalone y comprueba respuesta y contenido.

E0-H1 está completa. No existen aún pruebas de integración con PostgreSQL/Redis/MinIO ni E2E de
negocio; corresponden a verticales posteriores.

## Iteración E0-H2

| Validación           | Comando                             | Resultado                       |
| -------------------- | ----------------------------------- | ------------------------------- |
| Docker Engine        | `docker info`                       | OK, engine 29.1.3 iniciado      |
| Configuración        | `pnpm infra:config`                 | OK                              |
| Health checks        | `pnpm infra:verify`                 | OK, 3/3 servicios healthy       |
| PostgreSQL           | `pg_isready` + `SELECT 1`           | OK, autenticado                 |
| Redis                | `PING` autenticado                  | OK                              |
| Redis sin credencial | `redis-cli ping`                    | OK, rechazado con `NOAUTH`      |
| MinIO                | health + `mc mb/pipe/cat/rm`        | OK, bucket y objeto reales      |
| Persistencia         | `down` + `up` conservando volúmenes | OK en los tres servicios        |
| Bindings             | `docker inspect ...PortBindings`    | OK, exclusivamente `127.0.0.1`  |
| Migraciones          | N/A en E0-H2                        | NO_APLICA; Prisma aún no existe |

### Fallos encontrados y corregidos

1. Docker Engine estaba apagado; se inició Docker Desktop y se verificó la API.
2. Lint aplicaba reglas TypeScript tipadas a scripts JavaScript; se separaron globals y reglas por
   tipo de archivo.
3. Los puertos 5432, 6379, 9000 y 9001 estaban ocupados por infraestructura externa. No se detuvieron
   procesos ajenos; los bindings del proyecto se movieron a 5433, 6380, 9100 y 9101.
4. La primera prueba MinIO solo comprobaba el volumen como filesystem. Se fortaleció para crear un
   bucket y verificar persistencia de un objeto mediante el cliente S3 `mc`.

### Casos de fallo aplicables

- Recreación y reinicio de los tres contenedores: OK.
- Persistencia tras caída controlada: OK.
- Redis sin autenticación: rechazado.
- Eliminación de volúmenes: no ejecutada por ser destructiva.
- Timeout/429/500 de proveedores, DLQ, webhooks e impresión: no aplican todavía.

E0-H2 está completa. La imagen comunitaria MinIO es solo de desarrollo y su riesgo está registrado;
esta evidencia no autoriza su uso en producción.
