// Módulo de scraping reutilizable — usado por server.js y sync.js
const { chromium } = require('playwright')
const path = require('path')

async function scraperML(keyword) {
    let browser = null
    try {
        console.log(`Buscando: "${keyword}"`)

        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        })

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        })

        const page = await context.newPage()
        const searchUrl = `https://listado.mercadolibre.com.ar/${encodeURIComponent(keyword)}`

        console.log(`  → ${searchUrl}`)
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })

        const pageTitle = await page.title()
        const currentUrl = page.url()

        if (pageTitle.includes('robot') || pageTitle.includes('moment') || currentUrl.includes('captcha')) {
            console.warn('  ⚠ Posible CAPTCHA detectado')
        }

        try {
            await page.waitForSelector('.ui-search-layout__item, .poly-card', { timeout: 10000 })
        } catch {
            const debugPath = path.join(__dirname, 'public', 'debug.png')
            await page.screenshot({ path: debugPath }).catch(() => {})
            console.warn('  ⚠ No se encontraron ítems en el DOM')
        }

        const rawResults = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('.ui-search-layout__item, .poly-card'))
            return items.slice(0, 40).map(item => {
                const titleEl = item.querySelector('h2') || item.querySelector('h3')
                const title = titleEl ? titleEl.innerText.trim() : 'Sin título'

                const originalPriceEls = item.querySelectorAll('.andes-money-amount--previous .andes-money-amount__fraction, s .andes-money-amount__fraction')
                const originalPriceText = originalPriceEls.length > 0 ? originalPriceEls[0].innerText.trim() : null
                const originalPrice = originalPriceText ? `$ ${originalPriceText}` : null

                const currentPriceSelectors = item.querySelectorAll('.poly-price__current .andes-money-amount__fraction, .ui-search-price__second-line .andes-money-amount__fraction')
                let priceText = '0'
                if (currentPriceSelectors.length > 0) {
                    priceText = currentPriceSelectors[0].innerText.trim()
                } else {
                    const priceEls = Array.from(item.querySelectorAll('.andes-money-amount__fraction'))
                    const mainPrices = priceEls.filter(el => !el.closest('.andes-money-amount--previous') && !el.closest('s'))
                    priceText = mainPrices.length > 0 ? mainPrices[0].innerText.trim() : '0'
                }

                const linkEl = item.querySelector('a')
                const link = linkEl ? linkEl.href : ''
                const mlaMatch = link.match(/MLA-?(\d+)/i)
                const mlaId = mlaMatch ? `MLA${mlaMatch[1]}` : null

                const imgEl = item.querySelector('img')
                let image = ''
                if (imgEl) image = imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || ''

                let installments = ''
                const instEl = item.querySelector('.poly-component__installments, .ui-search-item__group__element.ui-search-installments, [class*="installments"]')
                if (instEl) {
                    installments = instEl.innerText.trim()
                } else {
                    const allTexts = Array.from(item.querySelectorAll('span, p, div'))
                    const cuotas = allTexts.find(s => s.innerText && s.innerText.toLowerCase().includes('cuotas') && s.children.length === 0)
                    if (cuotas) installments = cuotas.innerText.trim()
                }
                installments = installments.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

                const shippingEl = item.querySelector('.poly-component__shipping, .ui-search-item__fulfillment')
                const hasFull = item.querySelector(
                    'svg.ui-search-icon--full, .ui-search-item__fulfillment-icon--full, .poly-shipping__status--full, [data-testid="fulfillment"], [aria-label="Full"]'
                ) !== null
                let shippingStatus = ''
                if (shippingEl && shippingEl.innerText.toLowerCase().includes('gratis')) shippingStatus = 'Envío Gratis'
                if (hasFull) shippingStatus = shippingStatus ? shippingStatus + ' ⚡ Full' : '⚡ Full'

                let seller = ''
                let isTiendaOficial = false
                const polySellerEl = item.querySelector('.poly-component__seller')
                if (polySellerEl) {
                    seller = polySellerEl.innerText.trim()
                    isTiendaOficial = polySellerEl.querySelector('[aria-label="Tienda oficial"]') !== null
                } else {
                    const officialEl = item.querySelector('.ui-search-official-store-label, .ui-search-item__brand-discoverability-label')
                    if (officialEl) { seller = officialEl.innerText.trim(); isTiendaOficial = true }
                }
                const isAd = item.querySelector('.poly-component__ads-promotions') !== null
                if (!seller && isAd) seller = 'Publicidad'

                let stock = ''
                const allSpans = Array.from(item.querySelectorAll('span, p'))
                const stockTextEl = allSpans.find(el => {
                    if (el.children.length !== 0) return false
                    const txt = el.innerText ? el.innerText.trim().toLowerCase() : ''
                    return (txt.includes('última') || txt.includes('últim')) && (txt.includes('unidad') || txt.includes('disponible'))
                })
                if (stockTextEl) {
                    stock = stockTextEl.innerText.trim()
                } else {
                    const highlightEl = item.querySelector('.poly-component__highlight')
                    if (highlightEl) stock = highlightEl.innerText.trim()
                }

                return { title, price: `$ ${priceText}`, originalPrice, link, mlaId, image, installments, shippingStatus, seller, isTiendaOficial, stock }
            })
        })

        const seen = new Set()
        const results = rawResults.filter(item => {
            if (!item.mlaId) return true
            if (seen.has(item.mlaId)) return false
            seen.add(item.mlaId)
            return true
        }).slice(0, 20)

        console.log(`  ✓ ${results.length} resultados`)
        await browser.close()
        return results

    } catch (error) {
        if (browser) await browser.close()
        throw error
    }
}

module.exports = { scraperML }
