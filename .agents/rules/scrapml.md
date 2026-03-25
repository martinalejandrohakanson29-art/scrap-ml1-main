---
trigger: always_on
---

# Reglas de Oro: Scraper de Mercado Libre

- **Herramienta de Scraping:** Usa SIEMPRE la librería `playwright` para leer y extraer los datos. NUNCA uses otras alternativas como `puppeteer` o `cheerio`. Mercado Libre es una página dinámica y Playwright es nuestra única herramienta aprobada para esto.
- **Prevención de Bloqueos:** Siempre que uses Playwright, debes configurar un "User-Agent" que simule ser un navegador de escritorio moderno y real (como Chrome en Windows). Esto evitará que la página detecte que somos un robot y nos bloquee la búsqueda.
- **Protección del Servidor:** Usa `Express.js` para crear el servidor web. El servidor NUNCA debe colapsar o apagarse de golpe si hay un error al buscar un producto. Utiliza siempre bloques `try/catch` para atrapar los errores y mostrar un mensaje amigable en pantalla.
- **Idioma y Claridad:** Escribe todos los comentarios explicativos dentro del código y los mensajes de error para el usuario en Español.