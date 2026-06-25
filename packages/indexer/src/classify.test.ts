import { describe, it, expect } from "vitest";
import {
  configTipo,
  isExecutable,
  isIndexableByName,
  isQueryFile,
  isStyleFile,
  needsShebangSniff,
} from "./classify.js";

describe("configTipo", () => {
  it("mapea extensiones y nombres a su tipo", () => {
    expect(configTipo("tsconfig.json")).toBe("json");
    expect(configTipo("ci.yaml")).toBe("yaml");
    expect(configTipo("ci.yml")).toBe("yaml");
    expect(configTipo("app.toml")).toBe("config");
    expect(configTipo("web.config")).toBe("config");
    expect(configTipo(".gitignore")).toBe("config");
    expect(configTipo(".env.example")).toBe("config");
  });
  it("excluye lockfiles y .env", () => {
    expect(configTipo("pnpm-lock.yaml")).toBeNull();
    expect(configTipo("package-lock.json")).toBeNull();
    expect(configTipo(".env")).toBeNull();
  });
  it("null para código y otros", () => {
    expect(configTipo("app.ts")).toBeNull();
    expect(configTipo("foto.png")).toBeNull();
  });
});

describe("isExecutable", () => {
  it("por extensión (.sh/.cmd/.bat)", () => {
    expect(isExecutable("deploy.sh")).toBe(true);
    expect(isExecutable("run.cmd")).toBe(true);
    expect(isExecutable("run.bat")).toBe(true);
  });
  it("sin extensión solo con shebang de shell", () => {
    expect(isExecutable("bin/deploy", "#!/bin/bash\necho")).toBe(true);
    expect(isExecutable("bin/deploy", "no shebang")).toBe(false);
    expect(isExecutable("LICENSE", "MIT")).toBe(false);
  });
  it("código no es ejecutable", () => {
    expect(isExecutable("main.py")).toBe(false);
  });
});

describe("isQueryFile", () => {
  it("familia SQL común", () => {
    expect(isQueryFile("schema.sql")).toBe(true);
    expect(isQueryFile("q.psql")).toBe(true);
    expect(isQueryFile("q.pgsql")).toBe(true);
    expect(isQueryFile("migrate.ddl")).toBe(true);
    expect(isQueryFile("seed.dml")).toBe(true);
    expect(isQueryFile("app.ts")).toBe(false);
  });
});

describe("isStyleFile", () => {
  it("css y preprocesadores", () => {
    expect(isStyleFile("ui/app.css")).toBe(true);
    expect(isStyleFile("ui/_vars.scss")).toBe(true);
    expect(isStyleFile("a.sass")).toBe(true);
    expect(isStyleFile("a.less")).toBe(true);
    expect(isStyleFile("a.styl")).toBe(true);
    expect(isStyleFile("a.pcss")).toBe(true);
    expect(isStyleFile("app.ts")).toBe(false);
  });
});

describe("isIndexableByName / needsShebangSniff", () => {
  it("indexa código, doc, html, config, sql, estilos y ejecutables por extensión", () => {
    expect(isIndexableByName("src/app.ts")).toBe(true);
    expect(isIndexableByName("src/app.mts")).toBe(true); // antes se perdía
    expect(isIndexableByName("README.md")).toBe(true);
    expect(isIndexableByName("reporte.html")).toBe(true);
    expect(isIndexableByName("tsconfig.json")).toBe(true);
    expect(isIndexableByName("schema.sql")).toBe(true);
    expect(isIndexableByName("ui/app.scss")).toBe(true);
    expect(isIndexableByName("deploy.sh")).toBe(true);
  });
  it("no indexa binarios, lockfiles ni .env por nombre", () => {
    expect(isIndexableByName("foto.png")).toBe(false);
    expect(isIndexableByName("pnpm-lock.yaml")).toBe(false);
    expect(isIndexableByName(".env")).toBe(false);
  });
  it("sniff de shebang solo para candidatos sin extensión no indexables por nombre", () => {
    expect(needsShebangSniff("bin/deploy")).toBe(true);
    expect(needsShebangSniff("deploy.sh")).toBe(false); // ya indexable por nombre
    expect(needsShebangSniff("foto.png")).toBe(false); // tiene extensión
  });
});
