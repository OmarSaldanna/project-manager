/**
 * Enmascarado best-effort de secretos en texto fuente. Se aplica ANTES de enviar contenido
 * a un LLM externo (único punto donde el código sale del sistema) y antes de persistir
 * cualquier valor en la DB. No pretende ser un escáner exhaustivo: cubre los patrones más
 * comunes (credenciales asignadas, llaves AWS, tokens Bearer) sin falsos positivos agresivos.
 */
const OCULTO = "«oculto»";

// Claves cuyo valor asignado es sensible (en `clave = "v"`, `"clave": "v"`, `clave: v`).
const CLAVE_SENSIBLE =
  "password|passwd|secret|token|apikey|api[_-]?key|access[_-]?key|secret[_-]?key|" +
  "client[_-]?secret|auth[_-]?token|private[_-]?key|credential";

/** Reemplaza valores de claves sensibles y patrones de llaves conocidos por «oculto». */
export function maskSecrets(text: string): string {
  let out = text;

  // clave-sensible : "valor"  |  clave-sensible = 'valor'  (con o sin comillas en la clave)
  out = out.replace(
    new RegExp(
      `(["']?[\\w.-]*(?:${CLAVE_SENSIBLE})[\\w.-]*["']?\\s*[:=]\\s*)(["'\`])([^"'\`]+)(["'\`])`,
      "gi",
    ),
    (_m, pre: string, q: string) => `${pre}${q}${OCULTO}${q}`,
  );

  // ENV estilo MAYÚSCULAS sin comillas:  AWS_SECRET_KEY=algo
  out = out.replace(
    /\b([A-Z][A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|KEY)[A-Z0-9_]*\s*=\s*)([^\s"'#]+)/g,
    (_m, pre: string) => `${pre}${OCULTO}`,
  );

  // Llave de acceso AWS y tokens Bearer.
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, OCULTO);
  out = out.replace(/\b(Bearer\s+)[A-Za-z0-9._-]{8,}/g, `$1${OCULTO}`);

  return out;
}
