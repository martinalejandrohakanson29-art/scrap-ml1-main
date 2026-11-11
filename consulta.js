// consulta.js — Búsqueda puntual en Mercado Libre desde la terminal (la usa Claude y
// tienda-martin/scripts/ml-competencia.ts). Imprime el JSON por stdout; los avisos van a stderr.
//
//   node consulta.js "tapa cdi"                 # 1 página (~48 resultados)
//   node consulta.js "tapa cdi" --paginas 2     # más profundidad
//   node consulta.js "tapa cdi" --json salida.json
//   node consulta.js "tapa cdi" --detalle 20    # abre las fichas: vendedor, vendidos, stock, MercadoLíder
//       --relevante "tapa cdi,culata cdi"         # sólo abre fichas cuyo título tiene esas palabras
//       --omitir MLA1,MLA2 | --omitir-archivo f   # no abre esas (ej: las nuestras)
//   node consulta.js --login                    # sólo si ML vuelve a pedir iniciar sesión
const fs = require('fs')
const { scraperBusqueda, login } = require('./scraper')

const args = process.argv.slice(2)
const valor = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const CON_VALOR = ['--paginas', '--json', '--detalle', '--relevante', '--omitir', '--omitir-archivo']
const keyword = args.filter((a, i) => !a.startsWith('--') && !CON_VALOR.includes(args[i - 1])).join(' ').trim()

async function main() {
    if (args.includes('--login')) return login()
    if (!keyword) {
        console.error('Uso: node consulta.js "palabras de búsqueda" [--paginas N] [--json archivo]')
        process.exit(1)
    }
    const paginas = Math.max(1, Math.min(5, parseInt(valor('--paginas') || '1', 10)))
    const detalle = Math.max(0, Math.min(60, parseInt(valor('--detalle') || '0', 10)))
    const sinTildes = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const frases = (valor('--relevante') || '').split(',').map(f => sinTildes(f).split(/\s+/).filter(Boolean)).filter(f => f.length)
    const omitir = new Set([
        ...(valor('--omitir') || '').split(','),
        ...(valor('--omitir-archivo') ? fs.readFileSync(valor('--omitir-archivo'), 'utf8').split(/[\s,]+/) : [])
    ].map(x => x.trim().toUpperCase()).filter(Boolean))
    const filtroDetalle = (r) => {
        if (r.itemId && omitir.has(r.itemId)) return false
        if (r.internacional) return false
        const t = sinTildes(r.titulo)
        return !frases.length || frases.some(f => f.every(p => t.includes(p)))
    }
    const datos = await scraperBusqueda(keyword, { paginas, detalle, filtroDetalle })
    const json = JSON.stringify(datos, null, 1)
    const archivo = valor('--json')
    if (archivo) {
        fs.writeFileSync(archivo, json)
        console.error(`JSON en ${archivo}`)
    } else {
        process.stdout.write(json + '\n')
    }
}

main().catch((e) => {
    console.error('❌ Error:', e.message)
    process.exit(1)
})
