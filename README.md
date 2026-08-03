# ParleyLab 2.3 — Cuotas y mercados

## Novedades

- Conexión segura con The Odds API mediante Vercel Function.
- Moneyline.
- Run Line.
- Totales Over/Under.
- Probabilidad implícita.
- Probabilidad de moneyline ajustada sin vig.
- Selección directa para agregar al parley.
- Captura manual de momios de Playdoit.
- Prevención de selecciones duplicadas.
- Fuente del momio visible en el boleto.
- Preferencia por Pinnacle; si no está disponible, usa otra casa compatible.

## Archivos

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `api/odds.js`

## Configuración obligatoria en Vercel

En el proyecto `parleylab`:

1. Abre **Settings**.
2. Abre **Environment Variables**.
3. Agrega:
   - Name: `ODDS_API_KEY`
   - Value: tu clave de The Odds API
4. Selecciona Production, Preview y Development.
5. Guarda.
6. Haz un nuevo despliegue.

La clave nunca se escribe en `app.js` ni se publica en GitHub.

## Nota

The Odds API ofrece los mercados `h2h`, `spreads` y `totals`. La disponibilidad concreta depende de la casa y del evento.

La probabilidad implícita y la probabilidad ajustada sin vig no son predicciones de ParleyLab. El cálculo de valor esperado requiere un modelo independiente, que se añadirá más adelante.
