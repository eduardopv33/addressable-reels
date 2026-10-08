/* Banco de pruebas del QA de flujo. No llama a nadie ni gasta nada.

   Cada caso que falla es un error que de verdad llego a una pieza renderizada.
   Estan aqui para que no vuelva a pasar cuando el guion lo escriba un modelo.

   Uso:  node probar-qa-flujo.js
*/

const fs = require('fs');
const { qaFlujo } = require('./qa-flujo');

const FUENTE = 'Addressable Commerce es la linea de trabajo para negocios que venden ' +
  'productos. Incluye tienda o catalogo online, pedidos ordenados en un solo lugar y ' +
  'seguimiento de lo que pasa despues de la compra. Se arma por etapas: Start, Growth y Scale.';

/* El guion real, que tiene que pasar. */
const BUENO = JSON.parse(fs.readFileSync('./guion-commerce-partido.json', 'utf8'));

function clonar(x) { return JSON.parse(JSON.stringify(x)); }

const casos = [];
function caso(nombre, guion, espera) { casos.push({ nombre, guion, espera }); }

caso('el guion real', BUENO, true);

/* --- los cinco errores que llegaron a una pieza renderizada -------------- */

caso('la tercera via cambia de nombre', (function () {
  const g = clonar(BUENO);
  g.pasos[5].fichas = ['Catálogo', 'Pedidos', 'Seguimiento'];   // nunca se llamo asi
  return g;
})(), false);

caso('el resumen estrena vocabulario', (function () {
  const g = clonar(BUENO);
  g.pasos[7].resumen[2].txt = 'El seguimiento, preguntando';
  return g;
})(), false);

caso('un numero que no cuadra', (function () {
  const g = clonar(BUENO);
  g.pasos[4].titulo = 'Son cinco\nque no hablan';
  return g;
})(), false);

caso('un numero sin sustantivo', (function () {
  const g = clonar(BUENO);
  g.pasos[4].titulo = 'Son tres que\nno se hablan.';
  return g;
})(), false);

caso('pronombre sin referente en pantalla', (function () {
  const g = clonar(BUENO);
  g.pasos[0].titulo = 'Y tienes que\nir a buscarla.';
  delete g.pasos[0].burbuja;
  delete g.pasos[0].rotulo;
  return g;
})(), false);

caso('la voz no nombra lo que se dibuja', (function () {
  const g = clonar(BUENO);
  g.pasos[1].narracion = 'Las fotos y los precios los tienes en un lado.';
  return g;
})(), false);

/* --- telegrama: el error que costo dos iteraciones ----------------------- */

caso('narracion telegrafica', (function () {
  const g = clonar(BUENO);
  g.pasos[7].narracion = 'Y no parte grande.';
  return g;
})(), false);

caso('narracion sin punto final', (function () {
  const g = clonar(BUENO);
  g.pasos[2].narracion = 'Los pedidos te llegan por otro lado distinto';
  return g;
})(), false);

/* --- estructura ---------------------------------------------------------- */

caso('la espina se parte y nadie la cierra', (function () {
  const g = clonar(BUENO);
  delete g.pasos[5].sana;
  return g;
})(), false);

caso('la camara retrocede', (function () {
  const g = clonar(BUENO);
  g.pasos[3].camara.y = 900;
  return g;
})(), false);

caso('titular que no cabe en una linea', (function () {
  const g = clonar(BUENO);
  g.pasos[1].titulo = 'En un lado completamente distinto del otro.';
  return g;
})(), false);

caso('sin hook', (function () {
  const g = clonar(BUENO);
  delete g.pasos[0].hook;
  return g;
})(), false);

/* --- reglas editoriales --------------------------------------------------- */

caso('primera persona de agencia', (function () {
  const g = clonar(BUENO);
  g.pasos[5].narracion = 'Implementamos un sistema que junta todo en el mismo lugar.';
  return g;
})(), false);

caso('un numero inventado', (function () {
  const g = clonar(BUENO);
  g.pasos[4].narracion = 'El 73 por ciento de los negocios tiene este problema exacto.';
  return g;
})(), false);

let fallos = 0;
for (const c of casos) {
  const r = qaFlujo(c.guion, FUENTE);
  const bien = r.qa_ok === c.espera;
  if (!bien) fallos++;
  console.log((bien ? '  ok  ' : ' FALLA') + '  ' + c.nombre.padEnd(38) +
    '  qa_ok=' + r.qa_ok +
    (r.motivos.length ? '\n          ' + r.motivos.join('\n          ') : ''));
}

console.log('\n' + (fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : fallos + ' PRUEBAS FALLARON'));
process.exit(fallos === 0 ? 0 : 1);
