// Módulo de scraping reutilizable — usado por server.js, sync.js y consulta.js
//
// Desde fines de 2026 Mercado Libre pide iniciar sesión a los navegadores "recién nacidos"
// de Playwright (el listado devuelve "¡Hola! Para continuar, ingresa a tu cuenta").
// Por eso se usa el Chrome instalado en la PC con un perfil persistente (.perfil-ml):
// las cookies quedan guardadas entre corridas y ML lo trata como un navegador normal.
// Si algún día vuelve a pedir login: `node consulta.js --login` y entrar a mano una vez.
const { chromium } = require('playwright')
const path = require('path')

const PERFIL_DIR = process.env.PERFIL_ML_DIR || path.join(__dirname, '.perfil-ml')
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const HEADLESS = process.env.HEADLESS === 'true'

// El perfil persistente no se puede abrir dos veces a la vez: las búsquedas van en fila.
let cola = Promise.resolve()
function enFila(fn) {
    const turno = cola.then(fn, fn)
    cola = turno.catch(() => {})
    return turno
}

async function abrirNavegador() {
    const opciones = {
        headless: HEADLESS,
        viewport: { width: 1280, height: 800 },
        args: ['--disable-blink-features=AutomationControlled']
    }
    try {
        // Chrome real instalado: es lo que ML no bloquea. Se deja SU User-Agent (un Chrome de
        // Windows real y actualizado): forzar otro no coincide con la versión real y ML lo detecta.
        return await chromium.launchPersistentContext(PERFIL_DIR, { ...opciones, channel: 'chrome' })
    } catch (e) {
        // En Docker/Linux no hay Chrome: se usa el Chromium de Playwright con UA de Chrome Windows
        console.error('  ⚠ Chrome no disponible, uso Chromium:', e.message.split('\n')[0])
        return await chromium.launchPersistentContext(PERFIL_DIR, {
            ...opciones, userAgent: USER_AGENT, args: [...opciones.args, '--no-sandbox']
        })
    }
}

// Abre el navegador, ejecuta fn(page) y lo cierra pase lo que pase.
function conPagina(fn) {
    return enFila(async () => {
        const context = await abrirNavegador()
        try {
            const page = context.pages()[0] || await context.newPage()
            return await fn(page)
        } finally {
            await context.close().catch(() => {})
        }
    })
}

function pideLogin(page, titulo) {
    const url = page.url()
    return url.includes('/login') || url.includes('captcha') || /robot|ingresa a tu cuenta/i.test(titulo)
}

async function esperarTarjetas(page, ms) {
    try {
        await page.waitForSelector('.ui-search-layout__item, .poly-card', { timeout: ms })
        return true
    } catch {
        await page.screenshot({ path: path.join(__dirname, 'public', 'debug.png') }).catch(() => {})
        const texto = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '').catch(() => '')
        if (/ingresa a tu cuenta|soy nuevo/i.test(texto)) {
            throw new Error('Mercado Libre pide iniciar sesión. Ejecutá una vez: node consulta.js --login')
        }
        console.warn('  ⚠ No se encontraron ítems en el DOM (captura en public/debug.png)')
        return false
    }
}

// Scroll suave para que carguen las imágenes y tarjetas diferidas
async function scrollear(page) {
    await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 900) {
            window.scrollTo(0, y)
            await new Promise(r => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
    }).catch(() => {})
}

