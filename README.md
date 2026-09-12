# peek101

**El portal del cliente: su proyecto y su estado de cuenta.** Un cliente del
taller entra desde su celular y ve qué compró, cómo va y cuánto ha pagado.
Nada más: es de **sólo lectura**.

Un Worker de Cloudflare que sirve un HTML, un JS y sus fuentes, y que le habla
a `suite101-api` **por dentro**, con un *service binding*: lo que llega a
`/s101/*` se reenvía a la API sin salir a internet, con la cabecera `X-App`
puesta por el Worker.

```
public/         la interfaz: index.html, app.js, textos.js, estilo.css, fonts/
worker/         index.js — reparte /s101/* a la API y lo demás a los archivos
scripts/        sellar.mjs (la versión en la portada) · medir.mjs (el corredor)
pruebas/        portal.spec.mjs (Playwright) · servidor.mjs (el banco local)
claude/         el arranque del coordinador y el semáforo
```

## Por qué un Worker y no un sitio estático a secas

La sesión de la suite es **una cookie `SameSite=None`**. Si la app viviera en
un sitio y la API en otro, sería cookie de terceros y Safari la bloquea — o
sea, todo iPhone, que es justo desde donde un cliente abre esto. Desde el
mismo origen la cookie es propia y no hay CORS que configurar. Es la decisión
D1 del arranque.

## De dónde salen los datos

De **una sola llamada**: `GET /s101/orgs/:org/peek`. Trae el cliente, sus
proyectos con sus productos, los pagos y los **totales ya calculados**.

Los totales no se recalculan en la pantalla, a propósito: que el número grande
y la tabla salgan de la misma consulta es lo que hace imposible que se
contradigan, y contradecirse fue un defecto real del 7-sep.

Lo que esta app **nunca ve, porque la API no lo manda**: costos, partidas,
proveedores, egresos. Y desde el 12-sep un cliente recibe `403` en cualquier
tabla suelta de la API (`suite101-api` PR #40): sólo `/peek`.

### Las siete etapas

`etapa` llega como un entero de 0 a 7 y los nombres **no** están en la API:
son los de SUPERVISOR y viven en `public/textos.js`, copiados de
`suite101-api/claude/suite101-arquitectura.md`. Los dos extremos no son
nombres de etapa y se dicen como lo que son: `0` es «Por iniciar» y `null` es
«Sin dato del taller». La prueba comprueba que en esa columna no aparezca
ningún nombre inventado — y en su primera corrida cazó uno.

`avance` llega de 0 a 1 (medido en staging: `0.4642857…` para 13 de 28
etapas), y se dibuja como porcentaje entero.

## Correr y probar

```bash
npm install

# El banco de pruebas: hace lo mismo que el Worker, contra la API de STAGING
node pruebas/servidor.mjs           # http://127.0.0.1:8789

# El portal manejado con un navegador de verdad, a 390×844 y a 1440
node pruebas/portal.spec.mjs

# Lo mismo contra lo ya publicado
BASE=https://peek101-staging.mike-929.workers.dev node pruebas/portal.spec.mjs

# Lo que mide el corredor contra el Worker publicado
STAGING=https://peek101-staging.mike-929.workers.dev node scripts/medir.mjs
```

`wrangler dev` **no** sirve para probar el enlace con la API: el *service
binding* sólo existe dentro de Cloudflare y en local wrangler lo marca
`[not connected]`. Por eso `pruebas/servidor.mjs`, que no es el Worker y no
pretende serlo. Que el Worker de verdad reparta igual lo mide `medir.mjs`
desde el corredor, contra lo publicado. Las dos mediciones hacen falta.

## Cuánto pesa la primera carga

Lo va a abrir un cliente en su teléfono, a veces con poca señal, así que el
peso se mide y se escribe. Medido con el navegador de verdad, en la pantalla
de entrada, a 390 × 844 y a 1440:

| | archivos | peso |
|---|---|---|
| al empezar | 11 | **200.0 KB** |
| hoy | 10 | **161.3 KB** |

Los 40 KB que se fueron eran dos pesos de Raleway que el v0 declaraba y casi
nadie usaba: al 500 no lo pedía ninguna regla, y al 800 sólo el «101» del
logotipo, que ahora va en 700 y se ve igual.

**Lo que sigue pesando son los tres pesos de Raleway que sí se usan: 119 KB de
los 161.** Bajarlos quiere decir subconjuntar Raleway, como ya está
subconjuntada Fira Sans para los dígitos. No está hecho y no se promete aquí;
queda anotado como lo siguiente que conviene medir. Con `font-display: swap`
el texto aparece de inmediato con la letra del sistema, así que el efecto es
en el ancho de banda, no en la espera.

Cero peticiones a terceros: las fuentes viajan dentro y la prueba lo comprueba.

## Publicar

No se publica a mano. Se dispara al fusionar a `main`:
`.github/workflows/publicar.yml` sella la portada con el commit, publica
`peek101-staging`, lo mide, lo maneja con un navegador y **sólo entonces**
publica producción; lo que midió vuelve como comentario del commit, que es lo
único que un chat puede leer (OPERAR §6).

**Producción no se publica mientras no exista la variable `ORG_PRODUCCION`**
del repositorio. Es a propósito: a quién se le abre el portal lo decide Mike
desde dash101, y un portal de producción sin esa decisión no tiene a quién
enseñarle nada.

El portal viejo (`cuenta-taller101.netlify.app`, contra Firestore) sigue vivo
al lado hasta el corte (decisión D3). Esto no apaga nada.

## Lo que falta, y no se esconde

- **Cómo le llega el enlace al cliente.** `POST /orgs/:o/clientes/:id/acceso`
  le abre el portal pero **no manda correo**. Hace falta una invitación por
  Resend desde la API, con la liga a peek101; está propuesto en el muro y lo
  decide Mike.
- **Un cliente que compre a dos empresas.** En `accesos` cada usuario tiene
  **un solo** acceso, así que un segundo acceso pisaría el primero y el
  cliente dejaría de ver el portal de la primera empresa. Con una sola
  empresa no duele; peek101 es quien lo va a sufrir. Está propuesto en el muro.
- **El logotipo y el material de venta** (`claude/venta/`), pendientes.

Cómo opera un chat en este repositorio: [`OPERAR.md`](OPERAR.md).
El plan completo por fases: [`claude/arranque-coordinador.md`](claude/arranque-coordinador.md).
