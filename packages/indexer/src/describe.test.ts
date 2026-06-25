import { describe, it, expect } from "vitest";
import { authoritativeDoc, SignatureDescriber } from "./describe.js";
import type { IndexEntry } from "@pm-ai/core";

function entry(partial: Partial<IndexEntry>): IndexEntry {
  return {
    tipo: "funcion",
    nombre: "f",
    descripcion: "def f():",
    contenido: "def f():\n    pass",
    librerias: [],
    dependencias: [],
    archivo: "a.py",
    ruta: "a.py",
    ...partial,
  };
}

describe("authoritativeDoc", () => {
  it("Python: extrae el docstring del autor como fuente de verdad", () => {
    const e = entry({
      contenido:
        'def _acme_login(x):\n    """Autenticación contra Acme. Renueva la sesión si tiene >38 min."""\n    return x',
    });
    expect(authoritativeDoc(e)).toBe(
      "Autenticación contra Acme. Renueva la sesión si tiene >38 min.",
    );
  });

  it("sin docstring → null (cae a la firma / LLM)", () => {
    expect(authoritativeDoc(entry({}))).toBeNull();
  });

  it("solo aplica a funcion/endpoint, no a config", () => {
    expect(authoritativeDoc(entry({ tipo: "config", contenido: '"""x"""' }))).toBeNull();
  });
});

describe("SignatureDescriber", () => {
  it("prefiere el docstring del autor sobre la firma", async () => {
    const d = new SignatureDescriber();
    const e = entry({ contenido: 'def f():\n    """Hace algo importante."""\n    pass' });
    expect(await d.describe(e)).toBe("Hace algo importante.");
  });
});
