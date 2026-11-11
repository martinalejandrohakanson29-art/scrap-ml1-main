// instalar.js — Deja una PC nueva lista para analizar competencia de ML con Claude Code.
//   npm run instalar
// 1. Verifica Node, Chrome y que tienda-martin esté al lado (../tienda-martin) con su .env.
// 2. Instala la skill "competencia-ml" en ~/.claude/skills con las rutas de ESTA PC.
// 3. Indica los pasos manuales que falten (npm install en tienda-martin, login en ML).
// No modifica nada fuera de ~/.claude/skills/competencia-ml.
const fs = require('fs')
const os = require('os')
const path = require('path')

const SCRAPER_DIR = __dirname
const TIENDA_DIR = path.resolve(process.env.TIENDA_DIR || path.join(__dirname, '..', 'tienda-martin'))
const pendientes = []
const ok = (m) => console.log(`  ✅ ${m}`)
const falta = (m, paso) => { console.log(`  ❌ ${m}`); if (paso) pendientes.push(paso) }

console.log('\n=== Instalación de competencia ML ===\n')

// Node
const mayor = parseInt(process.versions.node.split('.')[0], 10)
mayor >= 18 ? ok(`Node ${process.versions.node}`) : falta(`Node ${process.versions.node} (hace falta 18 o más)`, 'Instalar Node 20 LTS desde nodejs.org')

// Dependencias del scraper
fs.existsSync(path.join(SCRAPER_DIR, 'node_modules', 'playwright'))
    ? ok('Dependencias del scraper instaladas')
    : falta('Faltan dependencias del scraper', `cd "${SCRAPER_DIR}" && npm install`)

// Chrome (el scraper usa el Chrome instalado: ML bloquea al Chromium de Playwright)
const chromes = process.platform === 'win32'
    ? [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
        .filter(Boolean).map(d => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    : ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
chromes.some(c => fs.existsSync(c))
    ? ok('Google Chrome instalado')
    : falta('No encuentro Google Chrome', 'Instalar Google Chrome (google.com/chrome)')

// tienda-martin al lado
if (fs.existsSync(path.join(TIENDA_DIR, 'scripts', 'ml-competencia.ts'))) {
    ok(`tienda-martin en ${TIENDA_DIR}`)
    fs.existsSync(path.join(TIENDA_DIR, 'node_modules'))
        ? ok('Dependencias de tienda-martin instaladas')
        : falta('Faltan dependencias de tienda-martin', `cd "${TIENDA_DIR}" && npm install && npx prisma generate`)
    fs.existsSync(path.join(TIENDA_DIR, '.env'))
        ? ok('tienda-martin/.env presente')
        : falta('Falta tienda-martin/.env (base de datos y token de ML)', `Copiar el .env de tienda-martin desde la PC original y seguir ${path.join(TIENDA_DIR, 'docs', 'CONECTAR-PC-NUEVA.md')} (Tailscale)`)
} else {
    falta(`No encuentro tienda-martin en ${TIENDA_DIR}`,
        `Clonarlo al lado: cd "${path.dirname(SCRAPER_DIR)}" && git clone https://github.com/martinalejandrohakanson29-art/tienda-martin.git (o definir TIENDA_DIR)`)
}

// Skill de Claude Code con las rutas de esta PC
try {
    const origen = path.join(SCRAPER_DIR, 'claude-skill', 'competencia-ml', 'SKILL.md')
    const destinoDir = path.join(os.homedir(), '.claude', 'skills', 'competencia-ml')
    const texto = fs.readFileSync(origen, 'utf8')
        .replace(/\{\{TIENDA_DIR\}\}/g, TIENDA_DIR)
        .replace(/\{\{SCRAPER_DIR\}\}/g, SCRAPER_DIR)
    fs.mkdirSync(destinoDir, { recursive: true })
    fs.writeFileSync(path.join(destinoDir, 'SKILL.md'), texto)
    ok(`Skill de Claude instalada en ${destinoDir}`)
} catch (e) {
    falta(`No se pudo instalar la skill: ${e.message}`)
}

// Perfil de Chrome con sesión de ML
fs.existsSync(path.join(SCRAPER_DIR, '.perfil-ml'))
    ? ok('Perfil de Chrome para ML creado')
    : pendientes.push(`Primera vez: cd "${SCRAPER_DIR}" && node consulta.js "tapa cdi"  → si dice que ML pide iniciar sesión: node consulta.js --login`)

console.log(pendientes.length ? '\nPasos que faltan:' : '\nTodo listo. Abrí Claude Code y preguntá: "qué ves de la tapa cdi en mercadolibre"')
pendientes.forEach((p, i) => console.log(`  ${i + 1}. ${p}`))
console.log(pendientes.length ? '\nDespués volvé a correr: npm run instalar\n' : '')
