import { describe, it, expect } from "vitest";
import { extractCode, languageForFile } from "./extract_code.js";

describe("languageForFile", () => {
  it("mapea extensiones a lenguajes", () => {
    expect(languageForFile("src/db.py")).toBe("python");
    expect(languageForFile("src/app.ts")).toBe("typescript");
    expect(languageForFile("ui/Boton.tsx")).toBe("tsx");
    expect(languageForFile("Db.cs")).toBe("csharp");
    expect(languageForFile("notas.txt")).toBeNull();
  });
});

describe("extractCode (Python)", () => {
  it("extrae funciones, librerías y dependencias", async () => {
    const src = [
      "import os",
      "from db import conn",
      "def crear_tabla(a, b):",
      "    return conn.execute('CREATE TABLE t')",
      "def borrar():",
      "    return conn.drop()",
    ].join("\n");
    const entries = await extractCode("src/db.py", src);

    expect(entries.map((e) => e.nombre).sort()).toEqual(["borrar", "crear_tabla"]);
    const crear = entries.find((e) => e.nombre === "crear_tabla")!;
    expect(crear.tipo).toBe("funcion");
    expect(crear.librerias).toEqual(["os", "db"]);
    expect(crear.dependencias).toContain("conn.execute");
    expect(crear.contenido).toContain("CREATE TABLE t");
    // builtins como str/len/print no deben aparecer como dependencias (ruido).
    expect(crear.dependencias).not.toContain("str");
    expect(crear.dependencias).not.toContain("print");
    expect(crear.ruta).toBe("src/db.py");
    expect(crear.archivo).toBe("db.py");
  });
});

describe("extractCode (TypeScript)", () => {
  it("extrae funciones, métodos, arrow functions e imports", async () => {
    const src = [
      'import { conn } from "./db";',
      "export function crearTabla(a: string) { return conn.execute(a); }",
      "export const leer = (id: string) => conn.find(id);",
      "class S { metodo() { return 1; } }",
    ].join("\n");
    const entries = await extractCode("src/app.ts", src);
    expect(entries.map((e) => e.nombre).sort()).toEqual(["crearTabla", "leer", "metodo"]);
    expect(entries[0]!.librerias).toEqual(["./db"]);
  });
});

describe("extractCode (C#)", () => {
  it("extrae métodos y usings", async () => {
    const src = [
      "using System.Data;",
      "class Db {",
      "  public void CrearTabla() { conn.Execute(); }",
      "}",
    ].join("\n");
    const entries = await extractCode("Db.cs", src);
    expect(entries.map((e) => e.nombre)).toEqual(["CrearTabla"]);
    expect(entries[0]!.librerias).toEqual(["System.Data"]);
    expect(entries[0]!.dependencias).toContain("conn.Execute");
  });

  it("devuelve vacío para archivos no soportados", async () => {
    expect(await extractCode("notas.txt", "hola")).toEqual([]);
  });
});

describe("detalles y cobertura", () => {
  it("Python: firma, constantes de módulo (solo nombres) y cobertura", async () => {
    const src = [
      "import os",
      'TABLA_DEFAULT = "usuarios"',
      'ATHENA_DB = "db-crm"',
      "def crear_tabla(a, b):",
      "    return os.path.join(a, b)",
    ].join("\n");
    const entries = await extractCode("src/db.py", src);
    const crear = entries.find((e) => e.nombre === "crear_tabla")!;
    const d = crear.detalles as Record<string, unknown>;
    expect(d.firma).toBe("def crear_tabla(a, b):");
    expect(d.contenedor).toBeUndefined(); // top-level, no hay clase
    expect(d.constantes).toEqual(["TABLA_DEFAULT", "ATHENA_DB"]);
    expect(typeof crear.cobertura).toBe("number");
    expect(crear.cobertura!).toBeGreaterThan(0);
    expect(crear.cobertura!).toBeLessThanOrEqual(1);
  });

  it("TypeScript: contenedor (clase) y constante de módulo; excluye arrow functions", async () => {
    const src = [
      'const TABLA = "t";',
      "export const leer = (id: string) => id;",
      "class S { metodo() { return 1; } }",
    ].join("\n");
    const entries = await extractCode("src/app.ts", src);
    const metodo = entries.find((e) => e.nombre === "metodo")!;
    expect((metodo.detalles as Record<string, unknown>).contenedor).toBe("S");
    // `leer` es función (arrow), no debe aparecer como constante; `TABLA` sí.
    expect((metodo.detalles as Record<string, unknown>).constantes).toEqual(["TABLA"]);
  });
});

describe("clasificación de endpoints", () => {
  it("Python: decorador de routing → endpoint", async () => {
    const src = [
      "from fastapi import APIRouter",
      "router = APIRouter()",
      "@router.get('/users')",
      "def listar_usuarios():",
      "    return []",
      "def helper():",
      "    return 1",
    ].join("\n");
    const entries = await extractCode("app/api.py", src);
    expect(entries.find((e) => e.nombre === "listar_usuarios")!.tipo).toBe("endpoint");
    expect(entries.find((e) => e.nombre === "helper")!.tipo).toBe("funcion");
  });

  it("C#: atributo [HttpGet] → endpoint", async () => {
    const src = [
      "public class UsersController {",
      "  [HttpGet]",
      "  public IActionResult Get() { return Ok(); }",
      "  public void Helper() { }",
      "}",
    ].join("\n");
    const entries = await extractCode("Controllers/UsersController.cs", src);
    expect(entries.find((e) => e.nombre === "Get")!.tipo).toBe("endpoint");
    expect(entries.find((e) => e.nombre === "Helper")!.tipo).toBe("funcion");
  });

  it("TS NestJS: decorador @Get() → endpoint", async () => {
    const src = ["class C {", "  @Get()", "  findAll() { return []; }", "}"].join("\n");
    const entries = await extractCode("src/users.controller.ts", src);
    expect(entries[0]!.tipo).toBe("endpoint");
  });

  it("Next.js: handler con nombre de método HTTP en route.ts → endpoint (por ruta)", async () => {
    const src = "export async function GET() { return Response.json([]); }";
    const entries = await extractCode("app/api/users/route.ts", src);
    expect(entries[0]!.nombre).toBe("GET");
    expect(entries[0]!.tipo).toBe("endpoint");
  });
});
