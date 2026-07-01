import { rmSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Espejo unidireccional: deja `dest` idéntico a `src` (copia recursiva + borrado de
 * sobrantes, vía rm+cp). Nunca escribe de vuelta al origen. Lanza si `src` no existe.
 *
 * Nota: el rm+cp NO es atómico — si el proceso muere entre el rm y el cp, `dest` queda
 * vacío y basta re-ejecutar el espejo. Asumimos que `src` (un `manager/`) contiene solo
 * archivos regulares; `cpSync` no deref​erencia symlinks, así que un symlink en el origen
 * se copiaría tal cual.
 */
export function espejar(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error(`No existe el origen a espejar: ${src}`);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true }); // asegura el folder superior ({sistema}/)
  cpSync(src, dest, { recursive: true });
}
