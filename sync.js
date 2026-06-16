// sync.js — Ejecutar localmente para rastrear competencia y subir resultados a producción
require('dotenv').config()
const { scraperML } = require('./scraper')

const TIENDA_URL = (process.env.TIENDA_URL || '').replace(/\/$/, '')
const SCRAPER_SECRET = process.env.SCRAPER_SECRET
const DELAY_MS = parseInt(process.env.DELAY_ENTRE_BUSQUEDAS_MS || '8000')

if (!TIENDA_URL || !SCRAPER_SECRET) {
    console.error('❌ Falta TIENDA_URL o SCRAPER_SECRET en el archivo .env')
    process.exit(1)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchKeywords() {
    const res = await fetch(`${TIENDA_URL}/api/scraper/keywords`, {
        headers: { 'x-scraper-secret': SCRAPER_SECRET }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} al obtener keywords`)
    return (await res.json()).items
}

async function pushResultados(tipo, referencia, keyword, resultados) {
    const res = await fetch(`${TIENDA_URL}/api/scraper/resultados`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-scraper-secret': SCRAPER_SECRET
        },
        body: JSON.stringify({ tipo, referencia, keyword, resultados })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} al guardar resultados`)
    return await res.json()
}

async function main() {
    console.log('\n=== SYNC COMPETENCIA ML ===')
    console.log(`Producción: ${TIENDA_URL}`)
    console.log(`Iniciando:  ${new Date().toLocaleString('es-AR')}\n`)

    let items
    try {
        items = await fetchKeywords()
    } catch (e) {
        console.error('❌ No se pudo conectar con la app de producción:', e.message)
        process.exit(1)
    }

    if (items.length === 0) {
        console.log('ℹ️  No hay ítems activos con keyword configurada.')
        process.exit(0)
    }

    console.log(`📋 Ítems a rastrear: ${items.length}\n`)

    let ok = 0, errores = 0

    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        console.log(`[${i + 1}/${items.length}] ${item.tipo} | ${item.nombre}`)
        console.log(`        keyword: "${item.keyword}"`)

        try {
            const resultados = await scraperML(item.keyword)
            const { saved } = await pushResultados(item.tipo, item.referencia, item.keyword, resultados)
            console.log(`        ✅ ${saved} resultados guardados en producción`)
            ok++
        } catch (e) {
            console.error(`        ❌ Error: ${e.message}`)
            errores++
        }

        if (i < items.length - 1) {
            console.log(`        ⏳ Esperando ${DELAY_MS / 1000}s...\n`)
            await sleep(DELAY_MS)
        }
    }

    console.log('\n=== FINALIZADO ===')
    console.log(`✅ Exitosos: ${ok}  |  ❌ Errores: ${errores}`)
    console.log(`Hora fin: ${new Date().toLocaleString('es-AR')}\n`)
}

main().catch(e => {
    console.error('Error fatal:', e.message)
    process.exit(1)
})
