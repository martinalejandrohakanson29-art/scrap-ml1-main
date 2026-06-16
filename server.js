const express = require('express');
const cors = require('cors');
const { scraperML } = require('./scraper');

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

app.listen(PORT, () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
