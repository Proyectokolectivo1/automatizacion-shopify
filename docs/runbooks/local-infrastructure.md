# Runbook: infraestructura local

## Arranque inicial

```bash
pnpm infra:bootstrap
pnpm infra:verify
```

`infra:verify` valida Compose, inicia los servicios, prueba cada protocolo, escribe marcadores,
recrea los contenedores conservando volúmenes, confirma persistencia y elimina los marcadores.

## Operación diaria

```bash
pnpm infra:up
docker compose ps
pnpm infra:down
```

`infra:down` conserva los volúmenes. Eliminar volúmenes es una operación destructiva y no forma parte
de los scripts del proyecto.

## Diagnóstico

```bash
docker compose ps
docker compose logs --tail=100 postgres redis minio
docker compose config --images
```

Si Docker Desktop está apagado en Windows, inícielo y espere a que `docker info` responda. Si un
puerto está ocupado, cambie únicamente el puerto host correspondiente en `.env`.

## Rollback

Ejecute `pnpm infra:down`. Esto retira contenedores y red, pero conserva datos. No use `down -v` sin
autorización explícita porque elimina los volúmenes locales.
