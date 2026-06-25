import { describe, it, expect } from "vitest";
import { reconcileFile, type ExistingEntity } from "./reconcile.js";
import { entityId, contentHash, type IndexEntry } from "@pm-ai/core";

const P = "atenea";
const RUTA = "src/db.py";

function fn(nombre: string, contenido: string): IndexEntry {
  return {
    tipo: "funcion",
    nombre,
    descripcion: `desc de ${nombre}`,
    contenido,
    librerias: [],
    dependencias: [],
    archivo: "db.py",
    ruta: RUTA,
  };
}
const existing = (e: IndexEntry): ExistingEntity => ({
  entityId: entityId(P, e.ruta, e.nombre),
  contentHash: contentHash(e.contenido),
});

describe("reconcileFile", () => {
  it("alta: entidad nueva va a toUpsert", () => {
    const plan = reconcileFile(P, [fn("crear_tabla", "CREATE TABLE t")], []);
    expect(plan.toUpsert).toHaveLength(1);
    expect(plan.toTombstone).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(0);
  });

  it("idempotencia: re-indexar lo mismo no produce cambios", () => {
    const e = fn("crear_tabla", "CREATE TABLE t");
    const plan = reconcileFile(P, [e], [existing(e)]);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.toUpsert).toHaveLength(0);
    expect(plan.toTombstone).toHaveLength(0);
  });

  it("nueva versión: cambia el cuerpo → toUpsert (gate de content_hash)", () => {
    const before = fn("crear_tabla", "CREATE TABLE t (a int)");
    const after = fn("crear_tabla", "CREATE TABLE t (a int, b text)");
    const plan = reconcileFile(P, [after], [existing(before)]);
    expect(plan.toUpsert).toHaveLength(1);
    expect(plan.unchanged).toHaveLength(0);
    // misma identidad lógica → será una nueva versión, no un alta distinta
    expect(plan.toUpsert[0]!.entityId).toBe(existing(before).entityId);
  });

  it("borrado: entidad vigente ausente del archivo → tombstone", () => {
    const vieja = fn("borrar_tabla", "DROP TABLE t");
    const plan = reconcileFile(P, [], [existing(vieja)]);
    expect(plan.toTombstone).toEqual([existing(vieja).entityId]);
  });

  it("rename = borrado + alta (D9): nombre nuevo entra, viejo se tumba", () => {
    const vieja = fn("crear_tabla", "CREATE TABLE t");
    const nueva = fn("crear_tablon", "CREATE TABLE t");
    const plan = reconcileFile(P, [nueva], [existing(vieja)]);
    expect(plan.toUpsert.map((p) => p.nombre)).toEqual(["crear_tablon"]);
    expect(plan.toTombstone).toEqual([existing(vieja).entityId]);
  });

  it("mezcla: alta + sin cambio + versión + borrado a la vez", () => {
    const a = fn("a", "v1");
    const b = fn("b", "v1");
    const cVieja = fn("c", "v1");
    const cNueva = fn("c", "v2");
    const d = fn("d", "v1");
    const plan = reconcileFile(P, [a, b, cNueva], [existing(b), existing(cVieja), existing(d)]);
    expect(plan.toUpsert.map((p) => p.nombre).sort()).toEqual(["a", "c"]);
    expect(plan.unchanged.map((p) => p.nombre)).toEqual(["b"]);
    expect(plan.toTombstone).toEqual([existing(d).entityId]);
  });
});
