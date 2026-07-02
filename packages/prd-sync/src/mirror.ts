import { rmSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";

/**
 * ¿Es un archivo "de relleno" del sistema operativo/editor que NO debe publicarse?
 * (`.DS_Store`, recursos AppleDouble `._*`, `Thumbs.db`, `desktop.ini`, temporales de
 * editor `*~`/`*.swp`…). Todo lo demás de `manager/` —incluidos `transcripts/` y
 * `transcripts-resumidos/`— SÍ se espeja.
 */
export function esBasura(nombre: string): boolean {
  if (nombre.startsWith("._")) return true; // AppleDouble
  if (nombre.endsWith("~") || nombre.endsWith(".swp") || nombre.endsWith(".swo")) return true;
  const junk = new Set([
    ".DS_Store",
    ".AppleDouble",
    ".LSOverride",
    ".Spotlight-V100",
    ".Trashes",
    ".fseventsd",
    ".DocumentRevisions-V100",
    ".TemporaryItems",
    ".VolumeIcon.icns",
    "Thumbs.db",
    "ehthumbs.db",
    "desktop.ini",
    "Desktop.ini",
  ]);
  return junk.has(nombre);
}

/**
 * Espejo unidireccional: deja `dest` idéntico a `src` (copia recursiva + borrado de
 * sobrantes, vía rm+cp), EXCEPTO los archivos de relleno del SO/editor (`esBasura`), que
 * nunca se copian ni, por tanto, se publican. Nunca escribe de vuelta al origen. Lanza si
 * `src` no existe.
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
  cpSync(src, dest, { recursive: true, filter: (origen) => !esBasura(basename(origen)) });
}
