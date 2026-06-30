import { rmSync, cpSync, existsSync } from "node:fs";

/**
 * Espejo unidireccional: deja `dest` idéntico a `src` (copia recursiva + borrado de
 * sobrantes, vía rm+cp). Nunca escribe de vuelta al origen. Lanza si `src` no existe.
 */
export function espejar(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error(`No existe el origen a espejar: ${src}`);
  }
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}
