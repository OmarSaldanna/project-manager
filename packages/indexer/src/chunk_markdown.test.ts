import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "./chunk_markdown.js";

const PRD = `# PRD Atenea
Intro del proyecto.

## Objetivo
Bot de WhatsApp.

## Fases
### Fase 1
Conexión a Supabase.
### Fase 2
Reportes diarios.
`;

describe("chunkMarkdown", () => {
  it("produce un chunk por sección con encabezado", () => {
    const chunks = chunkMarkdown("proyectos/atenea/PRD.md", PRD);
    const nombres = chunks.map((c) => c.nombre);
    expect(nombres).toEqual([
      "PRD Atenea",
      "PRD Atenea > Objetivo",
      "PRD Atenea > Fases",
      "PRD Atenea > Fases > Fase 1",
      "PRD Atenea > Fases > Fase 2",
    ]);
  });

  it("usa breadcrumb jerárquico como nombre", () => {
    const chunks = chunkMarkdown("p/PRD.md", PRD);
    const fase1 = chunks.find((c) => c.nombre.endsWith("Fase 1"))!;
    expect(fase1.nombre).toBe("PRD Atenea > Fases > Fase 1");
    expect(fase1.descripcion).toContain("Conexión a Supabase");
    expect(fase1.tipo).toBe("markdown_chunk");
  });

  it("emite preámbulo cuando hay texto antes del primer encabezado", () => {
    const chunks = chunkMarkdown("p/x.md", "Sin titulo aun.\n\n# Titulo\nbody");
    expect(chunks[0]!.nombre).toBe("(preámbulo)");
    expect(chunks[0]!.descripcion).toContain("Sin titulo aun");
  });

  it("toma el archivo de la ruta", () => {
    const chunks = chunkMarkdown("proyectos/atenea/PRD.md", PRD);
    expect(chunks[0]!.archivo).toBe("PRD.md");
    expect(chunks[0]!.ruta).toBe("proyectos/atenea/PRD.md");
  });

  it("ignora '#' dentro de bloques de código fenced (no los trata como encabezados)", () => {
    const md = [
      "# Configuración",
      "Ejemplo:",
      "```env",
      "# Cambiar por la URL real",
      "API_URL=https://x",
      "```",
      "Texto final.",
    ].join("\n");
    const chunks = chunkMarkdown("p/doc.md", md);
    // Solo el encabezado real produce una sección; el comentario del fence NO.
    expect(chunks.map((c) => c.nombre)).toEqual(["Configuración"]);
    expect(chunks[0]!.descripcion).toContain("# Cambiar por la URL real");
    expect(chunks[0]!.descripcion).toContain("Texto final.");
  });
});
