# ParleyLab Static — Opción B

Versión web estática pensada para publicarse desde un celular, sin Node.js, terminal ni instalación de dependencias.

## Qué funciona

- Jornada diaria de MLB.
- Fecha seleccionable.
- Horarios en `America/Mazatlan`.
- Estado del juego.
- Equipos y récords disponibles.
- Pitchers probables.
- Estadio.
- Clima actual sin clave privada mediante Open-Meteo.
- Constructor manual de parley.
- Momios americanos.
- Cuota decimal combinada.
- Probabilidad implícita.
- Retorno potencial.
- Guardado local del boleto en el navegador.

## Limitación importante

Una página estática no puede ocultar claves privadas. Por eso esta versión NO incluye directamente The Odds API ni OpenWeatherMap con clave. Si se colocara una clave en `app.js`, cualquier persona podría verla.

Las cuotas se capturan manualmente desde Playdoit. Más adelante se puede agregar una función segura mediante Vercel Functions, Cloudflare Workers o Supabase Edge Functions.

## Publicar desde el celular con GitHub Pages

1. Descomprime el ZIP en la app Archivos.
2. En GitHub crea un repositorio público llamado `parleylab-static`.
3. Pulsa **Add file** → **Upload files**.
4. Sube `index.html`, `styles.css`, `app.js` y `README.md`.
5. En el repositorio abre **Settings**.
6. Abre **Pages**.
7. En **Build and deployment**, selecciona:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
8. Guarda.
9. GitHub mostrará la dirección pública después de procesar el sitio.

## Publicar con Vercel desde el celular

1. Crea el repositorio en GitHub y sube los cuatro archivos.
2. Entra a Vercel.
3. Pulsa **Add New** → **Project**.
4. Importa el repositorio.
5. Framework Preset: `Other`.
6. Build Command: dejar vacío.
7. Output Directory: dejar vacío.
8. Pulsa **Deploy**.

## Uso

- Toca **Agregar pick** en cualquier juego.
- Escribe la selección manualmente.
- Escribe el momio americano de Playdoit, por ejemplo `-135` o `+120`.
- La calculadora actualizará cuota, probabilidad implícita y retorno.

## Privacidad

El parley se guarda únicamente en `localStorage` del dispositivo. No se envía a una base de datos.
