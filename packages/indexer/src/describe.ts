import type { IndexEntry } from "@pm-ai/core";
import { maskSecrets } from "./secrets.js";
import { plantillaCambio, type Magnitud } from "./magnitud.js";

/**
 * Docstring/comentario de cabecera del autor — fuente de verdad autoritativa. Si existe, se usa
 * tal cual en vez de re-generar con el LLM (evita errores como "40 vs 38 min") y ahorra tokens.
 * Solo para funciones/endpoints; conservador (Python triple-comilla o bloque /** *​/ inicial).
 */
export function authoritativeDoc(entry: IndexEntry): string | null {
  if (entry.tipo !== "funcion" && entry.tipo !== "endpoint") return null;
  const body = entry.contenido;
  const py = /^\s*(?:async\s+)?def\s[^\n]*\n\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/.exec(body);
  if (py) {
    const doc = (py[1] ?? py[2] ?? "").trim();
    if (doc) return limpiar(doc);
  }
  const js = /^\s*\/\*\*?([\s\S]*?)\*\//.exec(body);
  if (js?.[1]) {
    const doc = js[1].replace(/^\s*\*+/gm, "").trim();
    if (doc) return limpiar(doc);
  }
  return null;
}

/** Colapsa whitespace y recorta a ~2 oraciones / 240 chars. */
function limpiar(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 240 ? `${t.slice(0, 240).trimEnd()}…` : t;
}

/** Instrucción de descripción según el tipo de entrada (código / ejecutable / config). */
function instruccionPorTipo(entry: IndexEntry): string {
  switch (entry.tipo) {
    case "ejecutable":
      return (
        "Resume en máximo 2 oraciones en español qué hace este script y qué ejecuta " +
        "(comandos/pasos principales). Sé conciso y técnico, sin preámbulos."
      );
    case "json":
    case "yaml":
    case "config":
      return (
        "Genera un mini manifiesto en español (máximo 3 oraciones) que describa el propósito " +
        "de este archivo de configuración y sus secciones relevantes. Menciona los valores " +
        "concretos más significativos (URLs, bases de datos, nombres de servicios/tablas/listas) " +
        "tal como aparecen. Sé conciso y técnico, sin preámbulos."
      );
    case "endpoint":
      return (
        "Resume en máximo 2 oraciones en español PARA QUÉ sirve este endpoint en términos de " +
        "negocio/usuario (qué resuelve y su efecto observable), no solo el mecanismo. Incluye " +
        "ruta/método y qué requiere. Sé conciso y técnico, sin preámbulos."
      );
    case "query":
      return (
        "Describe en un párrafo breve (máximo 3 oraciones) en español qué hacen las queries " +
        "de este archivo SQL (qué tablas/objetos tocan y con qué fin). Sé conciso y técnico, " +
        "sin preámbulos."
      );
    case "estilos":
      return (
        "Describe en un párrafo breve (máximo 3 oraciones) en español qué estilos define este " +
        "archivo (componentes/temas/variables o utilidades que aporta). Sé conciso y técnico, " +
        "sin preámbulos."
      );
    default:
      return (
        "Resume en máximo 2 oraciones en español PARA QUÉ sirve esta función en términos de " +
        "negocio/usuario (qué resuelve y su efecto observable), no solo el mecanismo, y qué " +
        "requiere. Sé conciso y técnico, sin preámbulos."
      );
  }
}

/**
 * Genera la descripción ≤2 oraciones de un símbolo de código (prompt.md §6).
 * Solo se invoca para entradas que van a `toUpsert` (gate de costo): nunca se
 * re-describe lo que no cambió.
 */
export interface Describer {
  describe(entry: IndexEntry): Promise<string>;
  /**
   * Resume QUÉ cambió entre la versión anterior (`prevCuerpo`) y la nueva (`next`), para el
   * changelog por entidad (`cambio`). Solo se invoca en cambios no-cosméticos con cuerpo previo
   * disponible; los cosméticos y el caso sin cuerpo usan `plantillaCambio` directamente.
   */
  describeChange(prevCuerpo: string, next: IndexEntry, magnitud: Magnitud): Promise<string>;
}

/** Fallback sin LLM: docstring del autor si existe, si no la firma. */
export class SignatureDescriber implements Describer {
  async describe(entry: IndexEntry): Promise<string> {
    return authoritativeDoc(entry) ?? entry.descripcion; // doc autoritativo > firma
  }

  async describeChange(_prevCuerpo: string, _next: IndexEntry, magnitud: Magnitud): Promise<string> {
    return plantillaCambio(magnitud); // sin LLM: texto determinista por magnitud
  }
}

/** Implementación contra un chat compatible OpenAI, vía la capa proxy (D11). */
export class LlmDescriber implements Describer {
  constructor(
    private readonly cfg: { url: string; apiKey: string; model: string },
  ) {}

  async describe(entry: IndexEntry): Promise<string> {
    // El docstring del autor es autoritativo: úsalo y evita la llamada al LLM (cero costo).
    const doc = authoritativeDoc(entry);
    if (doc) return doc;
    // El contenido sale a un proveedor externo: enmascara secretos antes de enviarlo. Se ACOTA
    // a ~16k chars (~4k tokens): un símbolo enorme (p. ej. JS generado/minificado, o una función
    // de cientos de líneas) reventaba el contexto del LLM (error 400 context_length_exceeded) y
    // abortaba toda la indexación. Para un resumen ≤2 oraciones, la cabeza del cuerpo basta.
    const cuerpo = maskSecrets(entry.contenido);
    const recorte = cuerpo.length > 16_000 ? `${cuerpo.slice(0, 16_000)}\n…[contenido truncado]` : cuerpo;
    const prompt = `${instruccionPorTipo(entry)}\n\n` +
      `Archivo: ${entry.ruta}\nNombre: ${entry.nombre}\n\n${recorte}`;
    const res = await fetch(this.cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({
        model: this.cfg.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`Describer ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message.content.trim() ?? entry.descripcion;
  }

  async describeChange(prevCuerpo: string, next: IndexEntry, magnitud: Magnitud): Promise<string> {
    // Ambos cuerpos salen a un proveedor externo: enmascarar secretos y acotar (~8k c/u, ~16k
    // total) por el mismo motivo que `describe`. v1 pasa los dos cuerpos; el modelo infiere el
    // delta (optimización futura: pasar solo el hunk del diff para ahorrar tokens).
    const cap = (s: string) =>
      s.length > 8_000 ? `${maskSecrets(s).slice(0, 8_000)}\n…[truncado]` : maskSecrets(s);
    const prompt =
      "Eres un asistente que resume cambios de código para un índice navegable. Dado el cuerpo " +
      "ANTERIOR y el NUEVO de la misma entidad, describe en español en 1-2 frases QUÉ cambió y su " +
      "efecto observable. No reproduzcas el código ni inventes intención que no se deduzca del " +
      `diff. Si el cambio es solo cosmético, dilo.\n\n` +
      `Entidad: ${next.tipo} ${next.nombre} (${next.ruta})\nMagnitud estimada: ${magnitud}\n\n` +
      `===== ANTERIOR =====\n${cap(prevCuerpo)}\n\n===== NUEVO =====\n${cap(next.contenido)}`;
    const res = await fetch(this.cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({
        model: this.cfg.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`describeChange ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message.content.trim() ?? plantillaCambio(magnitud);
  }
}
