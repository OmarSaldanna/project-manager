import { describe, it, expect } from "vitest";
import { ROW_COLS } from "./db.js";

describe("ROW_COLS (proyección de las tools)", () => {
  it("NUNCA incluye el vector embedding (ruido caro para el agente)", () => {
    expect(ROW_COLS).not.toContain("embedding");
  });

  it("incluye las columnas que el agente sí necesita", () => {
    for (const col of ["entity_id", "tipo", "nombre", "descripcion", "ruta", "commit_sha"]) {
      expect(ROW_COLS).toContain(col);
    }
  });
});
