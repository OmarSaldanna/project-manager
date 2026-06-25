import { createRequire } from "node:module";
import TS from "web-tree-sitter";
import type { IndexEntry, PmTipo } from "@pm-ai/core";

const require = createRequire(import.meta.url);
// web-tree-sitter@0.24 expone la clase Parser como default; Parser.Language existe tras init().
const Parser = (TS as unknown as { default?: unknown }).default ?? TS;

type AnyParser = {
  init(): Promise<void>;
  new (): { setLanguage(l: unknown): void; parse(s: string): { rootNode: TsNode } };
  Language: { load(path: string): Promise<TsLang> };
};
interface TsLang {
  query(s: string): TsQuery;
}
interface TsQuery {
  matches(n: TsNode): { captures: { name: string; node: TsNode }[] }[];
  captures(n: TsNode): { name: string; node: TsNode }[];
}
interface TsPoint {
  row: number;
  column: number;
}
interface TsNode {
  type: string;
  text: string;
  // web-tree-sitter expone estos en runtime; solo faltaba tiparlos. Se usan en tiempo de
  // indexado para derivar el contenedor (clase) y la cobertura — NO se persisten posiciones (D10).
  startPosition?: TsPoint;
  endPosition?: TsPoint;
  parent?: TsNode | null;
  childForFieldName?(field: string): TsNode | null;
}

interface LanguageSpec {
  wasm: string;
  /** Captura `@n` = nombre, `@d` = nodo de la definición completa. */
  defQuery: string;
  /** Captura `@i` (import completo) o `@s` (módulo) — ver importToLibs. */
  importQuery: string;
  importToLibs(captureName: string, text: string): string[];
  /** Captura `@c` = callee dentro de un cuerpo (dependencias internas). */
  callQuery: string;
  /** Captura `@k` = nombre de constante/variable de nivel módulo (opcional). */
  constQuery?: string;
}

