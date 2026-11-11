# scrap-ml — Competencia en MercadoLibre

Scraper de MercadoLibre (Playwright + Chrome real) para Revolución Motos. Tres usos:

| Uso | Cómo |
|---|---|
| **Preguntarle a Claude** "qué ves de la tapa cdi en ML", "cómo estamos de precio con el kit 120" | Skill `competencia-ml` → corre `tienda-martin/scripts/ml-competencia.ts` |
| Búsqueda suelta desde la terminal (JSON) | `node consulta.js "tapa cdi" [--paginas 2] [--detalle 20] [--json salida.json]` |
| Web local (búsqueda + modo vendedor) | `npm start` → http://localhost:3000 |
| Subir seguimiento a producción | `npm run sync` (necesita `.env`, ver `.env.example`) |

## Instalar en otra PC

Requisitos: **Node 20+**, **Google Chrome**, **Git**, **Claude Code**, y acceso a la base de tienda-martin (Tailscale).

```bash
# 1. Los dos repos en la MISMA carpeta (el análisis usa ../tienda-martin)
mkdir claude && cd claude
git clone https://github.com/martinalejandrohakanson29-art/scrap-ml1-main.git
git clone https://github.com/martinalejandrohakanson29-art/tienda-martin.git

# 2. Dependencias
cd scrap-ml1-main && npm install && cd ..
cd tienda-martin && npm install && npx prisma generate && cd ..

# 3. Secretos (NO están en GitHub): copiarlos desde la PC original
#    - tienda-martin/.env   → base de datos (Tailscale, ver tienda-martin/docs/CONECTAR-PC-NUEVA.md) y token de ML
#    - scrap-ml1-main/.env  → sólo si se usa `npm run sync` (plantilla en .env.example)

# 4. Verificar todo e instalar la skill de Claude con las rutas de esta PC
cd scrap-ml1-main && npm run instalar

# 5. Primera búsqueda (abre Chrome y crea el perfil .perfil-ml)
node consulta.js "tapa cdi"
#    Si dice "Mercado Libre pide iniciar sesión":
node consulta.js --login     # entrar con cualquier cuenta de ML y cerrar Chrome
```

Listo: en Claude Code (abierto en la carpeta `claude` o en cualquiera de los dos repos) preguntar
"haceme un análisis de cómo estamos con el kit de cilindro 120 en mercadolibre".

## Cómo funciona

- **`scraper.js`**: abre el Chrome instalado con un perfil persistente (`.perfil-ml/`, no se sube).
  ML pide login a los navegadores "recién creados" de Playwright y detecta un User-Agent forzado,
  por eso se usa Chrome real con su propio UA. Las búsquedas van en fila (el perfil no se abre dos veces).
  Lee de cada tarjeta: posición, precio, descuento, publicidad, más vendido, rating, IDs (`wid` = MLA…,
  `/up/MLAU…`, `/p/MLA…` catálogo). Con `--detalle` abre la ficha: vendedor, "+100 vendidos", stock, MercadoLíder, Full.
- La **API de ML** devuelve 403 para publicaciones de otros vendedores: lo de la competencia sale de la página.
- **`tienda-martin/scripts/ml-competencia.ts`**: corre `consulta.js`, marca las nuestras (seller 194083300),
  cruza con rentabilidad (costo, ganancia hoy, ganancia igualando a la competencia, ventas 30 días) y
  muestra el historial de `sync.js` si lo hay.
- **`claude-skill/competencia-ml/SKILL.md`**: instrucciones para Claude (qué correr, cómo elegir `--relevante`,
  cómo leer el reporte). `npm run instalar` la copia a `~/.claude/skills` reemplazando las rutas. Si se edita,
  editar ESTE archivo (el del repo) y volver a correr `npm run instalar`.

## Problemas comunes

| Síntoma | Solución |
|---|---|
| "Mercado Libre pide iniciar sesión" | `node consulta.js --login` |
| 0 resultados | Ver `public/debug.png` (captura de lo que vio el scraper) |
| `ml-competencia.ts` no conecta a la base | Tailscale prendido; `.env` de tienda-martin (CONECTAR-PC-NUEVA.md) |
| "La app no tiene token de ML" | Reautorizar en /admin/mercadolibre/token (producción) |
| Claude no usa la skill | `npm run instalar` y reiniciar Claude Code |
