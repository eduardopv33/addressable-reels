/* ===========================================================================
   Addressable · la voz pone el reloj

   Toma un guion (una frase por paso), lo manda a ElevenLabs con la voz Daniel,
   y devuelve dos cosas: el MP3 y el mismo guion con t0 y t1 por paso, sacados
   de las marcas de tiempo reales de la locucion.

   Por que asi: hasta ahora los tiempos salian de contar palabras y estimar una
   velocidad de lectura. Con voz eso no sirve. Si el dibujo no cae donde cae la
   frase, se nota en el primer segundo. ElevenLabs devuelve el instante exacto
   en que se dijo cada caracter; de ahi salen los cortes, sin estimar nada.

   La llave NO vive aqui ni en el repo: se lee de ELEVENLABS_API_KEY.

   Uso:
     ELEVENLABS_API_KEY=... node voz.js guion.json out/voz.mp3 contenido-flujo.json
     node voz.js guion.json --seco contenido-flujo.json

   --seco no llama a nadie: estima los tiempos por lectura para poder trabajar
   el movimiento sin gastar caracteres del plan. Sirve para iterar, no para la
   pieza final.
   =========================================================================== */

const fs = require('fs');
const path = require('path');

/* Daniel. La voz quedo elegida antes de escribir esto; vive aqui como dato,
   no como decision que se vuelva a tomar en cada corrida. */
/* Que voz se usa.

   El ID vive en voz.local.json, que no va a git. No es una credencial —una voz
   clonada esta atada a su cuenta y nadie la usa con solo el ID— pero este
   repositorio es publico y el identificador de la voz de una persona no tiene
   por que estar ahi. El archivo local es {"voz": "..."}.

   Se probaron tres voces antes de la actual: una de narrador grave
   angloparlante, que sobre frases cortas y fondo oscuro hacia sonar la pieza
   entera a trailer de terror; otra conversacional que ya funcionaba; y
   finalmente la voz clonada de Eduardo, que es la que quedo. Con su voz las
   piezas dejan de tener un narrador y pasan a ser el fundador explicando. */
function vozElegida() {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  const local = path.join(__dirname, 'voz.local.json');
  if (fs.existsSync(local)) {
    try {
      const v = JSON.parse(fs.readFileSync(local, 'utf8')).voz;
      if (v) return v;
    } catch (e) { /* si esta roto, se avisa abajo */ }
  }
  console.error('No se que voz usar. Crea voz.local.json con {"voz": "tu-id"},\n' +
    'o define ELEVENLABS_VOICE_ID en el entorno.');
  process.exit(1);
}
const MODELO = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

/* Como lee, no solo quien lee.

   A velocidad 1.0 y con frases cortas, una voz grave declama: suena a tráiler
   de pelicula, no a alguien contandote algo. Subir un poco la velocidad es lo
   mas directo contra ese tono. La estabilidad alta aplana la entonacion, que
   tambien ayuda: el drama vive en las subidas y bajadas.

   Son perillas a proposito. Cambiar esto cuesta una llamada, no una edicion. */
const VELOCIDAD = Number(process.env.VOZ_VELOCIDAD || 1.13);
const ESTABILIDAD = Number(process.env.VOZ_ESTABILIDAD || 0.62);
const PARECIDO = Number(process.env.VOZ_PARECIDO || 0.8);

/* cuanto sostiene el plano final despues de la ultima palabra */
const COLA = 1.8;

const GUION = process.argv[2];
const DESTINO_AUDIO = process.argv[3];
const DESTINO_CONTENIDO = process.argv[4];
const SECO = DESTINO_AUDIO === '--seco';

/* se resuelve despues de saber si es modo seco: en seco no hace falta voz */
const VOZ = SECO ? '(ninguna)' : vozElegida();

if (!GUION || !DESTINO_AUDIO || !DESTINO_CONTENIDO) {
  console.error('Uso: node voz.js <guion.json> <salida.mp3|--seco> <contenido.json>');
  process.exit(1);
}

/* Como se dice lo que no se escribe como suena.

   La marca se escribe Addressable y se lee a-dre-SA-ble. El modelo, viendo la
   grafia inglesa, la pronuncia en ingles en medio de una frase en espanol.

   Esto cambia unicamente el texto que se MANDA a locutar. El guion, lo que va
   en pantalla y lo que queda guardado siguen diciendo Addressable: una cosa es
   como se escribe una marca y otra como se pronuncia, y mezclarlas ensucia el
   registro editorial. */
