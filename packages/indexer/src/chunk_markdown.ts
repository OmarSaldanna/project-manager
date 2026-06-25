import type { IndexEntry } from "@pm-ai/core";

/**
 * Parte un markdown en chunks por encabezado (prompt.md §6, ajuste del usuario).
 * Cada sección produce un `markdown_chunk` donde:
 *   - nombre      = breadcrumb de encabezados ancestros (ej. "PRD > Fase 2 > Riesgos")
 *   - descripcion = contenido de la sección (lo que se embebe)
 *   - contenido   = idem (base del content_hash)
 *
 * El contenido previo al primer encabezado se emite como chunk "(preámbulo)".
 */
export function chunkMarkdown(ruta: string, texto: string): IndexEntry[] {
  const archivo = basename(ruta);
  const lines = texto.replace(/\r\n/g, "\n").split("\n");

  const chunks: IndexEntry[] = [];
  const stack: { level: number; title: string }[] = [];
  let buffer: string[] = [];
  let currentTitle: string | null = null;

  const flush = () => {
    const contenido = buffer.join("\n").trim();
    buffer = [];
    if (!contenido) return;
    const breadcrumb = stack.map((s) => s.title).join(" > ");
    const nombre = breadcrumb || "(preámbulo)";
    chunks.push({
      tipo: "markdown_chunk",
      nombre,
      descripcion: contenido,
      contenido,
      librerias: [],
      dependencias: [],
      archivo,
      ruta,
    });
    void currentTitle;
  };

  let fence: string | null = null; // carácter de apertura (` o ~) si estamos dentro de un fence

  for (const line of lines) {
    // Apertura/cierre de bloque de código fenced (```/~~~). Dentro de un fence, un `#`
    // es un comentario de código, NO un encabezado: no debe partir en chunks.
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      const ch = f[1]![0]!;
      if (fence === null) fence = ch;
      else if (ch === fence) fence = null;
      buffer.push(line);
      continue;
    }

    const m = fence === null ? /^(#{1,6})\s+(.*)$/.exec(line) : null;
    if (m) {
      flush();
      const level = m[1]!.length;
      const title = m[2]!.trim();
      // El stack mantiene solo ancestros de nivel estrictamente menor.
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
      stack.push({ level, title });
      currentTitle = title;
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}

function basename(ruta: string): string {
  const parts = ruta.split("/");
  return parts[parts.length - 1] ?? ruta;
}
