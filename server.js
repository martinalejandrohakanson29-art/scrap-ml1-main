const express = require('express');
const cors = require('cors');
const { scraperML, scraperSellerCategories, scraperSellerProducts } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

app.get('/api/search', async (req, res) => {
    const keyword = req.query.q;

    if (!keyword) {
        return res.status(400).json({ error: 'Falta la palabra clave para la búsqueda' });
    }

    try {
        console.log(`--- NUEVA BÚSQUEDA ---`);
        const results = await scraperML(keyword);
        res.json({ results });
    } catch (error) {
        console.error('Error crítico durante el proceso:', error.message);
        res.status(500).json({ error: 'Error interno del scraper.', details: error.message });
    }
});

app.get('/api/seller/categories', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'Falta el parámetro url' });

    try {
        console.log('--- CARGAR VENDEDOR ---');
        const data = await scraperSellerCategories(url);
        res.json(data);
    } catch (err) {
        console.error('Error en seller/categories:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/seller/products', async (req, res) => {
    const { url, offset, sort } = req.query;
    if (!url) return res.status(400).json({ error: 'Falta el parámetro url' });

    try {
        console.log('--- PRODUCTOS VENDEDOR ---');
        const data = await scraperSellerProducts(url, parseInt(offset) || 0, sort || '');
        res.json(data);
    } catch (err) {
        console.error('Error en seller/products:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
