import type { IndexEntry, PmTipo } from "@pm-ai/core";

const CONFIG_TIPOS = new Set<PmTipo>(["json", "yaml", "config"]);
const MAX_CHARS = 4000;

/** Ruta como tokens de texto ("app/api/meses/route.ts" → "app api meses route ts"). */
function rutaTokens(ruta: string): string {
  return ruta.replace(/[/_.\-]+/g, " ").trim();
}

/**
 * Texto que se EMBEBE para un símbolo/chunk. Antes se embebía solo la `descripcion`; las
 * señales deterministas que el indexador ya captura (nombre, ruta, firma, constantes y sus
 * valores, valores de configuración, librerías) quedaban FUERA del vector — origen de los
 * puntos ciegos en config y constantes. Aquí se componen en una mini-ficha.
 *
 * La columna `descripcion` (payload humano que ve el agente) NO cambia: solo cambia el texto
 * que alimenta al embedder.
 */
export function buildEmbedText(entry: IndexEntry, descripcion: string): string {
  const d = (entry.detalles ?? {}) as Record<string, unknown>;
  const partes: string[] = [entry.nombre, rutaTokens(entry.ruta), descripcion];

  const firma = typeof d.firma === "string" ? d.firma : "";
  if (firma && firma !== descripcion) partes.push(firma);

  // Constantes de módulo: nombres + valores literales cortos (rescata listas como PUBLIC_PATHS,
  // umbrales como DIAS_CORTE=7), que la búsqueda no podía alcanzar al no ser entidad propia.
  const consts = Array.isArray(d.constantes) ? (d.constantes as string[]) : [];
  if (consts.length) partes.push(`Constantes: ${consts.join(", ")}`);
  const valores = d.constantes_valores as Record<string, string> | undefined;
  if (valores) for (const [k, v] of Object.entries(valores)) partes.push(`${k} = ${v}`);

  // Configuración: vocabulario y valores notables (claves anidadas, nombres, URLs, ids) que
  // el manifiesto ≤3 oraciones no garantiza incluir. Resuelve "qué hay dentro del config".
  if (CONFIG_TIPOS.has(entry.tipo)) {
    const resumen = Array.isArray(d.resumen) ? (d.resumen as string[]) : [];
    if (resumen.length) partes.push(resumen.join(" · "));
  }

  if (entry.librerias.length) partes.push(`Usa: ${entry.librerias.slice(0, 10).join(", ")}`);

  return partes.filter(Boolean).join("\n").slice(0, MAX_CHARS);
}
