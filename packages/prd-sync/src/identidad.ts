import { createHash } from "node:crypto";

/** Mapa cerrado unidad (config.json) → empresa (sufijo de carpeta). */
const EMPRESA_POR_UNIDAD: Record<string, string> = {
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
  const hex = createHash("sha256").update(projectId).digest("hex");
  return (BigInt("0x" + hex) % 10000n).toString().padStart(4, "0");
}

/** Nombre de carpeta destino: `{prd_id}_{empresa}`. */
export function construirPrdDir(prdId: string, empresa: string): string {
  return `${prdId}_${empresa}`;
}
