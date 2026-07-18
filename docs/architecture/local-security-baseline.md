# Baseline local de seguridad E9-H3A

`pnpm security:verify` orquesta controles estáticos sobre el checkout actual y consulta el advisory DB
de pnpm. Usa `git ls-files --cached --others --exclude-standard`: en desarrollo también audita archivos
nuevos que podrían entrar al siguiente commit; en CI todos son rastreados.

El gate cubre ocho grupos:

1. patrones high-confidence de llaves privadas y tokens GitHub/AWS/Shopify/Slack/Wompi;
2. política de archivos/artefactos sensibles y reglas de ignore;
3. versiones exactas, lockfile y ausencia de lifecycle scripts de instalación;
4. permisos/ref de CI, checkout sin credencial persistente y frozen lockfile;
5. imágenes Compose fijadas, secretos obligatorios, puertos loopback y capacidades peligrosas;
6. CSP y headers mínimos del BFF web;
7. `pnpm audit --prod --audit-level high` sin vulnerabilidades high/critical;
8. reporte agregado `0600` bajo `.artifacts/security`, sin coincidencias ni contenido fuente.

Cada detector ejecuta una muestra construida en memoria antes del scan para evitar un gate siempre
verde por regex rota. Ante un hallazgo se imprime solo detector, ruta y línea, nunca el valor.

El gate no es SAST, DAST, análisis de imagen, pentest, revisión criptográfica ni validación de TLS/ACL
productivos. Las acciones CI aún usan tags semver exactos y el CSP de Next permite scripts inline;
ambos quedan como riesgos abiertos antes de un release real.
