import { describe, it, expect } from "vitest";
import { clasificarMagnitud, plantillaCambio, type VersionParaComparar } from "./magnitud.js";

/** Helper para armar una versión con defaults vacíos. */
function v(parcial: Partial<VersionParaComparar>): VersionParaComparar {
  return { firma: null, librerias: [], dependencias: [], cuerpo: null, ...parcial };
}

describe("clasificarMagnitud", () => {
  it("cosmético: solo cambian líneas de comentario (firma y deps iguales)", () => {
    const prev = v({ firma: "f()", cuerpo: "function f() {\n  // viejo\n  return x;\n}" });
    const next = v({ firma: "f()", cuerpo: "function f() {\n  // nuevo\n  return x;\n}" });
    expect(clasificarMagnitud(prev, next)).toBe("cosmetico");
  });

  it("cosmético: cambia un className (estilos JSX)", () => {
    const prev = v({ firma: "C()", cuerpo: "return <div className='a' />;" });
    const next = v({ firma: "C()", cuerpo: "return <div className='a dark:b' />;" });
    expect(clasificarMagnitud(prev, next)).toBe("cosmetico");
  });

  it("firma: cambia la firma pero el cuerpo no aporta líneas de lógica nuevas", () => {
    const prev = v({ firma: "f(a)", cuerpo: "return a;" });
    const next = v({ firma: "f(a, b)", cuerpo: "return a;" });
    expect(clasificarMagnitud(prev, next)).toBe("firma");
  });

  it("firma: cambian las dependencias aunque el cuerpo sea idéntico", () => {
    const prev = v({ firma: "f()", dependencias: ["x"], cuerpo: "return 1;" });
    const next = v({ firma: "f()", dependencias: ["x", "y"], cuerpo: "return 1;" });
    expect(clasificarMagnitud(prev, next)).toBe("firma");
  });

  it("lógica: cambia una línea con código (misma firma y deps)", () => {
    const prev = v({ firma: "f()", cuerpo: "return 1;" });
    const next = v({ firma: "f()", cuerpo: "return 2;" });
    expect(clasificarMagnitud(prev, next)).toBe("logica");
  });

  it("mixto: cambia la firma Y la lógica", () => {
    const prev = v({ firma: "f(a)", cuerpo: "return a;" });
    const next = v({ firma: "f(a, b)", cuerpo: "return a + b;" });
    expect(clasificarMagnitud(prev, next)).toBe("mixto");
  });

  it("sin cuerpo previo (post-migración): firma si cambió la firma, si no lógica", () => {
    expect(clasificarMagnitud(v({ firma: "f(a)" }), v({ firma: "f(a, b)", cuerpo: "x" }))).toBe("firma");
    expect(clasificarMagnitud(v({ firma: "f()" }), v({ firma: "f()", cuerpo: "x" }))).toBe("logica");
  });

  it("conservador: si el hash cambió pero no se detectan líneas, NO marca cosmético", () => {
    // Cuerpos con las mismas líneas (solo reordenadas) → no hay líneas añadidas/eliminadas.
    const prev = v({ firma: "f()", cuerpo: "a;\nb;" });
    const next = v({ firma: "f()", cuerpo: "b;\na;" });
    expect(clasificarMagnitud(prev, next)).toBe("logica");
  });
});

describe("plantillaCambio", () => {
  it("da un texto determinista por magnitud", () => {
    expect(plantillaCambio("cosmetico")).toMatch(/cosmétic/i);
    expect(plantillaCambio("firma")).toMatch(/firma|dependencias/i);
    expect(plantillaCambio("logica")).toMatch(/lógica|comportamiento/i);
    expect(plantillaCambio("mixto")).toMatch(/firma|lógica/i);
  });
});
