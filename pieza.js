/* ===========================================================================
   Addressable · la pieza completa, de un tiron

   Hace los dos pasos seguidos: pide la locucion y renderiza con los tiempos
   que salieron de ella. Existe solo para que armar una pieza sea un comando y
   no tres, porque tres comandos en orden es una forma barata de equivocarse.

   Cada paso sigue viviendo en su propio archivo y se puede correr suelto:
   voz.js para solo la locucion, render.js para solo el video.

   Uso:
     $env:ELEVENLABS_API_KEY = "..."
     node pieza.js guion-commerce-partido.json

   La llave se lee del entorno y no se escribe en ningun archivo.
   =========================================================================== */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GUION = process.argv[2];
if (!GUION) {
  console.error('Uso: node pieza.js <guion.json> [salida.mp4]');
  process.exit(1);
}
if (!fs.existsSync(GUION)) {
  console.error('No encuentro ' + GUION);
  process.exit(1);
}

const nombre = path.basename(GUION).replace(/^guion-/, '').replace(/\.json$/, '');
const AUDIO = path.join('out', nombre + '.mp3');
const CONTENIDO = 'contenido-' + nombre + '.json';
const SALIDA = process.argv[3] || path.join('out', nombre + '.mp4');

/* La llave solo hace falta si de verdad se va a llamar. Pedirla cuando la
   locucion se va a reutilizar frena un render que no costaba nada. */

/* El hijo ya imprimio el error de verdad. Dejar que la excepcion suba hasta
   node agrega treinta lineas de stack interno que no le dicen nada a nadie y
   entierran el mensaje util. */
function paso(titulo, args, extra) {
  console.log('\n── ' + titulo + '\n');
  try {
    execFileSync(process.execPath, args, {
      stdio: 'inherit',
      env: Object.assign({}, process.env, extra || {}),
    });
  } catch (e) {
    console.error('\nSe corto en: ' + titulo + '. El motivo esta arriba.');
    process.exit(1);
  }
}

/* Quien decide si hay que volver a grabar es voz.js, no esto: los ajustes que
   determinan el audio —voz, velocidad, pronunciacion— viven alli. Cuando esa
   decision se tomaba aqui, comparando fechas de archivo, un cambio de
   velocidad reutilizo el MP3 viejo sin avisar. */
paso('1/2  locucion y tiempos', ['voz.js', GUION, AUDIO, CONTENIDO]);

const VISTA = process.env.VISTA === '1';
paso('2/2  render' + (VISTA ? '  (vista previa, unos 3 minutos y medio)'
                            : '  (calidad final, unos 10 minutos)'),
  ['render.js', CONTENIDO, SALIDA], { MOTION: 'flujo.html' });

console.log('\nlisto: ' + SALIDA);
