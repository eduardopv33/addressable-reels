# Addressable · Reels

Renderiza el sistema de movimiento de la marca a un MP4 vertical listo para Instagram.
Corre en GitHub Actions, así que no necesita ninguna máquina encendida.

## Dos formatos

| | `motion.html` · tarjetas | `flujo.html` · flujo narrado |
|---|---|---|
| qué muestra | seis anclajes de texto | el flujo completo, paso a paso |
| audio | ninguno | locución (ElevenLabs, voz Daniel) |
| quién pone el reloj | la velocidad de lectura | la voz, por marcas de tiempo reales |
| contenido | `beats[]` | `pasos[]` |
| costo de render | ~100 ms/cuadro · ~1 min | ~420 ms/cuadro · ~6,5 min |

Se elige con la variable `MOTION`:

```bash
MOTION=flujo.html node render.js contenido-flujo.json out/reel.mp4
```

```
n8n elige un tag  →  repository_dispatch  →  Actions renderiza
                                              ↓
                                   Release publicado con ese tag
                                              ↓
                      n8n consulta el tag hasta que aparece el MP4
                                              ↓
                        Telegram: video + aprobación protegida
                                              ↓
                         aprobar  →  Instagram (media_type=REELS)
```

## Por qué el repositorio es público

Instagram descarga el video con cURL desde una URL pública. El MP4 se publica como
asset de un Release, y eso solo es descargable sin autenticación si el repo es público.

Aquí no hay nada sensible: tokens de color, tipografías y el guion de cada pieza.
**Ninguna credencial vive en este repositorio** — las llaves están en n8n y, si hiciera
falta alguna, en los secretos de Actions.

## El contrato de contenido

`contenido.json`, que n8n manda en el `client_payload`:

```json
{
  "referencia": "fila-8",
  "row_number": 8,
  "reel_id": "reel-f8-1791041234",
  "beats": [
    { "tono": "navy",  "kicker": "",         "lineas": ["Línea uno.", "Línea dos."], "mark": true },
    { "tono": "paper", "kicker": "Contexto", "lineas": ["..."] },
    { "tono": "navy",  "kicker": "",         "lineas": ["..."], "wordmark": true }
  ]
}
```

| campo | qué hace |
|---|---|
| `reel_id` | el tag del Release. n8n lo elige para poder ir a buscarlo después |
| `tono` | `navy` o `paper`. El arco habitual es navy, papel ×3, navy, navy |
| `kicker` | versalita sobre el titular, o vacío |
| `lineas` | **los saltos de línea los decides tú**, no el navegador |
| `mark` | el isotipo arriba a la derecha. Solo en el primer beat |
| `wordmark` | ADDRESSABLE abajo. Solo en el último |

Lo que **no** se manda: tamaños de letra ni tiempos. Los calcula la página.

- **Tamaño**: del largo de la línea más larga.
- **Tiempo**: de la lectura — 1,2 s de base más 0,32 s por palabra, con aire extra
  en el hook y en el cierre. Seis beats salen alrededor de 20 s.

## Decisiones de movimiento

- **La espina es la transición.** El fondo corta seco entre beats; lo que te lleva
  de uno a otro es el segmento bajando un paso.
- **El texto entra por cortina**, con máscara dura y escalonado 90 ms por línea.
  Un fundido sería el default de cualquiera.
- **Se mueve una cosa a la vez.** Espina, kicker, titular, nada más.
- **La escena respira 1%** por beat. Con movimiento real no hace falta fingir zoom.
- **Zona segura de Reels**: todo entre y=260 y y=1480. Instagram tapa el resto.

## El flujo narrado

La idea: el flujo se dibuja en un lienzo **más alto que el cuadro**, y hay una cámara
que viaja por él. Cada paso se ve de cerca mientras se narra; el último plano muestra
la espina entera con todos los nodos encendidos. Eso es el "flujo completo".

El riel por el que baja la cámara es la espina — el mismo dispositivo vertical del
formato de tarjetas. No es un elemento nuevo: es el de siempre, usado como recorrido.

### La voz pone el reloj

Antes los tiempos salían de contar palabras y estimar una velocidad de lectura.
Con locución eso no sirve: si el dibujo no cae donde cae la frase, se nota en el
primer segundo.

```
guion.json  →  ElevenLabs /with-timestamps  →  voz.mp3 + t0/t1 por paso
                                                        ↓
                                        contenido-flujo.json  →  render
```

ElevenLabs devuelve el instante exacto en que se dijo **cada carácter**. Como el guion
se manda con una frase por paso, el último carácter de cada frase da el corte. No se
estima nada. Si los caracteres que devuelve no coinciden con los enviados, `voz.js`
aborta en vez de producir tiempos corridos.

```bash
# la llave la pones tú y no vive en el repositorio
ELEVENLABS_API_KEY=... node voz.js guion-flujo.json out/voz.mp3 contenido-flujo.json
MOTION=flujo.html node render.js contenido-flujo.json out/reel.mp4
```