const PRONUNCIACION = {
  'Addressable': 'Adresable',
};

function comoSeDice(frase) {
  let s = frase;
  for (const escrito in PRONUNCIACION) {
    s = s.split(escrito).join(PRONUNCIACION[escrito]);
  }
  return s;
}

/* Las frases van separadas por un espacio y nada mas. Nada de puntuacion
   agregada: lo que se manda es exactamente lo que se mide. */
function armarTexto(pasos) {
  const trozos = [];
  const rangos = [];
  let pos = 0;
  pasos.forEach(function (p, i) {
    const frase = comoSeDice(String(p.narracion || '').trim().replace(/\s+/g, ' '));
    if (!frase) throw new Error('el paso ' + (i + 1) + ' no tiene narracion');
    if (i > 0) pos += 1;
    rangos.push({ desde: pos, hasta: pos + frase.length - 1 });
    trozos.push(frase);
    pos += frase.length;
  });
  return { texto: trozos.join(' '), rangos: rangos };
}

/* --- modo seco: tiempos estimados, sin llamar a nadie ---------------------- */
function tiemposEstimados(pasos) {
  /* El ritmo depende de la voz, asi que esto se calibra contra locuciones
     reales y hay que rehacerlo si se cambia de voz. Con la voz clonada de
     Eduardo a velocidad 1.08: 113 palabras en 32,3 s, o sea 3,5 palabras por
     segundo. La voz anterior iba a 2,64 y con ese numero el ensayo salia
     trece segundos mas largo que la pieza — suficiente para juzgar mal el
     ritmo de un guion que en realidad estaba bien. */
  /* se escala con la velocidad para que el ensayo no mienta al subirla */
  const RITMO = Number(process.env.VOZ_PALABRAS_POR_SEGUNDO || 3.5 * (VELOCIDAD / 1.08));
  let t = 0.35;
  return pasos.map(function (p) {
    const palabras = String(p.narracion).split(/\s+/).filter(Boolean).length;
    const d = palabras / RITMO + 0.15;
    const r = { t0: +t.toFixed(3), t1: +(t + d).toFixed(3) };
    t = r.t1;
    return r;
  });
}

/* --- modo real ------------------------------------------------------------ */
async function tiemposDeLaVoz(texto, rangos) {
  const llave = process.env.ELEVENLABS_API_KEY;
  if (!llave) {
    throw new Error('Falta ELEVENLABS_API_KEY en el entorno. No la escribas en el repo.');
  }

  const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + VOZ + '/with-timestamps', {
    method: 'POST',
    headers: { 'xi-api-key': llave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texto,
      model_id: MODELO,
      voice_settings: {
        stability: ESTABILIDAD, similarity_boost: PARECIDO, style: 0, speed: VELOCIDAD,
      },
    }),
  });

  if (!r.ok) {
    const cuerpo = await r.text();

    /* Trampa facil de pisar: el panel de ElevenLabs muestra el ID de la llave,
       no la llave. La llave completa solo se ve al crearla o rotarla. */
    if (cuerpo.indexOf('api_key_id_used_as_api_key') > -1) {
      throw new Error(
        'Esa no es la llave, es el ID de la llave.\n' +
        'El panel de ElevenLabs muestra el ID; la llave completa (empieza con "sk_")\n' +
        'solo aparece en el momento de crearla o rotarla.\n' +
        'En ElevenLabs > API Keys: Create API Key, y copiala ahi mismo.');
    }

    /* el cuerpo puede traer detalle util; la llave no viaja en el, pero por si
       acaso no se vuelca entero: solo el principio */
    throw new Error('ElevenLabs respondio ' + r.status + ': ' + cuerpo.slice(0, 300));
  }

  const j = await r.json();
  const a = j.alignment;
  if (!a || !Array.isArray(a.characters)) {
    throw new Error('la respuesta no trae alignment');
  }

  /* Si los caracteres que devuelve no son exactamente los que se mandaron, los
     indices no significan nada y los cortes saldrian corridos. Mejor fallar. */
  const devuelto = a.characters.join('');
  if (devuelto !== texto) {
    throw new Error('el texto alineado no coincide con el enviado (' +
      devuelto.length + ' vs ' + texto.length + ' caracteres)');
  }

  const inicio = a.character_start_times_seconds;
  const fin = a.character_end_times_seconds;

  const crudos = rangos.map(function (r2) {
    return { t0: inicio[r2.desde], t1: fin[r2.hasta] };
  });

  return {
    tiempos: crudos,
    audio: Buffer.from(j.audio_base64, 'base64'),
    largo: fin[fin.length - 1],
  };
}

