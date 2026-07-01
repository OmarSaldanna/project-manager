/**
 * Clasificador de la MAGNITUD de un cambio entre dos versiones de una entidad. Es la pieza que
 * controla costo y ruido: si el delta es `cosmetico` (formato/strings/estilos), `applyFile`
 * genera el `cambio` con una plantilla barata (sin LLM); si no, lo redacta el LLM.
 *
 * Puro y determinista (sin I/O) → testeable en aislamiento. No usa parser: es
 * una heurística textual + comparación de firma/dependencias (señales que el indexador ya captura).
 *
 * Sesgo CONSERVADOR: ante la duda NO marca `cosmetico` (un falso cosmético ocultaría un cambio
 * real; un falso no-cosmético cuesta a lo sumo una llamada LLM barata).
 */
export type Magnitud = "cosmetico" | "firma" | "logica" | "mixto";

/** Lo mínimo que se necesita de cada versión para comparar (desacoplado de db/reconcile). */
export interface VersionParaComparar {
  /** Firma del símbolo (de `detalles.firma`); null si no aplica (md/config/html). */
  firma: string | null;
  librerias: string[];
  dependencias: string[];
  /** Cuerpo crudo de la entidad; null en `prev` si aún no se había persistido (post-migración). */
  cuerpo: string | null;
}

/** Conjuntos distintos (ignora orden y duplicados). */
function setsDifieren(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return true;
  return false;
}

/** Normaliza una firma para comparar (colapsa espacios). */
function normFirma(s: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * ¿La línea (ya trimmeada) es "cosmética"? = comentario, atributo de estilo (className/class),
 * o un literal string suelto. El resto se considera línea con código (sesgo conservador).
 */
function esLineaCosmetica(linea: string): boolean {
  const t = linea.trim();
  if (!t) return true;
  if (/^(\/\/|#|\*|\/\*|\*\/|<!--|-->|""")/.test(t)) return true; // comentario / docstring
  if (/\bclassName\b|\bclass=/.test(t)) return true; // estilos JSX/HTML
  if (/^["'`].*["'`],?;?$/.test(t)) return true; // línea que es solo un literal string
  return false;
}

/** Líneas que aparecen en una versión y no en la otra (añadidas o eliminadas), ya trimmeadas. */
function lineasCambiadas(prevCuerpo: string, nextCuerpo: string): string[] {
  const norm = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  const prev = new Set(norm(prevCuerpo));
  const next = norm(nextCuerpo);
  const nextSet = new Set(next);
  const agregadas = next.filter((l) => !prev.has(l));
  const eliminadas = [...prev].filter((l) => !nextSet.has(l));
  return [...agregadas, ...eliminadas];
}

/**
 * Clasifica el delta `prev → next`. Solo se llama en la rama `versioned` (hay predecesor).
 */
export function clasificarMagnitud(prev: VersionParaComparar, next: VersionParaComparar): Magnitud {
  const cambioFirma =
    normFirma(prev.firma) !== normFirma(next.firma) ||
    setsDifieren(prev.librerias, next.librerias) ||
    setsDifieren(prev.dependencias, next.dependencias);

  // Sin cuerpo previo (p. ej. la primera versión tras la migración aún no lo tenía persistido):
  // no se puede diffear el cuerpo. Conservador: firma si cambió la firma/deps, si no, lógica.
  if (prev.cuerpo === null || next.cuerpo === null) {
    return cambioFirma ? "firma" : "logica";
  }

  const cambiadas = lineasCambiadas(prev.cuerpo, next.cuerpo);
  const hayLogica = cambiadas.some((l) => !esLineaCosmetica(l));
  const hayCosmetico = cambiadas.length > 0 && cambiadas.every(esLineaCosmetica);

  if (cambioFirma && hayLogica) return "mixto";
  if (cambioFirma) return "firma";
  if (hayLogica) return "logica";
  if (hayCosmetico) return "cosmetico";
  return "logica"; // el hash cambió pero no detectamos líneas → no arriesgar cosmético
}

/**
 * Texto determinista del `cambio` según su magnitud, para cuando NO se invoca al LLM: cambios
 * cosméticos (gate de costo) o indexado sin LLM (SignatureDescriber) o sin cuerpo previo que diffear.
 */
export function plantillaCambio(m: Magnitud): string {
  switch (m) {
    case "cosmetico":
      return "Cambios cosméticos (formato, estilos o textos); sin cambios de firma ni de lógica.";
    case "firma":
      return "Cambió la firma o las dependencias de la entidad.";
    case "mixto":
      return "Cambió la firma/dependencias y además la lógica de la entidad.";
    default:
      return "Cambió la lógica o el comportamiento de la entidad.";
  }
}
