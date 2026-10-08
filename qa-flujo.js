/* ===========================================================================
   QA del guion de flujo.

   Revisa la coherencia entre lo que se DICE y lo que se MUESTRA. Cada regla de
   aqui existe porque el error ya ocurrio en una pieza real, no porque se le
   ocurriera a alguien que podria ocurrir.

   Corre antes de llamar a ElevenLabs, que es donde empieza a costar dinero.

   El contrato tiene dos registros y se confunden facil:
     - la NARRACION se escucha. Frases completas, espanol natural.
     - el TEXTO EN PANTALLA se lee. Puede ser corto, pero tiene que sostenerse
       solo: quien mira sin sonido tambien tiene que entender.
   La mayoria de los fallos salen de tratarlos como si fueran lo mismo.
   =========================================================================== */

/* Cuanto cabe en una linea del titular a 80 px de Montserrat 800. No es un
   limite fino y no pretende serlo: el ancho real depende de que letras sean,
   y eso solo se ve renderizando. Aqui se atrapa el desborde grueso, el de una
   frase entera metida en una linea. Lo fino se mira con vistazo.js. */
const CHARS_LINEA = 19;
const MAX_LINEAS_TITULO = 3;

const NUMEROS = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };

/* Primera persona de agencia: convierte un caso editorial en un caso falso. */
const PROHIBIDAS = [
  'descubrimos', 'nuestro cliente', 'nuestros clientes', 'implementamos',
  'recuperamos', 'aumentamos', 'logramos', 'conseguimos', 'nuestra solucion',
];

