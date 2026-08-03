# ParleyLab 4.0 — Base móvil estable

Esta versión está diseñada para administrarse desde iPhone.

## Estructura

```text
api/
  odds.js

index.html
app.js
styles.css
loader.js
version.json
README.md
UPDATE.md
```

## Conserva

- Jornada MLB.
- Abridores.
- Ofensiva.
- Pitcheo de equipo.
- Forma reciente.
- Clima.
- Estadios.
- Moneyline.
- Run Line.
- Totales.
- Constructor de parley.
- Índice ParleyLab heurístico.
- `ODDS_API_KEY` en Vercel.

## Actualizaciones futuras normales

Normalmente solo será necesario reemplazar:

```text
app.js
styles.css
version.json
```

## No volver a tocar normalmente

```text
index.html
loader.js
api/odds.js
README.md
UPDATE.md
```

## Importante

El Índice ParleyLab sigue siendo heurístico. No es una probabilidad validada de victoria ni garantiza resultados.