/* Los pasos tienen que partir la linea de tiempo sin huecos: si entre una
   frase y la siguiente queda un vacio, la camara se queda a medio camino
   esperando, y eso se ve. Cada paso dura hasta que empieza el siguiente. */
function pegarTiempos(crudos) {
  return crudos.map(function (c, i) {
    return {
      t0: +(i === 0 ? 0 : crudos[i].t0).toFixed(3),
      t1: +(i < crudos.length - 1 ? crudos[i + 1].t0 : crudos[i].t1 + COLA).toFixed(3),
    };
  });
}

(async () => {
  const guion = JSON.parse(fs.readFileSync(GUION, 'utf8'));
  const pasos = guion.pasos || [];

  /* La puerta va antes de la llamada, no despues: un guion incoherente que se
     detecta despues de locutarlo ya costo caracteres y nueve minutos de
     render. Aqui no cuesta nada. */
  const { qaFlujo } = require('./qa-flujo');
  const qa = qaFlujo(guion, guion.fuente || '');
  if (!qa.qa_ok) {
    console.error('\nEl guion no pasa el QA. No se llamo a nadie.\n');
    qa.motivos.forEach(function (m) { console.error('  - ' + m); });
    console.error('\n(' + qa.motivos.length + ' motivos)');
    process.exit(1);
  }
  if (!guion.fuente) {
    console.log('aviso: el guion no trae "fuente", asi que no se pudo revisar ' +
      'si las cifras estan inventadas\n');
  }

  const { texto, rangos } = armarTexto(pasos);

  console.log('voz: ' + (SECO ? '(seco, sin llamar)'
    : VOZ + '  ' + MODELO + '  velocidad ' + VELOCIDAD + '  estabilidad ' + ESTABILIDAD));
  console.log('texto: ' + texto.length + ' caracteres, ' + pasos.length + ' frases\n');

  let crudos, audio = null, largo = null;
  if (SECO) {
    crudos = tiemposEstimados(pasos);
  } else {
    const r = await tiemposDeLaVoz(texto, rangos);
    crudos = r.tiempos; audio = r.audio; largo = r.largo;
    fs.mkdirSync(path.dirname(DESTINO_AUDIO), { recursive: true });
    fs.writeFileSync(DESTINO_AUDIO, audio);
    console.log('audio: ' + DESTINO_AUDIO + '  ' +
      Math.round(audio.length / 1024) + ' KB  ' + largo.toFixed(2) + ' s habladas\n');
  }

  const tiempos = pegarTiempos(crudos);

  /* La ruta del audio se guarda relativa al archivo de contenido, que es desde
     donde la resuelve render.js. Con el nombre pelado no la encuentra: el MP3
     suele quedar en out/ y el contenido en la raiz. */
  const rutaAudio = SECO ? null : path
    .relative(path.dirname(path.resolve(DESTINO_CONTENIDO)), path.resolve(DESTINO_AUDIO))
    .replace(/\\/g, '/');

  const salida = {
    referencia: guion.referencia || 'sin-referencia',
    voz: SECO ? null : VOZ,
    audio: rutaAudio,
    pasos: pasos.map(function (p, i) {
      const q = Object.assign({}, p);
      q.t0 = tiempos[i].t0;
      q.t1 = tiempos[i].t1;
      return q;
    }),
  };

  fs.writeFileSync(DESTINO_CONTENIDO, JSON.stringify(salida, null, 2) + '\n');

  salida.pasos.forEach(function (p, i) {
    console.log('  ' + String(i + 1).padStart(2) + '  ' +
      p.t0.toFixed(2).padStart(6) + ' → ' + p.t1.toFixed(2).padStart(6) + '  ' +
      (p.t1 - p.t0).toFixed(2).padStart(5) + ' s   ' + p.narracion);
  });
  console.log('\ntotal ' + salida.pasos[salida.pasos.length - 1].t1.toFixed(2) + ' s');
  console.log('contenido: ' + DESTINO_CONTENIDO);
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
