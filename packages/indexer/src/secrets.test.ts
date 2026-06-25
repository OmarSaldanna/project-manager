import { describe, it, expect } from "vitest";
import { maskSecrets } from "./secrets.js";

describe("maskSecrets", () => {
  it("enmascara valores de claves sensibles (JSON/asignación)", () => {
    const out = maskSecrets('{ "UserName":"user@example.com", "UserPassword":"S3cr3t-Demo!" }');
    expect(out).toContain("user@example.com"); // no sensible: se conserva
    expect(out).not.toContain("S3cr3t-Demo!");
    expect(out).toContain("«oculto»");
  });

  it("enmascara ENV en mayúsculas y llaves AWS", () => {
    const out = maskSecrets("AWS_SECRET_KEY=abc123def\nID=AKIAIOSFODNN7EXAMPLE");
    expect(out).not.toContain("abc123def");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("no toca código sin secretos", () => {
    const src = "def f(a, b):\n    return a + b";
    expect(maskSecrets(src)).toBe(src);
  });
});
