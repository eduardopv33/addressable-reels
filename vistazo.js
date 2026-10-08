/* ===========================================================================
   Addressable · vistazo

   Fotografia un cuadro de cada paso, no la pieza entera. Renderizar 45 segundos
   son 1350 capturas y varios minutos; para ver si la composicion esta bien
   bastan siete. Sirve para corregir diseno sin esperar.

   Uso:  MOTION=flujo.html node vistazo.js [ruta-del-contenido.json]
   Salida: vistazo/NN-etiqueta.png
   =========================================================================== */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const RAIZ = __dirname;
const SALIDA = path.join(RAIZ, 'vistazo');
const MOTION = process.env.MOTION || 'motion.html';
const ANCHO = 1080, ALTO = 1920;

/* escala de la captura: 0.5 pesa un cuarto y alcanza para juzgar composicion */
const ESCALA = Number(process.env.ESCALA || 0.5);

function buscarChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidatos = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  const hallado = candidatos.find((p) => fs.existsSync(p));
  if (!hallado) throw new Error('No encuentro Chrome. Define CHROME_PATH.');
  return hallado;
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  for (const f of fs.readdirSync(SALIDA)) fs.unlinkSync(path.join(SALIDA, f));

  const navegador = await puppeteer.launch({
    executablePath: buscarChrome(),
    headless: 'new',
    args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu', '--no-sandbox'],
  });
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: ANCHO, height: ALTO, deviceScaleFactor: 1 });

  if (process.argv[2]) {
    const contenido = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    await pagina.evaluateOnNewDocument((c) => { window.CONTENIDO = c; }, contenido);
  }

  await pagina.goto('file://' + path.join(RAIZ, 'motion', MOTION).replace(/\\/g, '/') + '?render=1',
    { waitUntil: 'networkidle0' });

  await pagina.evaluate(async () => {
    await Promise.all([
      document.fonts.load('800 100px Montserrat'),
      document.fonts.load('700 100px Montserrat'),
      document.fonts.load('500 32px "IBM Plex Sans"'),
      document.fonts.load('400 32px "IBM Plex Sans"'),
    ]);
    await document.fonts.ready;
  });
  const tipos = await pagina.evaluate(() => ({
    montserrat: document.fonts.check('800 100px Montserrat'),
    plex: document.fonts.check('500 32px "IBM Plex Sans"'),
  }));
  if (!tipos.montserrat || !tipos.plex) {
    throw new Error('No cargaron las tipografias de marca: ' + JSON.stringify(tipos));
  }

  const plan = await pagina.evaluate(() => window.plan());
  const marco = await pagina.$('#stage');
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));

  console.log(MOTION + '   ' + plan.beats.length + ' pasos   ' + plan.dur.toFixed(1) + ' s\n');

  for (let i = 0; i < plan.beats.length; i++) {
    const b = plan.beats[i];
    /* ya asentado el movimiento de entrada, antes de que empiece a salir */
    const t = b.t0 + (b.t1 - b.t0) * 0.72;
    await pagina.evaluate((x) => window.cuadro(x), t);

    const etiqueta = (b.texto || 'paso').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 34) || 'paso';
    const archivo = path.join(SALIDA, String(i + 1).padStart(2, '0') + '-' + etiqueta + '.png');

    await marco.screenshot({ path: archivo, scale: ESCALA });
    console.log('  ' + String(i + 1).padStart(2) + '  ' + t.toFixed(2) + ' s  ' +
      (b.t1 - b.t0).toFixed(2) + ' s de largo   ' + b.texto);
  }

  /* un cuadro en plena transicion: ahi se ven los saltos de camara */
  if (plan.beats.length > 2) {
    const b = plan.beats[2];
    await pagina.evaluate((x) => window.cuadro(x), b.t0 + 0.18);
    await marco.screenshot({ path: path.join(SALIDA, '99-transicion.png'), scale: ESCALA });
    console.log('  99  ' + (b.t0 + 0.18).toFixed(2) + ' s  (en plena transicion)');
  }

  await navegador.close();

  if (errores.length) {
    console.error('\nerrores de la pagina:\n  ' + errores.join('\n  '));
    process.exit(1);
  }
  console.log('\n' + fs.readdirSync(SALIDA).length + ' capturas en vistazo/');
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
