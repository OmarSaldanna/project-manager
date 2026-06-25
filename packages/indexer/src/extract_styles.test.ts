import { describe, it, expect } from "vitest";
import { extractStyles } from "./extract_styles.js";

describe("extractStyles", () => {
  it("una entrada tipo estilos con comentario, nº de reglas y variables", () => {
    const src = [
      "/* Tema principal del dashboard */",
      ":root { --color-primario: #06f; }",
      ".boton { color: var(--color-primario); }",
    ].join("\n");
    const [e] = extractStyles("ui/tema.css", src);
    expect(e!.tipo).toBe("estilos");
    expect(e!.nombre).toBe("tema.css");
    expect(e!.descripcion).toContain("Tema principal del dashboard");
    expect(e!.descripcion).toContain("regla");
    expect(e!.descripcion).toContain("variables");
    expect(e!.contenido).toBe(src); // contenido = crudo (base del hash)
  });

  it("SCSS con comentario de línea y variable $", () => {
    const [e] = extractStyles("styles/_vars.scss", "// Paleta\n$rojo: #f00;\n.x { color: $rojo; }");
    expect(e!.tipo).toBe("estilos");
    expect(e!.descripcion).toContain("Paleta");
    expect(e!.descripcion).toContain("variables");
  });

  it("extensiones .sass/.less/.styl también cuentan", () => {
    expect(extractStyles("a.sass", ".x\n  color: red")[0]!.tipo).toBe("estilos");
    expect(extractStyles("b.less", "@c: #fff; .x { color: @c; }")[0]!.tipo).toBe("estilos");
    expect(extractStyles("c.styl", ".x\n  color red")[0]!.tipo).toBe("estilos");
  });

  it("no es hoja de estilos → vacío", () => {
    expect(extractStyles("app.ts", ".x{}")).toEqual([]);
  });

  it("detalles extrae selectores de clase, custom properties y @keyframes", () => {
    const src = [
      ":root { --color-primary: #00c2b5; --gap: 8px; }",
      ".btn-primary { color: var(--color-primary); }",
      ".zebra-table tr {}",
      "@keyframes fadeIn { from {} to {} }",
    ].join("\n");
    const d = extractStyles("ui/app.css", src)[0]!.detalles as Record<string, string[]>;
    expect(d.clases).toEqual(expect.arrayContaining(["btn-primary", "zebra-table"]));
    expect(d.variables).toEqual(expect.arrayContaining(["--color-primary", "--gap"]));
    expect(d.keyframes).toEqual(["fadeIn"]);
  });
});