function sinTildes(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/* Todo lo que se ve en pantalla en un paso, como un solo texto. */
function loQueSeVe(p) {
  const trozos = [p.rotulo, p.titulo, p.burbuja, p.sello, p.remate, p.pie];
  if (p.tarjeta) trozos.push(p.tarjeta.etiqueta, p.tarjeta.texto);
  if (p.nota) trozos.push(p.nota);
  if (p.fichas) trozos.push.apply(trozos, p.fichas);
  if (p.resumen) trozos.push.apply(trozos, p.resumen.map(function (f) { return f.txt; }));
  return trozos.filter(Boolean).join(' ');
}

function qaFlujo(guion, fuente) {
  const motivos = [];
  const pasos = (guion && guion.pasos) || [];
  const numerosFuente = new Set(String(fuente || '').match(/\d+/g) || []);

  if (pasos.length < 4) {
    return { qa_ok: false, motivos: ['el guion necesita al menos 4 pasos, llegaron ' + pasos.length] };
  }

  /* ---- estructura ------------------------------------------------------- */
  const hooks = pasos.filter(function (p) { return p.hook; }).length;
  const cierres = pasos.filter(function (p) { return p.cierre; }).length;
  if (hooks !== 1) motivos.push('tiene que haber exactamente un paso con hook, hay ' + hooks);
  if (cierres !== 1) motivos.push('tiene que haber exactamente un paso con cierre, hay ' + cierres);
  if (!pasos[0].hook) motivos.push('el primer paso tiene que ser el hook');
  if (!pasos[pasos.length - 1].cierre) motivos.push('el ultimo paso tiene que ser el cierre');

  /* Si la espina se parte, algo tiene que cerrarla. Una pieza que deja el
     riel roto termina diciendo que el problema no se resuelve. */
  const cortes = pasos.filter(function (p) { return p.corte; }).length;
  const sanas = pasos.filter(function (p) { return p.sana; }).length;
  if (cortes > 0 && sanas !== 1) {
    motivos.push('hay ' + cortes + ' cortes en la espina y ' + sanas +
      ' pasos que la cierran; tiene que haber exactamente uno');
  }

  /* la camara solo baja: un salto hacia atras se ve como un error de montaje */
  for (let i = 1; i < pasos.length; i++) {
    const a = pasos[i - 1].camara, b = pasos[i].camara;
    if (!a || !b || typeof b.y !== 'number') {
      motivos.push('paso ' + (i + 1) + ': le falta la posicion de camara');
    } else if (b.y <= a.y) {
      motivos.push('paso ' + (i + 1) + ': la camara sube o se queda quieta (y=' +
        b.y + ' despues de y=' + a.y + '); el recorrido solo baja');
    }
  }

  /* ---- narracion: se escucha, va en frases completas -------------------- */
  pasos.forEach(function (p, i) {
    const n = String(p.narracion || '').trim();
    const etq = 'paso ' + (i + 1);

    if (!n) { motivos.push(etq + ': no tiene narracion'); return; }

    const palabras = n.split(/\s+/).filter(Boolean).length;
    if (palabras < 5) {
      motivos.push(etq + ': la narracion tiene ' + palabras +
        ' palabras. Es un telegrama, no una frase. Si la idea no cabe, cambia la idea');
    }
    if (!/[.?!]$/.test(n)) {
      motivos.push(etq + ': la narracion no termina en punto. Suena cortada');
    }
    if (!/^[A-ZÁÉÍÓÚÑ¿¡]/.test(n)) {
      motivos.push(etq + ': la narracion no empieza en mayuscula');
    }

    const plano = sinTildes(n + ' ' + loQueSeVe(p));
    for (const mala of PROHIBIDAS) {
      if (plano.indexOf(mala) > -1) {
        motivos.push(etq + ': la palabra "' + mala + '" esta prohibida');
      }
    }
    /* Las cifras se revisan donde se AFIRMA algo. El sello de hora de una
       burbuja y el numero de pedido de un papel escrito a mano son utileria:
       ambientan la escena y no sostienen ningun dato de negocio. Revisarlos
       marcaba el guion bueno, y un QA que marca lo bueno se empieza a ignorar. */
    const afirmado = [p.narracion, p.titulo, p.remate, p.pie]
      .concat(p.fichas || []).filter(Boolean).join(' ');
    for (const d of afirmado.match(/\d+/g) || []) {
      if (!numerosFuente.has(d)) {
        motivos.push(etq + ': el numero ' + d + ' no aparece en la fuente, quitalo');
      }
    }
  });

  /* ---- el titular tiene que caber ---------------------------------------- */
  pasos.forEach(function (p, i) {
    if (!p.titulo) return;
    const lineas = String(p.titulo).split('\n');
    if (lineas.length > MAX_LINEAS_TITULO) {
      motivos.push('paso ' + (i + 1) + ': el titular tiene ' + lineas.length +
        ' lineas, el maximo es ' + MAX_LINEAS_TITULO);
    }
    lineas.forEach(function (l) {
      if (l.length > CHARS_LINEA) {
        motivos.push('paso ' + (i + 1) + ': la linea "' + l + '" tiene ' + l.length +
          ' caracteres y el maximo es ' + CHARS_LINEA +
          '. Parte la linea tu, no dejes que la parta el navegador');
      }
    });
  });

  /* ---- pronombre sin referente en pantalla ------------------------------- */
  /* El error: el titular decia "Y tienes que ir a buscarla" y "la" solo tenia
     sentido en la voz. Quien mira sin sonido leia un pronombre vacio. */
  pasos.forEach(function (p, i) {
    if (!p.titulo) return;
    const t = sinTildes(p.titulo);
    const clitico = t.match(/\b\w+(?:arla|erla|irla|arlo|erlo|irlo|arlas|arlos)\b/);
    if (!clitico) return;
    /* hay referente si en el mismo paso se ve algun sustantivo propio */
    const resto = sinTildes([p.rotulo, p.burbuja, p.tarjeta && p.tarjeta.etiqueta]
      .filter(Boolean).join(' '));
    if (!resto.trim()) {
      motivos.push('paso ' + (i + 1) + ': "' + clitico[0] +
        '" lleva un pronombre y en pantalla no hay a que se refiera. ' +
        'Quien mira sin sonido lee un pronombre vacio');
    }
  });

  /* ---- un nombre por cosa ------------------------------------------------ */
  /* El error que mas costo: la tercera via se llamo "¿Y si ya salio?", luego
     "preguntar", luego "Seguimiento" y al final "El estado". Cuatro etiquetas
     para una idea. Toda ficha tiene que haberse nombrado antes. */
  const antes = [];
  pasos.forEach(function (p) {
    if (p.tarjeta && p.tarjeta.etiqueta) antes.push(sinTildes(p.tarjeta.etiqueta));
    if (p.rotulo) antes.push(sinTildes(p.rotulo));
  });
  const vistas = antes.join(' | ');

  pasos.forEach(function (p, i) {
    (p.fichas || []).forEach(function (f) {
      if (vistas.indexOf(sinTildes(f)) === -1) {
        motivos.push('paso ' + (i + 1) + ': la ficha "' + f +
          '" aparece por primera vez aqui. Si es una de las vias del flujo, ' +
          'tiene que llamarse igual que cuando se presento');
      }
    });
  });

  /* lo mismo para el resumen: es el repaso, no puede estrenar vocabulario */
  const cierre = pasos[pasos.length - 1];
  const fichasTodas = [];
  pasos.forEach(function (p) {
    (p.fichas || []).forEach(function (f) { fichasTodas.push(sinTildes(f)); });
  });
  const conocidas = vistas + ' | ' + fichasTodas.join(' | ');

  ((cierre && cierre.resumen) || []).forEach(function (f, k) {
    /* Solo se revisan las filas que nombran una via, que son las que tienen la
       forma "Cosa, donde esta". Las filas sin coma son conclusiones —"Los tres
       en un solo lugar"— y no estrenan vocabulario: lo cierran. */
    if (String(f.txt).indexOf(',') === -1) return;
    const sujeto = sinTildes(String(f.txt).split(',')[0]).replace(/^(el|la|los|las|y)\s+/, '').trim();
    if (sujeto && conocidas.indexOf(sujeto) === -1) {
      motivos.push('resumen, fila ' + (k + 1) + ': "' + f.txt +
        '" nombra algo que no se llamo asi en ningun paso. El resumen repasa, no estrena');
    }
  });

  /* ---- si se cuenta, que cuadre ------------------------------------------ */
  /* El error: el titular decia "Son tres que no se hablan" y en pantalla no
     habia tres de nada; la palabra "sistemas" solo existia en la voz. */
  const cuantasVias = Math.max(
    fichasTodas.length,
    pasos.filter(function (p) { return p.tarjeta || p.nota; }).length);

  pasos.forEach(function (p, i) {
    const visible = sinTildes(p.titulo || '');
    for (const palabra in NUMEROS) {
      if (new RegExp('\\b' + palabra + '\\b').test(visible)) {
        const n = NUMEROS[palabra];
        if (n !== cuantasVias) {
          motivos.push('paso ' + (i + 1) + ': el titular dice "' + palabra + '" pero en la pieza hay ' +
            cuantasVias + ' vias. O cambia el numero, o cambia cuantas muestras');
        }
        /* un numero sin sustantivo al lado es un numero suelto */
        if (new RegExp('\\b' + palabra + '\\b\\s+(que|y|en|de|no)\\b').test(visible)) {
          motivos.push('paso ' + (i + 1) + ': "' + palabra +
            '" no dice tres QUE. En pantalla queda un numero sin sustantivo');
        }
      }
    }
  });

  /* ---- la voz nombra lo que el dibujo muestra ---------------------------- */
  /* El error: la narracion decia "planilla" y en pantalla habia un papel
     escrito a mano. No son la misma cosa. */
  pasos.forEach(function (p, i) {
    if (!p.tarjeta || !p.tarjeta.etiqueta) return;
    const etq = sinTildes(p.tarjeta.etiqueta);
    if (sinTildes(p.narracion || '').indexOf(etq) === -1) {
      motivos.push('paso ' + (i + 1) + ': en pantalla se ve una tarjeta de "' +
        p.tarjeta.etiqueta + '" y la narracion no la nombra');
    }
  });

  return { qa_ok: motivos.length === 0, motivos: motivos, vias: cuantasVias };
}

module.exports = { qaFlujo, sinTildes, loQueSeVe, CHARS_LINEA };
