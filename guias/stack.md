# Stack estándar

## Separación frontend/backend
**Regla:** toda arquitectura cliente-servidor separa frontend de backend.
**Razón:** requiere conexiones y separación clara de responsabilidades; diseñar desde el
backend evita el antipatrón de "diseñar desde el frontend" que ya nos ha fallado.

## Backend
**Regla:** backend en **.NET Core 8 con C#**.
**Razón:** aprovechamos los mecanismos de autenticación y seguridad que Microsoft ya
implementa nativamente en el framework (capa adicional de seguridad reciente).

## Frontend
**Regla:** **React** (preferido); **Vue** permitido.
**Prohibido:** **Laravel** (incompatibilidades fuertes entre versiones mayores) y **HTML
puro** (ya estamos en época de frameworks).

## Ejemplos
- ✅ Backend .NET Core 8 + C# expone una API; frontend React la consume.
- ❌ Generar el backend "con lo que se le antoje a la IA".
- ❌ Una vista en HTML plano sin framework.
