#!/usr/bin/env node
// Inyección determinista del JSON de datos en una COPIA de la plantilla trace.html.
// Uso: node inject.mjs <plantilla.html> <data.json> <salida.html>
// Reemplaza SOLO el contenido del <script id="trace-data">; valida el JSON antes de escribir.
import { readFileSync, writeFileSync } from "node:fs";

const [, , plantilla, dataPath, salida] = process.argv;
if (!plantilla || !dataPath || !salida) {
  console.error("Uso: node inject.mjs <plantilla.html> <data.json> <salida.html>");
  process.exit(2);
}

const html = readFileSync(plantilla, "utf8");
const raw = readFileSync(dataPath, "utf8");

// Falla ruidoso si el data.json no es válido (así no se genera un reporte roto).
let datos;
try {
  datos = JSON.parse(raw);
} catch (e) {
  console.error(`data.json inválido: ${e.message}`);
  process.exit(1);
}

const re = /(<script id="trace-data" type="application\/json">)([\s\S]*?)(<\/script>)/;
if (!re.test(html)) {
  console.error('No se encontró el <script id="trace-data"> en la plantilla.');
  process.exit(1);
}

// JSON.stringify para normalizar y garantizar que no rompe el bloque <script>.
const json = JSON.stringify(datos, null, 2).replace(/<\/script>/gi, "<\\/script>");
const out = html.replace(re, `$1\n${json}\n$3`);
writeFileSync(salida, out, "utf8");
console.error(`[pm-trace] reporte generado: ${salida}`);
