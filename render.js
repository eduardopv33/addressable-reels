/* ===========================================================================
   Addressable · render del Reel
   contenido.json  ->  cuadros desde motion.html  ->  reel.mp4

   Corre igual en tu maquina y en GitHub Actions: Chrome headless captura los
   cuadros y ffmpeg los une. Sin pista de audio, a proposito: la musica se le
   pone en Instagram al subirlo, si se quiere.

   Uso:  node render.js [ruta-del-contenido.json] [salida.mp4]
   =========================================================================== */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const puppeteer = require('puppeteer-core');

const RAIZ = __dirname;
const TMP = path.join(RAIZ, 'tmp');
const FPS = 30, ANCHO = 1080, ALTO = 1920;

const ENTRADA = process.argv[2] || path.join(RAIZ, 'contenido.json');
const SALIDA = process.argv[3] || path.join(RAIZ, 'out', 'reel.mp4');

/* Chrome: en Actions viene preinstalado, en Windows esta en Program Files. */
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
  const hallado = candidatos.find(p => fs.existsSync(p));
  if (!hallado) throw new Error('No encuentro Chrome. Define CHROME_PATH.');
  return hallado;
}

(async () => {
  const contenido = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));
  if (!Array.isArray(contenido.beats) || contenido.beats.length < 3) {
    throw new Error('El contenido necesita al menos 3 beats.');
  }

  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  for (const f of fs.readdirSync(TMP)) fs.unlinkSync(path.join(TMP, f));

  const navegador = await puppeteer.launch({
    executablePath: buscarChrome(),
    headless: 'new',
    args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu', '--no-sandbox'],
  });
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: ANCHO, height: ALTO, deviceScaleFactor: 1 });

  // el contenido se inyecta ANTES de que corra el script de la pagina
  await pagina.evaluateOnNewDocument((c) => { window.CONTENIDO = c; }, contenido);
  await pagina.goto('file://' + path.join(RAIZ, 'motion', 'motion.html').replace(/\\/g, '/') + '?render=1',
    { waitUntil: 'networkidle0' });

  // Sin las tipografias correctas la pieza no es de la marca: fallar fuerte.
  // Hay que PEDIRLAS: el navegador solo descarga una fuente cuando algo visible
  // la usa, y el kicker del primer beat puede venir vacio.
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
  console.log('tiempos de lectura:');
  plan.beats.forEach((b, i) => console.log(`   ${i + 1}. ${(b.t1 - b.t0).toFixed(2)} s  ${b.texto}`));
  console.log(`   total ${plan.dur.toFixed(2)} s\n`);

  const total = Math.round(plan.dur * FPS);
  const marco = await pagina.$('#stage');
  for (let f = 0; f < total; f++) {
    await pagina.evaluate((t) => window.cuadro(t), f / FPS);
    await marco.screenshot({ path: path.join(TMP, `f${String(f).padStart(5, '0')}.png`) });
    if (f % 150 === 0) console.log(`   cuadro ${f}/${total}`);
  }
  await navegador.close();

  execFileSync(ffmpeg, ['-y',
    '-framerate', String(FPS), '-i', path.join(TMP, 'f%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
    '-an', '-movflags', '+faststart', SALIDA], { stdio: ['ignore', 'pipe', 'pipe'] });

  fs.rmSync(TMP, { recursive: true, force: true });

  const kb = Math.round(fs.statSync(SALIDA).size / 1024);
  console.log(`\nlisto: ${SALIDA}`);
  console.log(`${ANCHO}x${ALTO} · ${FPS} fps · ${plan.dur.toFixed(1)} s · ${kb} KB · sin audio`);

  // lo recoge el workflow para devolverselo a n8n
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `duracion=${plan.dur.toFixed(1)}\ntamano_kb=${kb}\n`);
  }
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
