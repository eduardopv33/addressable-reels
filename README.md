# Addressable · Reels

Renderiza el sistema de movimiento de la marca a un MP4 vertical listo para Instagram.
Corre en GitHub Actions, así que no necesita ninguna máquina encendida.

```
n8n  →  repository_dispatch  →  Actions renderiza y publica un Release
                                      ↓
                              URL pública del MP4  →  n8n
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
  "callback_url": "https://.../webhook/reel-listo",
  "beats": [
    { "tono": "navy",  "kicker": "",         "lineas": ["Línea uno.", "Línea dos."], "mark": true },
    { "tono": "paper", "kicker": "Contexto", "lineas": ["..."] },
    { "tono": "navy",  "kicker": "",         "lineas": ["..."], "wordmark": true }
  ]
}
```

| campo | qué hace |
|---|---|
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

## Correrlo a mano

```bash
npm install
node render.js contenido.json out/reel.mp4
```

Abrir `motion/motion.html` en el navegador reproduce el movimiento en bucle, sin renderizar.

## Detalles que costaron encontrarse

**Las tipografías hay que pedirlas.** El navegador solo descarga una fuente cuando algo
visible la usa, y el kicker del primer beat va vacío. Sin `document.fonts.load()` explícito,
los beats con kicker salían en una tipografía de sistema sin que nada fallara.
`render.js` ahora aborta si Montserrat o IBM Plex Sans no cargaron.

**Un solo origen de verdad.** La vista en el navegador y el render usan el mismo archivo:
`window.cuadro(t)` dibuja el instante `t`, y el render pide los cuadros uno a uno. No hay
dos implementaciones que se puedan desincronizar.

**Sale sin pista de audio**, a propósito. La música se le pone en Instagram al subirlo:
no arrastras licencias y la puedes cambiar por pieza.
