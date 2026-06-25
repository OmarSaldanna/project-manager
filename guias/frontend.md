# Frontend

**Regla:** **React** (preferido) o **Vue**. El frontend consume la API del backend; no
contiene lógica de negocio ni acceso directo a datos.
**Prohibido:** **Laravel** (incompatibilidades entre versiones mayores) y **HTML puro**.
**Razón:** estandarizar reduce el costo de mantenimiento y rotación de personas; los
frameworks estables nos dan estructura y ecosistema.

## Ejemplos
- ✅ App React que llama a los endpoints .NET y renderiza el estado.
- ❌ Vistas en HTML plano; mezclar Laravel Blade con el frontend.
