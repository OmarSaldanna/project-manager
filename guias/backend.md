# Backend

## Framework
**Regla:** **.NET Core 8 + C#**. Usa el framework de autenticación y los mecanismos de
seguridad nativos de Microsoft en vez de rodar los tuyos.
**Razón:** capa de seguridad adicional ya integrada y mantenida por Microsoft.

## Capa proxy/adaptador de LLM
**Regla:** toda comunicación con modelos de IA pasa por un **adaptador único**. El código
de negocio nunca se acopla directamente al SDK de un proveedor.
**Razón:** poder migrar entre Claude / Gemini / GPT cambiando una API key, y resiliencia
si un proveedor (o un agregador como OpenRouter) se cae.

**Cómo:**
- Por defecto, enrutar vía **OpenRouter** (cambiar de modelo = cambiar API key).
- Mantener un **fallback directo** a un proveedor concreto por si OpenRouter no responde.
- Nota: los **embeddings** no van por OpenRouter (no los expone); usan su propio endpoint
  compatible OpenAI detrás del mismo patrón de adaptador.

## Ejemplos
- ✅ `ILlmClient` con implementaciones `OpenRouterClient` y `OpenAIDirectClient`, intercambiables.
- ❌ `new AnthropicClient()` invocado directamente en un controller.