// ── Lectura de tarjetas del listado (se ejecuta dentro del navegador) ─────────
function leerTarjetas() {
    const precio = (el) => {
        if (!el) return null
        const n = parseInt(el.innerText.replace(/\D/g, ''), 10)
        return Number.isFinite(n) ? n : null
    }
    const items = Array.from(document.querySelectorAll('.poly-card, .ui-search-layout__item'))
        // .ui-search-layout__item envuelve a .poly-card: quedarse con la más interna
        .filter(el => !el.querySelector('.poly-card') || el.classList.contains('poly-card'))

    return items.map((item, i) => {
        const tituloEl = item.querySelector('.poly-component__title, h2, h3')
        const titulo = tituloEl ? tituloEl.innerText.trim() : 'Sin título'

        const linkEl = item.querySelector('a.poly-component__title, a')
        const link = linkEl ? linkEl.href : ''
        // IDs: wid = publicación (MLA…), /up/MLAU… = producto del vendedor, /p/MLA… = catálogo
        const wid = (link.match(/[?&#]wid=(MLA\d+)/i) || link.match(/item_id(?:%3A|:)(MLA\d+)/i) || [])[1] || null
        const upId = (link.match(/\/up\/(MLAU\d+)/i) || link.match(/searchVariation=(MLAU\d+)/i) || [])[1] || null
        const catalogoId = (link.match(/\/p\/(MLA\d+)/i) || [])[1] || null
        const legacy = (link.match(/mercadolibre\.com\.ar\/(MLA)-?(\d+)/i) || [])
        const itemId = wid || (legacy[2] ? `MLA${legacy[2]}` : null)

        const anteriorEl = item.querySelector('.andes-money-amount--previous .andes-money-amount__fraction, s .andes-money-amount__fraction')
        const actualEl = item.querySelector('.poly-price__current .andes-money-amount__fraction, .ui-search-price__second-line .andes-money-amount__fraction')
            || Array.from(item.querySelectorAll('.andes-money-amount__fraction')).find(el => !el.closest('s') && !el.closest('.andes-money-amount--previous'))
        const precioNum = precio(actualEl)
        const precioAnterior = precio(anteriorEl)

        const descEl = item.querySelector('.poly-price__disc_label, .poly-price__discount, [class*="discount"]')
        const descuento = descEl ? descEl.innerText.trim() : null

        const cuotasEl = item.querySelector('.poly-price__installments, .poly-component__installments, [class*="installments"]')
        const cuotas = cuotasEl ? cuotasEl.innerText.replace(/\s+/g, ' ').trim() : ''

        const envioEl = item.querySelector('.poly-component__shipping-v2, .poly-component__shipping, .ui-search-item__fulfillment')
        const envioTxt = envioEl ? envioEl.innerText.replace(/\s+/g, ' ').trim() : ''
        // El listado ya no muestra el rayo de Full: el dato real sale de la API (ml-competencia.ts)
        const esFull = item.querySelector('[aria-label="Full"], .poly-shipping__status--full') !== null
        let envio = ''
        if (/gratis/i.test(envioTxt)) envio = 'Envío Gratis'
        if (/llega/i.test(envioTxt)) envio = envioTxt
        if (esFull) envio = envio ? `${envio} ⚡ Full` : '⚡ Full'

        const etiquetaEl = item.querySelector('.poly-component__poly-label, .poly-component__highlight, .poly-component__label')
        const etiqueta = etiquetaEl ? etiquetaEl.innerText.trim() : ''
        const masVendido = /m[aá]s vendido/i.test(item.innerText)

        const ratingEl = item.querySelector('.poly-component__review-compacted .polylabel-label, .poly-reviews__rating')
        const rating = ratingEl ? parseFloat(ratingEl.innerText.replace(',', '.')) || null : null
        const opinionesEl = item.querySelector('.poly-reviews__total')
        const opiniones = opinionesEl ? parseInt(opinionesEl.innerText.replace(/\D/g, ''), 10) || null : null

        const vendedorEl = item.querySelector('.poly-component__seller')
        const vendedor = vendedorEl ? vendedorEl.innerText.replace(/^por\s+/i, '').trim() : ''
        const esTiendaOficial = !!item.querySelector('[aria-label="Tienda oficial"], .ui-search-official-store-label')
        const esAnuncio = !!item.querySelector('.poly-component__ads-promotions') || /is_advertising=true|mclics/.test(link)
        const internacional = /internacional/i.test(item.innerText)

        const imgEl = item.querySelector('img')
        const imagen = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '') : ''

        // Campos "viejos" (price, title, mlaId…) se mantienen porque los usa la app de producción
        return {
            posicion: i + 1,
            titulo, precio: precioNum, precioAnterior, descuento, cuotas, envio, esFull,
            etiqueta, masVendido, rating, opiniones, vendedor, esTiendaOficial, esAnuncio, internacional,
            itemId, upId, catalogoId, link, imagen,
            title: titulo,
            price: `$ ${precioNum != null ? precioNum.toLocaleString('es-AR') : '0'}`,
            originalPrice: precioAnterior != null ? `$ ${precioAnterior.toLocaleString('es-AR')}` : null,
            mlaId: itemId || catalogoId || upId,
            image: imagen, installments: cuotas, shippingStatus: envio,
            seller: vendedor || (esAnuncio ? 'Publicidad' : ''), isTiendaOficial: esTiendaOficial,
            stock: /[uú]ltim/i.test(etiqueta) ? etiqueta : ''
        }
    })
}

// ── Ficha de una publicación: vendedor, vendidos, stock, Full ────────────────
// La API de ML ya no deja leer publicaciones de otros vendedores (403): esto sale de la página.
async function detallePublicacion(page, link) {
    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForSelector('.ui-pdp-title', { timeout: 15000 })
    return page.evaluate(() => {
        const txt = (s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : '' }
        const cuerpo = document.body.innerText.replace(/\s+/g, ' ')
        const sub = txt('.ui-pdp-subtitle, .ui-pdp-header__subtitle')
        const vendidosTxt = (sub.match(/\+?[\d.]+\s*(mil)?\s*vendidos?/i) || [''])[0]
        let vendidosMin = null
        if (vendidosTxt) {
            const n = parseInt(vendidosTxt.replace(/\D/g, ''), 10)
            vendidosMin = /mil/i.test(vendidosTxt) ? n * 1000 : n
        }
        const linkVend = Array.from(document.querySelectorAll('a[href*="/pagina/"], a[href*="/tienda/"], a[href*="/perfil/"]')).map(a => a.href)
        const conId = linkVend.find(h => /seller_id=\d+/.test(h)) || ''
        let vendedor = txt('.ui-pdp-seller__link-trigger, .ui-seller-data-header__title') ||
            ((cuerpo.match(/Vendido por ([^\s]+(?: [A-ZÁÉÍÓÚÑ0-9]+)*)/) || [])[1] || '')
        vendedor = vendedor.replace(/^Vendido por\s+/i, '').trim()
        const disp = cuerpo.match(/\(\+?([\d.]+) disponibles?\)/i)
        const ultima = /¡?última unidad|últimas? \d+ unidades|ÚLTIMA UNIDAD/i.test(cuerpo)
        const lider = (cuerpo.match(/MercadoLíder( Platinum| Gold)?/i) || [null])[0]
        const ventasVend = (cuerpo.match(/MercadoLíder \| ([^ ]+ (?:mil )?ventas)|\| (\+?[\d.]+ (?:mil )?ventas)/i) || [])
        const full = !!document.querySelector('[class*="icon--full"], [aria-label="Full"], [aria-label="FULL"]') || /Enviado por\s*FULL/i.test(cuerpo)
        const envio = txt('.ui-pdp-shipping, .ui-pdp-media--shipping, [class*="shipping-summary"]').slice(0, 120)
        return {
            vendedor: vendedor || null,
            vendedorSlug: ((linkVend[0] || '').match(/\/(?:pagina|tienda|perfil)\/([^/?#]+)/) || [])[1] || null,
            sellerId: ((conId.match(/seller_id=(\d+)/) || [])[1]) || null,
            vendidos: vendidosTxt || null, vendidosMin,
            disponibles: disp ? parseInt(disp[1].replace(/\./g, ''), 10) : (ultima ? 1 : null),
            ultimaUnidad: ultima, lider, ventasVendedor: ventasVend[1] || ventasVend[2] || null,
            full, envioFicha: envio || null
        }
    })
}

function slugBusqueda(keyword) {
    return keyword.trim().toLowerCase().replace(/\s+/g, '-')
}

// Búsqueda completa: varias páginas, sin duplicados, con posición real en el listado.
// detalle: cuántos resultados abrir para leer la ficha (vendedor, vendidos, stock). Con
// filtroDetalle(resultado) se eligen cuáles (ej: sólo los relevantes y que no son nuestros).
async function scraperBusqueda(keyword, { paginas = 1, detalle = 0, filtroDetalle = () => true } = {}) {
    console.error(`Buscando: "${keyword}" (${paginas} página/s)`)
    return conPagina(async (page) => {
        const base = `https://listado.mercadolibre.com.ar/${encodeURIComponent(slugBusqueda(keyword))}`
        const todos = []
        let totalResultados = null

        for (let p = 0; p < paginas; p++) {
            const url = p === 0 ? base : `${base}_Desde_${p * 48 + 1}_NoIndex_True`
            console.error(`  → ${url}`)
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
            if (pideLogin(page, await page.title())) {
                throw new Error('Mercado Libre pide iniciar sesión. Ejecutá una vez: node consulta.js --login')
            }
            if (!(await esperarTarjetas(page, 15000))) break
            await scrollear(page)

            if (totalResultados == null) {
                totalResultados = await page.evaluate(() => {
                    const el = document.querySelector('.ui-search-search-result__quantity-results, [class*="quantity-results"]')
                    const m = el && el.innerText.match(/([\d.]+)/)
                    return m ? parseInt(m[1].replace(/\./g, ''), 10) : null
                })
            }
            const tarjetas = await page.evaluate(leerTarjetas)
            tarjetas.forEach(t => { t.posicion = todos.length + t.posicion; t.pagina = p + 1 })
            todos.push(...tarjetas)
            if (tarjetas.length < 40) break
            if (p < paginas - 1) await page.waitForTimeout(1500 + Math.random() * 1500)
        }

        // Sin duplicados (un mismo producto puede aparecer como anuncio y orgánico)
        const vistos = new Set()
        const resultados = todos.filter(r => {
            const k = r.itemId || r.upId || r.catalogoId || r.link
            if (vistos.has(k)) return false
            vistos.add(k)
            return true
        })
        console.error(`  ✓ ${resultados.length} resultados`)

        const aAbrir = detalle > 0 ? resultados.filter(r => r.link && filtroDetalle(r)).slice(0, detalle) : []
        for (let i = 0; i < aAbrir.length; i++) {
            const r = aAbrir[i]
            try {
                r.detalle = await detallePublicacion(page, r.link)
                console.error(`  · ficha ${i + 1}/${aAbrir.length}: ${r.detalle.vendedor || '?'} ${r.detalle.vendidos || ''}`)
            } catch (e) {
                r.detalle = { error: e.message.split('\n')[0] }
                console.error(`  ⚠ ficha ${r.itemId || r.posicion}: ${r.detalle.error}`)
            }
            await page.waitForTimeout(600 + Math.random() * 900)
        }
        return { keyword, url: base, totalResultados, fecha: new Date().toISOString(), resultados }
    })
}

// Compatibilidad: lo usan server.js (/api/search) y sync.js (sube a producción).
async function scraperML(keyword) {
    const { resultados } = await scraperBusqueda(keyword, { paginas: 1 })
    return resultados.slice(0, 20)
}

// Abre el navegador con el perfil para iniciar sesión a mano (una sola vez).
async function login() {
    const context = await abrirNavegador()
    const page = context.pages()[0] || await context.newPage()
    await page.goto('https://www.mercadolibre.com.ar/', { waitUntil: 'domcontentloaded' })
    console.log('Iniciá sesión en la ventana de Chrome (cualquier cuenta sirve) y cerrala al terminar.')
    await new Promise(r => context.on('close', r))
    console.log('Listo: la sesión quedó guardada en', PERFIL_DIR)
}

// ── SELLER MODE ─────────────────────────────────────────────────────────────

function extractSellerSlug(sellerUrl) {
    const m = sellerUrl.match(/mercadolibre\.com(?:\.ar)?\/(?:pagina|tienda)\/([^/?#]+)/)
    if (m) return m[1]
    throw new Error('URL no válida. Debe ser: mercadolibre.com.ar/pagina/nombre-vendedor')
}

async function scraperSellerCategories(sellerUrl) {
    const slug = extractSellerSlug(sellerUrl)
    const listingUrl = `https://listado.mercadolibre.com.ar/pagina/${slug}`
    console.log(`Cargando vendedor: ${slug}`)

    return conPagina(async (page) => {
        await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await esperarTarjetas(page, 12000)

        const data = await page.evaluate(() => {
            const totalEl = document.querySelector(
                '.ui-search-search-result__quantity-results, h2[class*="results"], [class*="quantity-results"]'
            )
            const totalText = totalEl ? totalEl.innerText.trim() : ''
            const totalMatch = totalText.match(/([\d.,]+)\s+resultado/)
            const total = totalMatch ? parseInt(totalMatch[1].replace(/[.,]/g, '')) : 0

            // Detectar sección de categorías por patrón de URL (/listado/)
            const categories = []
            const seen = new Set()
            document.querySelectorAll('.ui-search-filter-dl li a').forEach(a => {
                if (!a.href.includes('/listado/')) return
                const nameEl = a.querySelector('.ui-search-filter-name') || a
                const countEl = a.querySelector('.ui-search-filter-results-qty')
                const name = (nameEl.childNodes[0]?.textContent || nameEl.innerText || '').trim()
                const cleanUrl = a.href.split('#')[0].replace(/\/_NoIndex_True.*$/, '')
                if (!name || seen.has(cleanUrl)) return
                seen.add(cleanUrl)
                const countText = countEl ? countEl.innerText.replace(/[().\s]/g, '') : ''
                const count = countText ? parseInt(countText) : null
                categories.push({ name, count, url: cleanUrl })
            })
            return { total, categories }
        })

        console.log(`  ✓ vendedor="${slug}" total=${data.total} categorías=${data.categories.length}`)
        return { slug, listingUrl, total: data.total, categories: data.categories }
    })
}

async function scraperSellerProducts(listingUrl, offset = 0, sort = '') {
    let url = listingUrl
    if (offset > 0) url += `/_Desde_${offset + 1}`
    if (sort) url += `?_OrderId=${sort}`
    console.log(`Scrapeando productos: offset=${offset} sort=${sort || 'default'}`)
    console.log(`  → ${url}`)

    return conPagina(async (page) => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForTimeout(2000)

        // Verificar que no redirigió fuera de la tienda
        const slugMatch = listingUrl.match(/pagina\/([^/?#_]+)/)
        const slug = slugMatch ? slugMatch[1] : null
        if (slug && !page.url().includes(slug)) {
            console.warn('  ⚠ Redirigió fuera del catálogo del vendedor:', page.url())
            return { total: 0, products: [], offset, perPage: 48, redirected: true }
        }

        await esperarTarjetas(page, 25000)
        await scrollear(page)

        const total = await page.evaluate(() => {
            const el = document.querySelector('.ui-search-search-result__quantity-results, h2[class*="results"], [class*="quantity-results"]')
            const m = el && el.innerText.match(/([\d.,]+)\s+resultado/)
            return m ? parseInt(m[1].replace(/[.,]/g, '')) : 0
        })
        const tarjetas = await page.evaluate(leerTarjetas)
        const products = tarjetas.map(t => ({
            mlaId: t.mlaId, title: t.titulo, price: t.precio != null ? t.price : null,
            originalPrice: t.originalPrice, discount: t.descuento, installments: t.cuotas,
            shippingStatus: t.envio, isBestSeller: t.masVendido, link: t.link, image: t.imagen
        }))
        console.log(`  ✓ ${products.length} productos (total anunciado: ${total})`)
        return { total, products, offset, perPage: 48 }
    })
}

module.exports = { scraperML, scraperBusqueda, detallePublicacion, scraperSellerCategories, scraperSellerProducts, login }
