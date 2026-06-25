import { describe, it, expect } from "vitest";
import { extractExecutable } from "./extract_executable.js";

describe("extractExecutable", () => {
  it(".sh: una entrada tipo ejecutable con shebang y comentario en la descripción", () => {
    const src = "#!/bin/bash\n# Despliega el indexador a producción\nset -e\npnpm build";
    const [e] = extractExecutable("scripts/deploy.sh", src);
    expect(e!.tipo).toBe("ejecutable");
    expect(e!.nombre).toBe("deploy.sh");
    expect(e!.descripcion).toContain("#!/bin/bash");
    expect(e!.descripcion).toContain("Despliega");
    expect(e!.contenido).toBe(src); // contenido = crudo (base del hash)
  });

  it("archivo sin extensión con shebang de shell → ejecutable", () => {
    const src = "#!/usr/bin/env bash\necho hola";
    const [e] = extractExecutable("bin/deploy", src);
    expect(e!.tipo).toBe("ejecutable");
  });

  it(".cmd también cuenta como ejecutable", () => {
    const [e] = extractExecutable("run.cmd", "@echo off\nnpm start");
    expect(e!.tipo).toBe("ejecutable");
  });

  it("archivo sin extensión y sin shebang no es ejecutable", () => {
    expect(extractExecutable("LICENSE", "MIT License\n...")).toEqual([]);
  });
});
