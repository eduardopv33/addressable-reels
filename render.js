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
const ANCHO = 1080, ALTO = 1920;

/* Modo vista previa: VISTA=1.

   La pieza final son diez minutos de render y casi todo se va en rasterizar
   1080x1920 novecientas veces. A la mitad de resolucion el cuadro cuesta 257 ms
   en vez de 593 — medido, no estimado — y con 24 cuadros por segundo y un
   encode rapido la espera baja a unos tres minutos y medio.

   Sale a 540x960: se ve perfecto en un telefono para decidir si el guion y el
   movimiento funcionan. No sirve para publicar. */
const VISTA = process.env.VISTA === '1';
const FPS = VISTA ? 24 : 30;
const DPR = VISTA ? 0.5 : 1;
const PRESET = VISTA ? 'veryfast' : 'slow';
const CRF = VISTA ? '26' : '18';

/* Que sistema de movimiento se fotografia. motion.html son las tarjetas de
   texto; flujo.html es el flujo narrado con camara. */
const MOTION = process.env.MOTION || 'motion.html';

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
  /* dos formatos, dos contratos: motion.html lee beats, flujo.html lee pasos */
  const piezas = contenido.beats || contenido.pasos;
  if (!Array.isArray(piezas) || piezas.length < 3) {
    throw new Error('El contenido necesita al menos 3 beats (o pasos).');
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
  await pagina.setViewport({ width: ANCHO, height: ALTO, deviceScaleFactor: DPR });

  // el contenido se inyecta ANTES de que corra el script de la pagina
  await pagina.evaluateOnNewDocument((c) => { window.CONTENIDO = c; }, contenido);
  await pagina.goto('file://' + path.join(RAIZ, 'motion', MOTION).replace(/\\/g, '/') + '?render=1',
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

  /* La pista de voz, si la hay. El contenido la nombra y vive al lado suyo; la
     escribe voz.js junto con los tiempos que salieron de esa misma locucion.
     apad la estira con silencio, para que la cola del plano final no corte el
     video por venir el audio mas corto. */
  const audio = contenido.audio
    ? path.resolve(path.dirname(ENTRADA), contenido.audio)
    : null;
  const conVoz = !!(audio && fs.existsSync(audio));
  if (contenido.audio && !conVoz) {
    throw new Error('El contenido pide el audio ' + contenido.audio + ' y no esta en ' + audio);
  }

  const args = ['-y', '-framerate', String(FPS), '-i', path.join(TMP, 'f%05d.png')];
  if (conVoz) args.push('-i', audio);
  args.push('-c:v', 'libx264', '-preset', PRESET, '-crf', CRF,
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1');
  /* -t fija el largo exacto en vez de confiar en -shortest: apad deja el audio
     infinito y con -shortest el corte depende de la version de ffmpeg */
  if (conVoz) args.push('-c:a', 'aac', '-b:a', '192k', '-af', 'apad', '-t', plan.dur.toFixed(3));
  else args.push('-an');
  args.push('-movflags', '+faststart', SALIDA);

  execFileSync(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  fs.rmSync(TMP, { recursive: true, force: true });

  const kb = Math.round(fs.statSync(SALIDA).size / 1024);
  console.log(`\nlisto: ${SALIDA}`);
  console.log(`${Math.round(ANCHO * DPR)}x${Math.round(ALTO * DPR)} · ${FPS} fps · ` +
    `${plan.dur.toFixed(1)} s · ${kb} KB · ` + (conVoz ? 'con voz' : 'sin audio') +
    (VISTA ? '  ·  VISTA PREVIA, no sirve para publicar' : ''));

  // lo recoge el workflow para devolverselo a n8n
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `duracion=${plan.dur.toFixed(1)}\ntamano_kb=${kb}\n`);
  }
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
