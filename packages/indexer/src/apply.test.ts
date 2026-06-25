import { describe, it, expect } from "vitest";
import type { Embedder, PmRepo } from "@pm-ai/core";
import { applyFile, type ApplyDeps } from "./apply.js";
import { SignatureDescriber } from "./describe.js";

interface FakeRow {
  contentHash: string;
  tipo: string;
  ruta: string;
  deleted: boolean;
  cuerpo: string | null;
  librerias: string[];
  dependencias: string[];
  firma: string | null;
  // Trazabilidad del cambio, tal como se persistió en el último upsert.
  cambio: string | null;
  hashAnterior: string | null;
  magnitudCambio: string | null;
}

/** Repo en memoria que imita la semántica SCD Type 2 de los RPCs de Postgres. */
class FakeRepo {
  current = new Map<string, FakeRow>();
  embedCalls = 0;

  async currentEntitiesForFile(_p: string, ruta: string) {
    return [...this.current.entries()]
      .filter(([, v]) => v.ruta === ruta && !v.deleted)
      .map(([entityId, v]) => ({
        entityId,
        contentHash: v.contentHash,
        tipo: v.tipo as never,
        cuerpo: v.cuerpo,
        firma: v.firma,
        librerias: v.librerias,
        dependencias: v.dependencias,
      }));
  }
  async upsertVersion(v: {
    entityId: string;
    contentHash: string;
    tipo: string;
    ruta: string;
    cuerpo: string | null;
    librerias?: string[];
    dependencias?: string[];
    detalles?: Record<string, unknown> | null;
    cambio: string | null;
    hashAnterior: string | null;
    magnitudCambio: string | null;
  }) {
    const prev = this.current.get(v.entityId);
    this.current.set(v.entityId, {
      contentHash: v.contentHash,
      tipo: v.tipo,
      ruta: v.ruta,
      deleted: false,
      cuerpo: v.cuerpo,
      librerias: v.librerias ?? [],
      dependencias: v.dependencias ?? [],
      firma: typeof v.detalles?.firma === "string" ? (v.detalles.firma as string) : null,
      cambio: v.cambio,
      hashAnterior: v.hashAnterior,
      magnitudCambio: v.magnitudCambio,
    });
    return prev && !prev.deleted ? "versioned" : "created";
  }
  async tombstone(entityId: string) {
    const prev = this.current.get(entityId);
    if (!prev || prev.deleted) return false;
    this.current.set(entityId, { ...prev, deleted: true });
    return true;
  }
}

class CountingEmbedder implements Embedder {
  dim = 3;
  calls = 0;
  async embed(textos: string[]) {
    this.calls += textos.length;
    return textos.map(() => [0.1, 0.2, 0.3]);
  }
}

function makeDeps() {
  const repo = new FakeRepo();
  const embedder = new CountingEmbedder();
  const deps: ApplyDeps = {
    repo: repo as unknown as PmRepo,
    embedder,
    describer: new SignatureDescriber(),
  };
  return { repo, embedder, deps };
}

const PY_V1 = "import db\ndef crear_tabla():\n    return db.run('CREATE TABLE t (a int)')";
const PY_V2 = "import db\ndef crear_tabla():\n    return db.run('CREATE TABLE t (a int, b text)')";