`--seco` en lugar del MP3 estima los tiempos sin llamar a nadie. Sirve para trabajar
el movimiento sin gastar caracteres del plan; no para la pieza final.

### El QA del guion

`qa-flujo.js` revisa la coherencia entre lo que se **dice** y lo que se **muestra**, y
corre antes de llamar a ElevenLabs — un guion incoherente detectado después de locutarlo
ya costó caracteres y diez minutos de render.

Cada regla está ahí porque el error llegó a una pieza renderizada:

| Regla | El error que la originó |
|---|---|
| Una cosa, un nombre | La tercera vía se llamó *¿Y si ya salió?*, *preguntar*, *Seguimiento* y *El estado* |
| Si dice un número, que cuadre | *"Son tres que no se hablan"* y en pantalla no había tres de nada |
| La voz nombra lo que se dibuja | La narración decía *planilla*; el dibujo era un papel a mano |
| Nada de pronombres huérfanos | *"Y tienes que ir a buscarla"* — ¿buscar qué? |
| Narración en frases completas | *"Y no parte grande"* |
| Si la espina se parte, algo la cierra | — |
| La cámara solo baja | — |

Se afinó dos veces porque marcaba el guion bueno: la hora de una burbuja y el número de
un pedido escrito a mano son utilería, no cifras inventadas. **Un QA que marca lo bueno
se empieza a ignorar**, y eso es peor que no tenerlo.

```bash
node probar-qa-flujo.js     # 15 casos, ninguno hipotético
```

### Vista previa

El render completo son unos diez minutos y casi todo se va en rasterizar 1080×1920
novecientas veces. A media resolución el cuadro cuesta 257 ms en vez de 593 — medido —
y con 24 fps y un encode rápido la espera baja a tres minutos y medio.

```bash
$env:VISTA = "1"; node pieza.js guion-commerce-partido.json
```

Sale a 540×960: suficiente para decidir si el guion y el movimiento funcionan, inútil
para publicar. La locución **no** se vuelve a cobrar si el guion no cambió, así que una
vista previa y después la pieza final cuestan una sola llamada.

### Profundidad de campo

Lo que la cámara deja atrás no se queda nítido colgando del borde: se apaga y se
desenfoca según su distancia al punto que se está mirando. Es lo que separa una cámara
que viaja por un espacio de una lista que se desplaza.

### No hay grano

Lo hubo. Una capa de ruido a pantalla completa cuesta **470 ms por cuadro** en render
por software — la mitad de la pieza — y da igual si viene de `feTurbulence`, de un
`mix-blend-mode` o de un PNG horneado: se midieron los tres y los tres cuestan lo mismo.
Encima, el grano fino es lo primero que descarta el compresor de Instagram. Se pagaba
el doble de render por una textura que no llegaba al teléfono.

Los degradados sí sobreviven a la compresión y son baratos. Esos se quedaron.

## Correrlo a mano

```bash
npm install
node render.js contenido.json out/reel.mp4                      # tarjetas
MOTION=flujo.html node render.js contenido-flujo.json out/x.mp4 # flujo
```

Abrir `motion/motion.html` o `motion/flujo.html` en el navegador reproduce el
movimiento en bucle, sin renderizar.

### Herramientas para no esperar ni gastar

```bash
MOTION=flujo.html node vistazo.js        # un cuadro por paso, en segundos
MOTION=flujo.html node medir.js          # cuánto costaría la pieza entera
```

`vistazo.js` existe porque renderizar 30 segundos son 900 capturas y varios minutos;
para corregir composición bastan siete. `medir.js` existe porque conviene saber lo que
cuesta un cuadro **antes** de pagarlo novecientas veces — y porque mide sin escribir a
disco: este repositorio vive dentro de OneDrive y escribir un PNG por cuadro mete al
sincronizador en la medición.

## Detalles que costaron encontrarse

**Las tipografías hay que pedirlas.** El navegador solo descarga una fuente cuando algo
visible la usa, y el kicker del primer beat va vacío. Sin `document.fonts.load()` explícito,
los beats con kicker salían en una tipografía de sistema sin que nada fallara.
`render.js` ahora aborta si Montserrat o IBM Plex Sans no cargaron.

**Un solo origen de verdad.** La vista en el navegador y el render usan el mismo archivo:
`window.cuadro(t)` dibuja el instante `t`, y el render pide los cuadros uno a uno. No hay
dos implementaciones que se puedan desincronizar.

**Nadie llama de vuelta a n8n.** El tag del Release lo decide n8n antes de disparar,
así que después solo pregunta por él hasta que aparece. No hace falta exponer un webhook
a internet, y una corrida fallida se nota porque el Release nunca llega.

**Sale sin pista de audio**, a propósito. La música se le pone en Instagram al subirlo:
no arrastras licencias y la puedes cambiar por pieza.
