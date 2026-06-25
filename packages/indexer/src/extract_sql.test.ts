import { describe, it, expect } from "vitest";
import { extractSql } from "./extract_sql.js";

describe("extractSql", () => {
  it("una entrada tipo query con resumen (comentario + sentencias) en la descripción", () => {
    const src = [
      "-- Reporte de ventas por mes",
      "SELECT mes, sum(total) FROM ventas GROUP BY mes;",
    ].join("\n");
    const [e] = extractSql("queries/ventas.sql", src);
    expect(e!.tipo).toBe("query");
    expect(e!.nombre).toBe("ventas.sql");
    expect(e!.descripcion).toContain("Reporte de ventas por mes");
    expect(e!.descripcion).toContain("SELECT");
    expect(e!.contenido).toBe(src); // contenido = crudo (base del hash)
  });

  it("reconoce DDL (CREATE/ALTER) además de DML", () => {
    const [e] = extractSql("schema.psql", "CREATE TABLE t (id int);\nALTER TABLE t ADD col text;");
    expect(e!.tipo).toBe("query");
    expect(e!.descripcion).toContain("CREATE");
    expect(e!.descripcion).toContain("ALTER");
  });

  it("extensiones .pgsql/.ddl/.dml también cuentan", () => {
    expect(extractSql("a.pgsql", "select 1")[0]!.tipo).toBe("query");
    expect(extractSql("b.ddl", "create table x()")[0]!.tipo).toBe("query");
  });

  it("no es SQL → vacío", () => {
    expect(extractSql("notas.txt", "select 1")).toEqual([]);
  });
});
