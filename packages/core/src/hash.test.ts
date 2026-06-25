import { describe, it, expect } from "vitest";
import { entityId, contentHash } from "./hash.js";

describe("entityId", () => {
  it("es estable ante el mismo (project, ruta, nombre)", () => {
    expect(entityId("p1", "src/db.py", "crear_tabla")).toBe(
      entityId("p1", "src/db.py", "crear_tabla"),
    );
  });

  it("cambia al cambiar la ruta (mover = borrado + alta, D9)", () => {
    expect(entityId("p1", "src/db.py", "crear_tabla")).not.toBe(
      entityId("p1", "src/models.py", "crear_tabla"),
    );
  });

  it("cambia al cambiar el nombre (rename = borrado + alta, D9)", () => {
    expect(entityId("p1", "src/db.py", "crear_tabla")).not.toBe(
      entityId("p1", "src/db.py", "crear_tablon"),
    );
  });

  it("aísla por proyecto", () => {
    expect(entityId("p1", "src/db.py", "crear_tabla")).not.toBe(
      entityId("p2", "src/db.py", "crear_tabla"),
    );
  });
});

describe("contentHash", () => {
  it("es igual si el cuerpo no cambia (gate de re-versionado)", () => {
    const body = "def crear_tabla():\n    db.execute('CREATE TABLE t (...)')";
    expect(contentHash(body)).toBe(contentHash(body));
  });

  it("ignora reformateos triviales de whitespace", () => {
    const a = "def crear_tabla():\n    db.execute('x')";
    const b = "def crear_tabla():\n        db.execute('x')   ";
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it("cambia cuando cambia el contenido real (la query cambió)", () => {
    const a = "def crear_tabla():\n    db.execute('CREATE TABLE t (a int)')";
    const b = "def crear_tabla():\n    db.execute('CREATE TABLE t (a int, b text)')";
    expect(contentHash(a)).not.toBe(contentHash(b));
  });
});