describe("applyFile (orquestación end-to-end con fakes)", () => {
  it("primer mapeo: alta de la función", async () => {
    const { deps, embedder } = makeDeps();
    const s = await applyFile("p", "c1", "2026-06-16T10:00:00Z", { ruta: "db.py", contenido: PY_V1 }, deps);
    expect(s.created).toBe(1);
    expect(s.versioned).toBe(0);
    expect(embedder.calls).toBe(1);
  });

  it("re-indexar el mismo commit es idempotente y NO re-embebe (gate de costo)", async () => {
    const { deps, embedder } = makeDeps();
    await applyFile("p", "c1", "2026-06-16T10:00:00Z", { ruta: "db.py", contenido: PY_V1 }, deps);
    const callsTrasAlta = embedder.calls;
    const s = await applyFile("p", "c1", "2026-06-16T10:00:00Z", { ruta: "db.py", contenido: PY_V1 }, deps);
    expect(s.unchanged).toBe(1);
    expect(s.created + s.versioned).toBe(0);
    expect(embedder.calls).toBe(callsTrasAlta); // no hubo nuevo embedding
  });

  it("cambia la query: nueva versión (y sí re-embebe)", async () => {
    const { deps, embedder } = makeDeps();
    await applyFile("p", "c1", "2026-06-16T10:00:00Z", { ruta: "db.py", contenido: PY_V1 }, deps);
    const before = embedder.calls;
    const s = await applyFile("p", "c2", "2026-06-17T10:00:00Z", { ruta: "db.py", contenido: PY_V2 }, deps);
    expect(s.versioned).toBe(1);
    expect(s.created).toBe(0);
    expect(embedder.calls).toBe(before + 1);
  });

  it("alta NO lleva changelog; la nueva versión registra hash_anterior, magnitud y cambio", async () => {
    const { deps, repo } = makeDeps();
    await applyFile("p", "c1", "2026-06-16T10:00:00Z", { ruta: "db.py", contenido: PY_V1 }, deps);
    const id = [...repo.current.keys()][0]!;
    const alta = repo.current.get(id)!;
    expect(alta.cambio).toBeNull();
    expect(alta.hashAnterior).toBeNull();
    expect(alta.magnitudCambio).toBeNull();
    const hashV1 = alta.contentHash;

    // Cambia el cuerpo (una query): se versiona y se traza el delta vs. la versión anterior.
    await applyFile("p", "c2", "2026-06-17T10:00:00Z", { ruta: "db.py", contenido: PY_V2 }, deps);
    const v2 = repo.current.get(id)!;
    expect(v2.hashAnterior).toBe(hashV1); // invariante: ancla al content_hash del predecesor
    expect(v2.magnitudCambio).toBe("logica"); // cambió una línea con código, no la firma
    expect(v2.cambio).toBeTruthy();
  });

  it("reclasificar funcion → endpoint re-versiona aunque el cuerpo no cambie", async () => {
    const { deps, repo } = makeDeps();
    const cuerpo = "def listar():\n    return []";
    await applyFile("p", "c1", "2026-06-16T10:00:00Z", { ruta: "api.py", contenido: cuerpo }, deps);
    const id = [...repo.current.keys()][0]!;
    expect(repo.current.get(id)!.tipo).toBe("funcion");

    // Mismo cuerpo del símbolo, ahora con decorador de routing (la firma no cambia).
    const conRuta = `@app.get('/x')\n${cuerpo}`;
    const s = await applyFile("p", "c2", "2026-06-17T10:00:00Z", { ruta: "api.py", contenido: conRuta }, deps);
    expect(s.versioned).toBe(1);
    expect(s.unchanged).toBe(0);
    expect(repo.current.get(id)!.tipo).toBe("endpoint");
  });

  it("eliminar la función del archivo la tumba (tombstone)", async () => {
    const { deps } = makeDeps();
    await applyFile("p", "c1", "2026-06-16T10:00:00Z", { ruta: "db.py", contenido: PY_V1 }, deps);
    const s = await applyFile("p", "c3", "2026-06-18T10:00:00Z", { ruta: "db.py", contenido: "import db\n" }, deps);
    expect(s.tombstoned).toBe(1);
  });

  it("archivo eliminado (contenido null) tumba todo lo del archivo", async () => {
    const { deps } = makeDeps();
    await applyFile("p", "c1", "2026-06-16T10:00:00Z", { ruta: "db.py", contenido: PY_V1 }, deps);
    const s = await applyFile("p", "c4", "2026-06-19T10:00:00Z", { ruta: "db.py", contenido: null }, deps);
    expect(s.tombstoned).toBe(1);
  });

  it("HTML ambiguo: no se indexa, se reporta pendiente y NO tumba lo existente", async () => {
    const { deps, embedder } = makeDeps();
    const s = await applyFile(
      "p",
      "c1",
      "2026-06-16T10:00:00Z",
      { ruta: "data.html", contenido: "<table><tr><td>1</td></tr></table>" },
      deps,
    );
    expect(s.pendiente).toBeDefined();
    expect(s.created + s.versioned + s.tombstoned).toBe(0);
    expect(embedder.calls).toBe(0); // ni describe ni embed
  });

  it("HTML con override del dev sí se indexa con el tipo forzado", async () => {
    const { deps } = makeDeps();
    deps.htmlOverrides = { "data.html": "reporte" };
    const s = await applyFile(
      "p",
      "c1",
      "2026-06-16T10:00:00Z",
      { ruta: "data.html", contenido: "<body><p>Ventas</p></body>" },
      deps,
    );
    expect(s.pendiente).toBeUndefined();
    expect(s.created).toBe(1);
  });
});
