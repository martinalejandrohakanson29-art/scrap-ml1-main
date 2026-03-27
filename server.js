const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

app.get('/api/search', async (req, res) => {
    const keyword = req.query.q;

    if (!keyword) {
        return res.status(400).json({ error: 'Falta la palabra clave para la búsqueda' });
    }

    let browser = null;
    try {
        console.log(`--- NUEVA BÚSQUEDA ---`);
        console.log(`Buscando: "${keyword}"`);

        // Iniciamos el navegador con flags de sigilo para evitar bloqueos
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled' // Clave para ocultar que es un bot
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        });

        const page = await context.newPage();
        const searchUrl = `https://listado.mercadolibre.com.ar/${encodeURIComponent(keyword)}`;

        console.log(`Navegando a: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // LOGS DE DIAGNÓSTICO
        const pageTitle = await page.title();
        const currentUrl = page.url();
        console.log(`Título de la página: "${pageTitle}"`);
        console.log(`URL actual: ${currentUrl}`);

        // Verificamos si estamos en una página de bloqueo
        if (pageTitle.includes("robot") || pageTitle.includes("moment") || currentUrl.includes("captcha")) {
            console.error("ALERTA: Mercado Libre detectó el bot (CAPTCHA visible).");
        }

        // Intentamos esperar a los productos
        try {
            await page.waitForSelector('.ui-search-layout__item, .poly-card', { timeout: 10000 });
            console.log("Éxito: Se encontraron elementos en el DOM.");
        } catch (e) {
            console.log("Aviso: No se encontraron items con los selectores estándar.");

            // GENERAR CAPTURA DE PANTALLA PARA DEBUG
            const debugPath = path.join(__dirname, 'public', 'debug.png');
            await page.screenshot({ path: debugPath });
            console.log(`Captura de pantalla de error guardada en: ${debugPath}`);
            console.log(`Revisala en: https://tu-dominio.com/debug.png`);
        }

        const rawResults = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('.ui-search-layout__item, .poly-card'));
            return items.slice(0, 40).map(item => {
                const titleEl = item.querySelector('h2') || item.querySelector('h3');
                const title = titleEl ? titleEl.innerText.trim() : 'Sin título';

                // Precio Original (si existe rebaja)
                const originalPriceEls = item.querySelectorAll('.andes-money-amount--previous .andes-money-amount__fraction, s .andes-money-amount__fraction');
                const originalPriceText = originalPriceEls.length > 0 ? originalPriceEls[0].innerText.trim() : null;
                const originalPrice = originalPriceText ? `$ ${originalPriceText}` : null;

                // Precio final actual
                const currentPriceSelectors = item.querySelectorAll('.poly-price__current .andes-money-amount__fraction, .ui-search-price__second-line .andes-money-amount__fraction');
                let priceText = '0';
                if (currentPriceSelectors.length > 0) {
                    priceText = currentPriceSelectors[0].innerText.trim();
                } else {
                    const priceEls = Array.from(item.querySelectorAll('.andes-money-amount__fraction'));
                    const mainPrices = priceEls.filter(el => !el.closest('.andes-money-amount--previous') && !el.closest('s'));
                    priceText = mainPrices.length > 0 ? mainPrices[0].innerText.trim() : '0';
                }

                const linkEl = item.querySelector('a');
                const link = linkEl ? linkEl.href : '';

                // Extraer código MLA del link para deduplicación
                const mlaMatch = link.match(/MLA-?(\d+)/i);
                const mlaId = mlaMatch ? `MLA${mlaMatch[1]}` : null;

                const imgEl = item.querySelector('img');
                let imgUrl = '';
                if (imgEl) {
                    imgUrl = imgEl.getAttribute('data-src') || imgEl.getAttribute('src');
                }

                // Financiación (cuotas)
                let installments = '';
                const instEl = item.querySelector('.poly-component__installments, .ui-search-item__group__element.ui-search-installments, [class*="installments"]');
                if (instEl) {
                    installments = instEl.innerText.trim();
                } else {
                    const allTexts = Array.from(item.querySelectorAll('span, p, div'));
                    const cuotas = allTexts.find(s => s.innerText && s.innerText.toLowerCase().includes('cuotas') && s.children.length === 0);
                    if (cuotas) {
                        installments = cuotas.innerText.trim();
                    }
                }
                installments = installments.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

                // Estado de Envío (Gratis / Full)
                // Usamos selectores precisos — evitamos innerHTML.includes() que generaba falsos positivos
                const shippingEl = item.querySelector('.poly-component__shipping, .ui-search-item__fulfillment');
                const hasFull = item.querySelector(
                    'svg.ui-search-icon--full, ' +
                    '.ui-search-item__fulfillment-icon--full, ' +
                    '.poly-shipping__status--full, ' +
                    '[data-testid="fulfillment"], ' +
                    '[aria-label="Full"]'
                ) !== null;
                let shippingStatus = '';
                if (shippingEl && shippingEl.innerText.toLowerCase().includes('gratis')) {
                    shippingStatus = 'Envío Gratis';
                }
                if (hasFull) {
                    shippingStatus = shippingStatus ? shippingStatus + ' ⚡ Full' : '⚡ Full';
                }

                // Vendedor (múltiples estrategias con fallback)
                let seller = '';
                let isTiendaOficial = false;
                const polySellerEl = item.querySelector('.poly-component__seller');
                if (polySellerEl) {
                    seller = polySellerEl.innerText.trim();
                    isTiendaOficial = polySellerEl.querySelector('[aria-label="Tienda oficial"]') !== null;
                } else {
                    // Fallback para layout clásico (tiendas oficiales)
                    const officialEl = item.querySelector('.ui-search-official-store-label, .ui-search-item__brand-discoverability-label');
                    if (officialEl) {
                        seller = officialEl.innerText.trim();
                        isTiendaOficial = true;
                    }
                }
                const isAd = item.querySelector('.poly-component__ads-promotions') !== null;
                if (!seller && isAd) seller = 'Publicidad';

                // Stock / Destacado (badges visibles en el listing)
                let stock = '';
                // Primero buscar "últimas X unidades" en texto plano
                const allSpans = Array.from(item.querySelectorAll('span, p'));
                const stockTextEl = allSpans.find(el => {
                    if (el.children.length !== 0) return false;
                    const txt = el.innerText ? el.innerText.trim().toLowerCase() : '';
                    return (txt.includes('última') || txt.includes('últim')) &&
                           (txt.includes('unidad') || txt.includes('disponible'));
                });
                if (stockTextEl) {
                    stock = stockTextEl.innerText.trim();
                } else {
                    // Fallback: badge destacado (.poly-component__highlight)
                    const highlightEl = item.querySelector('.poly-component__highlight');
                    if (highlightEl) stock = highlightEl.innerText.trim();
                }

                return {
                    title,
                    price: `$ ${priceText}`,
                    originalPrice,
                    link,
                    mlaId,
                    image: imgUrl,
                    installments,
                    shippingStatus,
                    seller,
                    isTiendaOficial,
                    stock
                };
            });
        });

        // Deduplicar por código MLA (evita productos repetidos en el listado)
        const seen = new Set();
        const results = rawResults.filter(item => {
            if (!item.mlaId) return true; // sin MLA ID lo dejamos pasar
            if (seen.has(item.mlaId)) return false;
            seen.add(item.mlaId);
            return true;
        }).slice(0, 20);

        console.log(`Resultados extraídos: ${results.length}`);
        await browser.close();
        res.json({ results });

    } catch (error) {
        console.error('Error crítico durante el proceso:', error.message);
        if (browser) await browser.close();
        res.status(500).json({ error: 'Error interno del scraper.', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
