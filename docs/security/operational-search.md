# Seguridad de búsqueda operativa E6-H5A

- La organización proviene de la sesión autenticada; el BFF nunca acepta un tenant del navegador.
- Solo OWNER, ADMIN y OPERATIONS tienen `operations.search.read`.
- La consulta SQL nace acotada por organización y por una ventana máxima de 31 días.
- El cursor incluye una huella SHA-256 truncada de término, ventana y filtros; no se puede reutilizar
  con otra consulta.
- Los campos con PII, cuerpos, snapshots, evidencias y referencias de proveedor no forman parte del
  texto buscable ni de la proyección.
- Auditoría registra clase de término, filtros, duración de ventana y conteo, nunca `q`.
- Prometheus usa solo `outcome`; no crea etiquetas desde términos, tenants ni recursos.
- Flag y kill switch independientes fallan cerrados. E6-H5A no introduce mutaciones, tráfico externo,
  detalle sensible ni exportaciones.
