---
name: competencia-ml
description: Analiza la competencia de Revolución Motos en MercadoLibre para un producto (precios, vendedores, vendidos, Full, posición en la búsqueda) y cómo estamos nosotros (precio, ganancia, margen para bajar). Usar cuando Martín pregunte cosas como "comentame qué ves sobre la tapa cdi en mercadolibre", "cómo estamos de precio con X en ML", "quién nos compite en Y", "estamos caros con Z?", "qué hace la competencia con el kit de cilindro".
---

# Competencia en MercadoLibre

Una sola herramienta: `{{TIENDA_DIR}}/scripts/ml-competencia.ts`. Scrapea el listado de ML en vivo
(con `scrap-ml1-main`, Chrome real), identifica cuáles son nuestras (seller 194083300, REVOLUCION_MARKET),
abre la ficha de la competencia relevante (vendedor, "+100 vendidos", stock, MercadoLíder, Full)
y cruza con rentabilidad (costo, ganancia hoy, ganancia si igualamos a la competencia, ventas 30 días).

## Cómo correrlo

Desde `{{TIENDA_DIR}}` (`cd "{{TIENDA_DIR}}"` primero; Bash, timeout 600000 — tarda 1-3 min, abre una ventana de Chrome):

```bash
npx tsx scripts/ml-competencia.ts "tapa cdi" --relevante "tapa cdi,tapa cilindro 125" --json "<scratchpad>/comp.json"
```

- La búsqueda: como la escribiría un comprador (lo que dijo Martín, ej. "tapa cdi").
- `--relevante "a b,c d"`: qué títulos son EL MISMO producto (todas las palabras de alguna frase). Pensalo antes:
  con sólo la keyword se pierden competidores que titulan distinto (ej. "Tapa De Cilindro Smash 125 Competición"
  no dice "cdi"). Si en el listado aparecen productos que claramente son lo mismo y quedaron marcados con `·`,
  volvé a correr con `--desde-archivo <ruta del scrape.json que imprime>` y otro `--relevante` (no reabre Chrome).
- `--nuestras "x y"`: cuáles de nuestras publicaciones comparar si el default (las que aparecen + las que cumplen
  --relevante) trae de más o de menos.
- `--paginas 2` si el producto es muy buscado y hay más de ~45 resultados; `--detalle 40` para abrir más fichas.
- `--json` deja todo (filas con link, cuotas, rating, etiqueta, ficha) para mirar detalles.

Si falla con "Mercado Libre pide iniciar sesión": pedirle a Martín que corra
`! cd {{SCRAPER_DIR}} && node consulta.js --login`, entre con cualquier cuenta y cierre Chrome.

## Cómo leerlo y qué contestar

Respuesta corta, en castellano rioplatense, con números concretos. Estructura sugerida:
1. **Panorama**: cuántos compiten de verdad, rango de precios (mín / mediana), quién domina (vendedor, vendidos, MercadoLíder, Full).
2. **Nosotros**: posición en la búsqueda, precio al comprador vs mínimo y mediana, cuántos más baratos, ganancia hoy.
3. **Lectura**: dónde estamos caros/baratos y si hay margen ("igualando al mínimo quedamos en X% de ganancia").
   Sugerir, no ejecutar: cambiar precios es con `scripts/ml-analisis.ts descuento|lista` y SIEMPRE con OK de Martín.

Cuidados al interpretar:
- **Comparar peras con peras**: separar pieza sola de combos (tapa sola vs tapa + cilindro + bujía). Un combo nuestro
  "+40% vs mínimo" puede estar bien si el mínimo es una pieza suelta. Agrupar por tipo antes de opinar.
- `AD` = anuncio pago (la posición no es orgánica). `CAT` = publicación de catálogo. `·` = no cumple --relevante.
- "vendidos" es el histórico de la publicación (no del mes) y ML redondea ("+100"). `stock 1` suele ser "¡última unidad!".
- Full/vendedor de la competencia sólo existen si se abrió la ficha (columna vacía = no se abrió o no lo muestra).
- "gan al mín / a mediana" asume que el comprador paga eso sin campaña de ML; si la ganancia de rentabilidad
  tiene más de 24 hs, el script avisa: decirlo.
- Publicaciones nuestras que "no aparecen" en la búsqueda: mencionarlo (duplicados clásica/premium o baja visibilidad).
- Internacionales (CBT) se excluyen de las estadísticas.

Para profundizar en una publicación nuestra (promos, visitas, conversión): `npx tsx scripts/ml-analisis.ts publicacion MLA...`.
