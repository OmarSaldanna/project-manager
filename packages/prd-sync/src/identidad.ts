import { createHash } from "node:crypto";

/** sha256(input) como entero (bigint). */
function sha256BigInt(input: string): bigint {
  return BigInt("0x" + createHash("sha256").update(input).digest("hex"));
}

/** id determinista de 4 dígitos derivado de un texto (el project_id / nombre del desarrollo). */
export function calcularPrdId(texto: string): string {
  return (sha256BigInt(texto) % 10000n).toString().padStart(4, "0");
}

/** ¿es un slug? minúsculas, dígitos y guiones, sin espacios ni guiones al borde. */
export function esSlug(texto: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(texto);
}

/**
 * Identidad de carpeta en enginecx_prd a partir del `sistema` (proyecto de la EMPRESA,
 * folder superior: SIGA, Alfa, Omega, Autoexplora…) y el `projectId` (nombre del desarrollo,
 * folder inferior: nuevos-endpoints, cambios-landing…; DEBE ser un slug).
 *
 * `prdDir` = `{sistema}/PJ{id4}-{projectId}`, con `id4` = hash de 4 dígitos del projectId.
 * El folder inferior (`PJ…`) es la liga/espejo de `manager/`.
 */
export function resolverPrdDir(
  sistema: string,
  projectId: string,
): { prdId: string; prdDir: string } {
  if (!sistema.trim()) throw new Error("sistema no puede estar vacío");
  if (sistema.includes("/")) throw new Error(`sistema no puede contener "/": "${sistema}"`);
  if (!esSlug(projectId)) {
    throw new Error(
      `project_id debe ser un slug (minúsculas, guiones, sin espacios): "${projectId}"`,
    );
  }
  const prdId = calcularPrdId(projectId);
  const prdDir = `${sistema}/PJ${prdId}-${projectId}`;
  return { prdId, prdDir };
}