const TS_LIKE = {
  defQuery:
    "(function_declaration name:(identifier) @n) @d " +
    "(method_definition name:(property_identifier) @n) @d " +
    "(variable_declarator name:(identifier) @n value:[(arrow_function)(function_expression)]) @d",
  importQuery: "(import_statement source:(string) @s) @i",
  importToLibs: (name: string, text: string): string[] =>
    name === "s" ? [text.replace(/^['"`]|['"`]$/g, "")] : [],
  callQuery: "(call_expression function:(_) @c)",
  // Declaraciones de nivel módulo (incluye `export const`). Las que sean funciones (arrow)
  // se filtran luego porque ya aparecen como entidad `funcion`. Se captura también el valor
  // (`@v`) para rescatar literales cortos (arreglos de rutas, umbrales) en el texto embebido.
  constQuery:
    "(program (lexical_declaration (variable_declarator name:(identifier) @k value: (_) @v))) " +
    "(program (variable_declaration (variable_declarator name:(identifier) @k value: (_) @v))) " +
    "(program (export_statement (lexical_declaration (variable_declarator name:(identifier) @k value: (_) @v)))) " +
    "(program (export_statement (variable_declaration (variable_declarator name:(identifier) @k value: (_) @v))))",
};

const SPECS: Record<string, LanguageSpec> = {
  python: {
    wasm: "tree-sitter-python.wasm",
    defQuery: "(function_definition name:(identifier) @n) @d",
    importQuery: "(import_statement) @i (import_from_statement) @i",
    importToLibs: (_name, text): string[] => {
      const from = /^\s*from\s+([.\w]+)/.exec(text);
      if (from) return [from[1]!];
      const imp = /^\s*import\s+([.\w]+)/.exec(text);
      return imp ? [imp[1]!] : [];
    },
    callQuery: "(call function:(_) @c)",
    constQuery: "(module (expression_statement (assignment left:(identifier) @k right:(_) @v)))",
  },
  typescript: { wasm: "tree-sitter-typescript.wasm", ...TS_LIKE },
  tsx: { wasm: "tree-sitter-tsx.wasm", ...TS_LIKE },
  javascript: { wasm: "tree-sitter-javascript.wasm", ...TS_LIKE },
  csharp: {
    wasm: "tree-sitter-c_sharp.wasm",
    defQuery: "(method_declaration name:(identifier) @n) @d",
    importQuery: "(using_directive) @i",
    importToLibs: (_name, text): string[] => {
      const m = /^\s*(?:global\s+)?using\s+(?:static\s+)?([.\w]+)\s*;?/.exec(text);
      return m ? [m[1]!] : [];
    },
    callQuery: "(invocation_expression function:(_) @c)",
    constQuery: "(field_declaration (variable_declaration (variable_declarator (identifier) @k)))",
  },
};

const EXT_TO_LANG: Record<string, keyof typeof SPECS> = {
  py: "python",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  cs: "csharp",
};

/** Devuelve la clave de lenguaje para una ruta, o null si no es código soportado. */
export function languageForFile(ruta: string): keyof typeof SPECS | null {
  const ext = ruta.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? null;
}

// --- Clasificación funcion vs endpoint (D4, "ambas combinadas") --------------

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

/** Señal por ruta: el archivo vive donde se exponen rutas de API. */
function endpointPathHint(ruta: string): boolean {
  return (
    /(^|\/)(controllers?|routes?|endpoints?)(\/|$)/i.test(ruta) ||
    /(^|\/)(pages\/)?api\//i.test(ruta) ||
    /(^|\/)route\.[tj]sx?$/i.test(ruta)
  );
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Señal por código: decorador/atributo de routing inmediatamente antes de la
 * función `nombre` (ventana acotada, tolerante a que tree-sitter no incluya el
 * decorador en el nodo de definición). Best-effort v1.
 */
function endpointCodeHint(key: string, source: string, nombre: string): boolean {
  const n = escapeRe(nombre);
  // El lookahead negativo impide que la ventana "salte" por encima de la definición
  // anterior hasta un símbolo posterior (en Python otro `def`; en C#/TS el `}` de cierre
  // del cuerpo previo), que producía falsos positivos.
  if (key === "python") {
    return new RegExp(
      `@[\\w.]+\\.(get|post|put|delete|patch|route|websocket|api_route)\\b` +
        `(?:(?!\\bdef\\b)[\\s\\S]){0,400}?\\bdef\\s+${n}\\b`,
      "i",
    ).test(source);
  }
  if (key === "csharp") {
    return new RegExp(
      `\\[\\s*(Http(Get|Post|Put|Delete|Patch|Head|Options)|Route)\\b` +
        `(?:(?!\\})[\\s\\S]){0,400}?\\b${n}\\s*\\(`,
      "i",
    ).test(source);
  }
  // typescript / tsx / javascript: decoradores estilo NestJS.
  return new RegExp(
    `@(Get|Post|Put|Delete|Patch|Options|Head|All|Sse)\\s*\\(` +
      `(?:(?!\\})[\\s\\S]){0,400}?\\b${n}\\s*\\(`,
    "i",
  ).test(source);
}

/** funcion por defecto; endpoint si hay señal de código, o ruta de API + nombre de método HTTP. */
function classifyTipo(key: string, ruta: string, nombre: string, source: string): PmTipo {
  if (endpointCodeHint(key, source, nombre)) return "endpoint";
  if (endpointPathHint(ruta) && HTTP_METHODS.has(nombre.toUpperCase())) return "endpoint";
  return "funcion";
}

let initPromise: Promise<void> | null = null;
const langCache = new Map<string, TsLang>();

async function getLang(key: string): Promise<TsLang> {
  const P = Parser as unknown as AnyParser;
  initPromise ??= P.init();
  await initPromise;
  let lang = langCache.get(key);
  if (!lang) {
    const spec = SPECS[key]!;
    const wasmPath = require.resolve(`tree-sitter-wasms/out/${spec.wasm}`);
    lang = await P.Language.load(wasmPath);
    langCache.set(key, lang);
  }
  return lang;
}

/**
 * Extrae los símbolos de un archivo de código vía tree-sitter (prompt.md §8, D4).
 * No genera embeddings ni descripciones de LLM: `descripcion` queda como la firma
 * (primera línea), que el orquestador `apply` reemplaza por la descripción ≤2 oraciones.
 *
 * Limitaciones v1 (documentadas):
 *  - `dependencias` = callees dentro del cuerpo (best-effort), no resolución completa.
 *  - `endpoint` se detecta best-effort (decorador/atributo de routing junto al símbolo, o
 *    ruta de API + nombre de método HTTP). Handlers inline de Express (arrow anónima como
 *    argumento de `app.get(...)`) no se extraen como símbolo, así que tampoco se clasifican.
 */
export async function extractCode(ruta: string, source: string): Promise<IndexEntry[]> {
  const key = languageForFile(ruta);
  if (!key) return [];
  const spec = SPECS[key]!;
  const lang = await getLang(key);
  const P = Parser as unknown as AnyParser;
  const parser = new P();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  const archivo = ruta.split("/").pop() ?? ruta;

  // Librerías a nivel archivo (compartidas por todos los símbolos del archivo).
  const importQ = lang.query(spec.importQuery);
  const librerias = uniq(
    importQ.captures(tree.rootNode).flatMap((c) => spec.importToLibs(c.name, c.node.text)),
  );

  const defQ = lang.query(spec.defQuery);
  const callQ = lang.query(spec.callQuery);
  const entries: IndexEntry[] = [];
  const covered = new Set<number>(); // filas de código dentro de algún símbolo (para cobertura)

  for (const match of defQ.matches(tree.rootNode)) {
    const nameNode = match.captures.find((c) => c.name === "n")?.node;
    const defNode = match.captures.find((c) => c.name === "d")?.node;
    if (!nameNode || !defNode) continue;

    const contenido = defNode.text;
    const dependencias = limpiarDependencias(
      callQ.captures(defNode).map((c) => c.node.text),
      nameNode.text,
    );

    const sp = defNode.startPosition;
    const ep = defNode.endPosition;
    if (sp && ep) for (let r = sp.row; r <= ep.row; r++) covered.add(r);

    const detalles: Record<string, unknown> = { firma: firstLine(contenido) };
    const contenedor = findContainer(defNode);
    if (contenedor) detalles.contenedor = contenedor;

    entries.push({
      tipo: classifyTipo(key, ruta, nameNode.text, source),
      nombre: nameNode.text,
      descripcion: firstLine(contenido),
      contenido,
      librerias,
      dependencias,
      archivo,
      ruta,
      detalles,
    });
  }

  // Constantes de nivel módulo (nombres + valores literales cortos). Se excluyen las que ya
  // son funciones (arrow), que aparecen como entidad `funcion` aparte.
  const nombresFuncion = new Set(entries.map((e) => e.nombre));
  const consts = extractConsts(lang, spec, tree.rootNode);
  const constantes = consts.nombres.filter((c) => !nombresFuncion.has(c));
  const constantesValores: Record<string, string> = {};
  for (const [k, v] of Object.entries(consts.valores)) {
    if (!nombresFuncion.has(k)) constantesValores[k] = v;
  }

  // Cobertura del archivo: filas cubiertas por símbolos / filas totales. Mismo valor por archivo.
  const totalLineas = source.split("\n").length;
  const cobertura = totalLineas > 0 ? Math.round((covered.size / totalLineas) * 1000) / 1000 : null;

  const hayValores = Object.keys(constantesValores).length > 0;
  for (const e of entries) {
    if (constantes.length && e.detalles) (e.detalles as Record<string, unknown>).constantes = constantes;
    if (hayValores && e.detalles) (e.detalles as Record<string, unknown>).constantes_valores = constantesValores;
    e.cobertura = cobertura;
  }
  return entries;
}

/** Sube por el árbol desde un símbolo hasta su clase contenedora; null si es top-level. */
function findContainer(node: TsNode): string | null {
  let p = node.parent;
  while (p) {
    // class_declaration (TS/JS/C#) | class_definition (Python). NO class_body (es el cuerpo).
    if (p.type === "class_declaration" || p.type === "class_definition") {
      return p.childForFieldName?.("name")?.text ?? null;
    }
    p = p.parent ?? null;
  }
  return null;
}

/**
 * Constantes/variables de nivel módulo: nombres y, cuando el valor es un literal corto
 * (cadena, número, booleano o arreglo), también su valor. Best-effort; degrada a vacío si la
 * query falla (diferencias de gramática entre versiones de tree-sitter no rompen la indexación).
 */
function extractConsts(
  lang: TsLang,
  spec: LanguageSpec,
  root: TsNode,
): { nombres: string[]; valores: Record<string, string> } {
  if (!spec.constQuery) return { nombres: [], valores: {} };
  try {
    const q = lang.query(spec.constQuery);
    const nombres: string[] = [];
    const valores: Record<string, string> = {};
    for (const m of q.matches(root)) {
      const k = m.captures.find((c) => c.name === "k")?.node.text.trim();
      if (!k) continue;
      nombres.push(k);
      const v = m.captures.find((c) => c.name === "v")?.node.text;
      const lit = v ? literalCorto(v) : null;
      if (lit && !(k in valores)) valores[k] = lit;
    }
    return { nombres: uniq(nombres), valores };
  } catch {
    return { nombres: [], valores: {} };
  }
}

/** Devuelve el valor si es un literal evidente y corto; null para expresiones, funciones, JSX. */
function literalCorto(v: string): string | null {
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length < 1 || t.length > 200) return null;
  // Cadena, arreglo, objeto-literal, número o booleano. Evita arrow/expresiones/llamadas.
  if (/^['"`[{]/.test(t) || /^-?\d/.test(t) || t === "true" || t === "false") {
    return t.length > 160 ? `${t.slice(0, 160)}…` : t;
  }
  return null;
}

function firstLine(s: string): string {
  return s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? s.slice(0, 80);
}

// Builtins / globales sin valor como dependencia (ruido). Se filtran por raíz o nombre completo.
const BUILTINS = new Set([
  // Python
  "str", "int", "float", "bool", "len", "print", "range", "list", "dict", "set", "tuple",
  "open", "super", "isinstance", "issubclass", "getattr", "setattr", "hasattr", "enumerate",
  "zip", "map", "filter", "sorted", "reversed", "sum", "min", "max", "abs", "type", "repr",
  "format", "bytes", "round", "any", "all", "next", "iter", "vars", "dir",
  // JS/TS
  "parseInt", "parseFloat", "String", "Number", "Boolean", "Array", "Object", "JSON", "Math",
  "Date", "Promise", "Symbol", "Map", "RegExp", "Error", "console",
]);

/**
 * Normaliza los callees capturados a `dependencias` legibles: colapsa whitespace (cadenas
 * multilínea), conserva solo rutas tipo `foo` o `foo.bar.baz` (descarta expresiones con
 * paréntesis/índices), deduplica, quita la auto-referencia y filtra builtins.
 */
function limpiarDependencias(callees: string[], propio: string): string[] {
  const limpias = callees
    .map((t) => t.replace(/\s+/g, "")) // une cadenas de métodos partidas en varias líneas
    .filter((t) => /^[\w$]+(\.[\w$]+)*$/.test(t) && t.length < 120);
  return uniq(limpias).filter((d) => {
    if (d === propio) return false; // auto-referencia
    const raiz = d.split(".")[0]!;
    return !BUILTINS.has(d) && !BUILTINS.has(raiz);
  });
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
