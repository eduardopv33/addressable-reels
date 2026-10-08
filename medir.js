/* ===========================================================================
   Addressable · cuanto cuesta un cuadro

   Renderizar 30 segundos son 900 capturas. Si cada una cuesta medio segundo la
   pieza tarda ocho minutos; si cuesta cinco, tarda mas de una hora y en Actions
   no es viable. Esto mide el costo real antes de pagarlo.

   Uso:  MOTION=flujo.html node medir.js [contenido.json] [cuantos]
   =========================================================================== */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const RAIZ = __dirname;
const MOTION = process.env.MOTION || 'motion.html';
const CUANTOS = Number(process.argv[3] || 40);
const FPS = 30;

function buscarChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidatos = [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser', '/usr/bin/chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  const hallado = candidatos.find((p) => fs.existsSync(p));
  if (!hallado) throw new Error('No encuentro Chrome. Define CHROME_PATH.');
  return hallado;
}

(async () => {
  const navegador = await puppeteer.launch({
    executablePath: buscarChrome(),
    headless: 'new',
    args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu', '--no-sandbox'],
  });
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 1080, height: 1920,
    deviceScaleFactor: Number(process.env.DPR || 1) });

  if (process.argv[2]) {
    const c = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    await pagina.evaluateOnNewDocument((x) => { window.CONTENIDO = x; }, c);
  }
  await pagina.goto('file://' + path.join(RAIZ, 'motion', MOTION).replace(/\\/g, '/') + '?render=1',
    { waitUntil: 'networkidle0' });
  await pagina.evaluate(async () => {
    await Promise.all([
      document.fonts.load('800 100px Montserrat'),
      document.fonts.load('500 32px "IBM Plex Sans"'),
    ]);
    await document.fonts.ready;
  });

  const plan = await pagina.evaluate(() => window.plan());
  const marco = await pagina.$('#stage');
  const total = Math.round(plan.dur * FPS);

  /* Se miden cuadros repartidos por toda la pieza, no los primeros: el costo
     cambia segun cuantas cajas haya visibles a la vez.

     La captura NO se escribe a disco. Este repositorio vive dentro de OneDrive
     y escribir un PNG por cuadro mete al sincronizador en la medicion: los
     numeros salen altos y, peor, inconsistentes entre corridas. Aqui se mide
     lo que cuesta dibujar y capturar, que es lo unico que se puede optimizar. */
  const arranque = Date.now();
  for (let n = 0; n < CUANTOS; n++) {
    const f = Math.floor((n / CUANTOS) * total);
    await pagina.evaluate((t) => window.cuadro(t), f / FPS);
    await marco.screenshot({ encoding: 'binary' });
  }
  const ms = (Date.now() - arranque) / CUANTOS;

  await navegador.close();

  const totalMin = (ms * total) / 60000;
  console.log(MOTION.padEnd(14) + ms.toFixed(0) + ' ms por cuadro   ' +
    total + ' cuadros (' + plan.dur.toFixed(1) + ' s)   ' +
    'la pieza entera: ' + totalMin.toFixed(1) + ' min');
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
