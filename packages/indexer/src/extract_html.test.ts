import { describe, it, expect } from "vitest";
import { classifyHtml, resolveHtmlTipo, extractHtml } from "./extract_html.js";

describe("classifyHtml", () => {
  it("nombres de página típicos → pagina", () => {
    expect(classifyHtml("public/404.html", "<h1>No encontrado</h1>")).toBe("pagina");
    expect(classifyHtml("landing.html", "<h1>Bienvenido</h1>")).toBe("pagina");
    expect(classifyHtml("gantt/index.html", "<div id=app></div>")).toBe("pagina");
  });

  it("señal de UI en el contenido → pagina", () => {
    expect(classifyHtml("x.html", "<nav><a href='/'>home</a></nav>")).toBe("pagina");
    expect(classifyHtml("y.html", "<meta name='viewport' content='width'>")).toBe("pagina");
  });

  it("nombre/dir/contenido de reporte → reporte", () => {
    expect(classifyHtml("reportes/ventas.html", "<table>...</table>")).toBe("reporte");
    expect(classifyHtml("reporte_2026-06-22.html", "<table>")).toBe("reporte");
    expect(classifyHtml("z.html", "<meta name='generator' content='jsPDF'>")).toBe("reporte");
  });

  it("sin señales claras, o con ambas → ambiguo", () => {
    expect(classifyHtml("data.html", "<table><tr><td>1</td></tr></table>")).toBe("ambiguo");
    // 'dashboard' (página) dentro de 'reports/' (reporte) → señales en conflicto
    expect(classifyHtml("reports/dashboard.html", "<table>")).toBe("ambiguo");
  });
});

describe("resolveHtmlTipo (override del dev gana)", () => {
  it("el override fuerza el tipo aunque la heurística diga otra cosa", () => {
    expect(resolveHtmlTipo("data.html", "<table>", { "data.html": "reporte" })).toBe("reporte");
    expect(resolveHtmlTipo("404.html", "<h1>x</h1>", { "404.html": "reporte" })).toBe("reporte");
  });
  it("sin override aplica la heurística", () => {
    expect(resolveHtmlTipo("data.html", "<table>")).toBe("ambiguo");
  });
});

describe("extractHtml", () => {
  it("emite una entidad del tipo indicado, con HTML crudo en contenido y texto en descripción", () => {
    const html = "<title>Reporte Q2</title><body><p>Ventas 100</p></body>";
    const [e] = extractHtml("reportes/q2.html", html, "reporte");
    expect(e!.tipo).toBe("reporte");
    expect(e!.nombre).toBe("Reporte Q2");
    expect(e!.contenido).toBe(html);
    expect(e!.descripcion).toContain("Ventas 100");

    const [p] = extractHtml("404.html", "<body>No existe</body>", "pagina");
    expect(p!.tipo).toBe("pagina");
  });
});
