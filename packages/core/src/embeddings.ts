import type { EmbeddingsConfig } from "./env.js";

/**
 * Adaptador de embeddings. Toda llamada al modelo pasa por aquí (guia/backend.md, D11):
 * cambiar de proveedor = cambiar URL/API key, sin tocar el resto del código.
 */
export interface Embedder {
  embed(textos: string[]): Promise<number[][]>;
  readonly dim: number;
}

/** Implementación contra un endpoint compatible OpenAI `/embeddings`. */
export class OpenAICompatibleEmbedder implements Embedder {
  constructor(private readonly cfg: EmbeddingsConfig) {}

  get dim(): number {
    return this.cfg.dim;
  }

  async embed(textos: string[]): Promise<number[][]> {
    if (textos.length === 0) return [];
    const res = await fetch(this.cfg.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({ model: this.cfg.model, input: textos }),
    });
    if (!res.ok) {
      throw new Error(`Embeddings ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }
}
