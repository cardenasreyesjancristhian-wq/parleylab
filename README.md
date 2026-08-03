# ParleyLab 2.5 — Índice ParleyLab

## Novedades

- Nueva pestaña **Índice PL** dentro de cada partido.
- Índice ParleyLab de 0 a 100.
- Comparación visual entre visitante y local.
- Factores utilizados:
  - ERA del abridor
  - WHIP del abridor
  - OPS ofensivo
  - ERA del pitcheo de equipo
  - forma de últimos 10 juegos
  - localía
- Comparación del índice con:
  - cuota moneyline
  - probabilidad implícita
  - diferencia entre participación del índice y mercado
- Señal heurística para Over/Under.
- Indicador de completitud de datos.
- Clasificaciones:
  - Datos insuficientes
  - Partido equilibrado
  - Ventaja moderada
  - Señal fuerte con posible valor

## Transparencia

El Índice ParleyLab es una evaluación heurística y todavía no es una probabilidad validada de victoria.

No debe interpretarse como garantía de resultado, recomendación financiera ni valor esperado confirmado.

Antes de convertirlo en un modelo predictivo real será necesario:

1. Guardar históricos.
2. Comparar predicciones con resultados.
3. Calibrar pesos.
4. Medir precisión, Brier Score y rentabilidad por mercado.
5. Validar fuera de muestra.

## Instalación

Reemplaza únicamente:

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

Conserva:

- `api/odds.js`
- `ODDS_API_KEY` en Vercel
