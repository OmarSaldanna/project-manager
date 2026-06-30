import { createHash } from "node:crypto";

/** sha256(input) como entero (bigint). Base común para id y sondeo. */
function sha256BigInt(input: string): bigint {
  return BigInt("0x" + createHash("sha256").update(input).digest("hex"));
}

/** Mapa cerrado unidad (config.json) → empresa (sufijo de carpeta). */
const EMPRESA_POR_UNIDAD: Record<string, string | undefined> = {
  "Go Virtual": "govirtual",
  "Gplus Seguros": "gplusseguros",
  "Invarat": "invarat",
  "EngineCX": "enginecx",
  "Garantiplus México": "garantiplus",
  "Garantiplus Colombia": "garantiplus",
};

/** Empresa (sufijo) para una unidad. Lanza si la unidad no está en el catálogo. */
export function mapearEmpresa(unidad: string): string {
  const empresa = EMPRESA_POR_UNIDAD[unidad];
  if (empresa === undefined) {
    throw new Error(
      `Unidad no reconocida: "${unidad}". Válidas: ${Object.keys(EMPRESA_POR_UNIDAD).join(", ")}`,
    );
  }
  return empresa;
}

/** id determinista de 4 dígitos derivado del project_id (sha256 % 10000). */
export function calcularPrdId(projectId: string): string {
  return (sha256BigInt(projectId) % 10000n).toString().padStart(4, "0");
}

/** Nombre de carpeta destino: `{prd_id}_{empresa}`. */
export function construirPrdDir(prdId: string, empresa: string): string {
  return `${prdId}_${empresa}`;
}

/**
 * Resuelve el `prd_dir` libre para un proyecto. Empieza en el id base (sha256 % 10000)
 * y sondea linealmente hasta hallar un dir libre o ya propio. `dueñoDe(dir)` informa qué
 * project_id ocupa cada dir candidato (o null si está libre).
 */
export function resolverPrdDir(
  projectId: string,
  unidad: string,
  dueñoDe: (prdDir: string) => string | null,
): { prdId: string; prdDir: string } {
  const empresa = mapearEmpresa(unidad);
  const base = sha256BigInt(projectId);
  for (let i = 0n; i < 10000n; i++) {
    const prdId = ((base + i) % 10000n).toString().padStart(4, "0");
    const prdDir = construirPrdDir(prdId, empresa);
    const dueño = dueñoDe(prdDir);
    if (dueño === null || dueño === projectId) {
      return { prdId, prdDir };
    }
  }
  throw new Error("Sin ids de 4 dígitos disponibles para esta empresa (10000 ocupados).");
}
