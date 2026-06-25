# Gestión de paquetes

**Regla:** usa **siempre `pnpm`**. NUNCA `npm` ni `yarn`.
**Razón:** reduce la superficie de riesgo de seguridad (allowlist explícito de build
scripts vía `pnpm approve-builds`, store con verificación de integridad) y mantiene
lockfiles deterministas en todos los proyectos.

## Reglas operativas
- Si encuentras `package-lock.json` o `yarn.lock`, conviértelo a `pnpm-lock.yaml` y elimínalo.
- Los build scripts de dependencias se aprueban explícitamente (`onlyBuiltDependencies` /
  `allowBuilds` en `pnpm-workspace.yaml`); nunca se habilitan en bloque.
- Refuerza con `engine-strict=true` y un `preinstall` que bloquee gestores que no sean pnpm.

## Ejemplos
- ✅ `pnpm install`, `pnpm add -w -D vitest`, `pnpm -r build`.
- ❌ `npm install`, `npx` para instalar dependencias del proyecto, commitear `package-lock.json`.
