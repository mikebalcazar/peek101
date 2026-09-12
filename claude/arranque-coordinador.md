# peek101 — arranque coordinado

**Para:** el chat que tome peek101 (portal para clientes).
**De:** el coordinador de suite101, 10-sep-2026.
**Regla de este documento:** lo marcado **medido** se leyó hoy de primera mano:
el código desplegado de `suite101-api` en Cloudflare, la D1 `suite101-master`,
los sitios de Netlify, la carpeta de Drive y el repo público `descargas`. Lo que
viene de documentos de otros chats dice **según**. Si un renglón no coincide
con un archivo, manda el archivo (OPERAR §3).

**Tu objetivo, en una línea:** construir peek101 desde cero, directamente en
Cloudflare. Es la única de las siete apps que nace ya migrada: el backend está
listo y esperándote, y del frontend casi no hay nada.

* * *

## 0 · Lo primero, en este orden

1. **Dónde vas a trabajar.** Este documento está pensado para una sesión de
   **Claude Code en la web** (claude.ai/code; se abre y se sigue desde la app
   del celular) con tu repo como fuente. Es el único tipo de sesión donde un
   chat de taller101 ha podido empujar: ahí el proxy pone la credencial por ti.
   En un chat normal de claude.ai puedes leer, planear y armar la ficha (§6),
   pero no publicar. Tres chats lo descubrieron el 10-sep a la mitad del
   trabajo; tú descúbrelo en el primer minuto.

2. **Comprueba que puedes escribir**, en tu repo **y en `suite101-api`** (ahí
   vive el muro y ahí van los cambios de la API):

   ```bash
   git push --dry-run origin HEAD:refs/heads/claude/prueba-de-acceso
   ```

   Si pasa en los dos, adelante: tú publicas y no le pides clics a Mike. Si
   sale *«not in this session's authorized repository set»* o un 403, **no es
   el PAT**, es la sesión. Dile a Mike el mensaje exacto, señálale §8 y para
   ahí. No busques tokens en archivos y no rodees el proxy.

   **Ya está comprobado que la sesión puede empujar, incluso workflows.** El
   10-sep la app de Claude quedó instalada con acceso a todos los repos y
   permiso de escritura en código, actions y workflows, y el chat «sitio»
   hizo merges en `descargas` desde Claude Code ese mismo día. El push en seco
   sigue siendo tu primer paso, pero si falla es una anomalía: díselo a Mike
   con el mensaje exacto.

   **Desde Claude Code sí se alcanzan `pages.dev`, `workers.dev` y
   `api.github.com`** (medido por el chat «sitio»). `OPERAR.md` §6 dice lo
   contrario porque se escribió para chats de claude.ai. Aun así, deja que el
   workflow mida solo: así los números quedan en el commit.

3. **Lee `OPERAR.md`** de tu repo. Dos partes quedaron viejas y este documento
   las corrige mientras se actualizan (§3, D7). **§1** manda sacar un PAT de
   `CONTEXTO.md`: si tu push en seco pasó, no hace falta ningún PAT. **§6**
   dice qué deja pasar el proxy, y eso depende de la sesión: mídelo.

4. **Semáforo** `claude/EN-CURSO.md` (OPERAR §2), en tu repo y también en
   `suite101-api` cuando vayas a tocarla. Tres chats van a entrar ahí.

5. **Muro.** Lee completo `suite101-api/muro/` y deja tu recado de arranque
   (§10). Si el muro trae algo más nuevo que contradiga este documento, manda
   el muro.

6. **Último run en verde** antes de apilar nada (OPERAR §4).

7. En tu primer commit, copia este documento a `claude/arranque-coordinador.md`
   de tu repo. El repo es la fuente de verdad; el proyecto de Claude es sólo el
   mapa.

* * *

## 1 · Qué es peek101 y dónde está

«El portal del cliente: su proyecto y su estado de cuenta». Así lo presenta
hoy la portada de `suite101.pages.dev`, donde sale como tarjeta apagada. Es de
**sólo lectura**: el cliente del taller entra desde su celular y ve cómo va lo
que compró y cuánto ha pagado. Nada más.

| | |
| --- | --- |
| Repo | `github.com/mikebalcazar/peek101` (privado). **Medido el 10-sep:** existe y está vacío; Mike lo creó ese día |
| Backend | **medido:** `GET /orgs/:o/peek` en `suite101-api`, completo |
| Frontend | **según** el coordinador anterior: «sólo un HTML suelto, nada integrado». No dijo dónde. La pista más fuerte es que `descargas/venta/LEEME.md` pone el material de peek101 en `conta-master/claude/venta/`; búscalo primero en `conta-master` y luego en `suite101-api`. En `descargas` no está (medido) |
| En la API | `X-App: peek101`; en `orgs.apps` es la llave `peek`. **Medido:** encendida en `forespot` |
| Clientes con acceso | **medido:** 2 accesos de tipo `cliente` en producción. No sabemos quiénes son: **no los uses para probar** |
| Marca | no hay logotipo. Lo haces tú (§6) |

* * *

## 2 · La API de la suite — medida hoy leyendo el código desplegado

El coordinador anterior dejó `MASTER-CODER-handoff.md`. El 10-sep se leyó el
código que está corriendo en Cloudflare, y ese documento tiene tres cosas mal:

- Las rutas de datos van bajo **`/orgs/:o/…`**, no `/:o/…`. Las de sesión van
  bajo `/auth/…`.
- OrgDB tiene **13 tablas**, no 9. A las que listaba se suman `avances`
  (sólo se agrega, nunca se edita), `movimientos`, `opex` y `archivos`.
- El conector de Cloudflare dice `num_tables: 0` para `suite101-master`. Es
  falso: se consultó y tiene tablas y datos. No te fíes de ese campo.

| | medido el 10-sep |
| --- | --- |
| Worker | `suite101-api` y `suite101-api-staging` (Hono), contrato `0.2.0`, último cambio 9-sep 17:16 UTC |
| Identidad | D1 `suite101-master`: **una sola org, `forespot`**, activa, con las seis apps encendidas. 3 usuarios, 1 miembro, 2 accesos de tipo `cliente` |
| Datos por empresa | Durable Object `OrgDB`, un SQLite por org. Sus migraciones **las aplica el propio objeto al despertar**, comparando su versión; wrangler no las toca |
| Staging | D1 `suite101-master-staging` con 15 orgs de humo (`humo-*`, `imp-*`) que dejan las pruebas de la API. No hay org de demostración |

**Cómo se habla con ella:**

- **La sesión es sólo una cookie**: `s101`, con `HttpOnly; Secure;
  SameSite=None`. No existe `Authorization: Bearer`. Esto decide cómo se
  hospeda cada app (§3, D1).
- **`X-App` es obligatorio** en `/orgs/…`. Los valores válidos son `dash101`,
  `quell101`, `peek101`, `cotizador101`, `roster101`, `nest101`, `master101` y
  `suite101`. Si la org no tiene tu app encendida responde `403 app_inactiva`.
- **Para entrar:** `POST /auth/codigo {correo}` manda un código de 6 dígitos
  por Resend; vence en 10 min y se puede reenviar cada 45 s. Luego
  `POST /auth/entrar {correo, codigo}` o `{correo, pin}`. `POST /auth/pin {pin}`
  lo fija: 6 dígitos, que no sean escalera ni seis iguales. Quedan
  `POST /auth/salir`, `GET /yo` y Google en `/auth/google`, que responde 501 si
  faltan sus secretos.
- **En staging, `/auth/codigo` devuelve `codigo_prueba`** en la respuesta
  (cuando `ENTORNO ≠ produccion`). Con eso una prueba de Playwright entra sola,
  sin leer correo. En producción no lo devuelve.
- **El dinero va en centavos, como entero.** Un monto con decimales se rechaza
  con `400 dinero_no_entero`. Las fechas van como texto ISO 8601 UTC.
- **Cada campo tiene dueño.** Cada app escribe sólo ciertos campos de ciertas
  tablas (`ESCRITORES`, en `src/permisos.ts`). Lo demás responde
  `403 campo_no_permitido` y dice qué sí se permite. Los de tu app están en §4.
- **Quién ve dinero:** los miembros sí. `ve_costos` sólo lo tienen owner,
  admin y socio. El personal ve dinero según su `ve_dinero`. **Un cliente sólo
  puede abrir `/peek`.**
- Toda respuesta tiene la forma `{ok:true, data}` o `{ok:false, error, detalle}`.
- Hay canal en vivo por org: `GET /orgs/:o/ws`, un WebSocket con hibernación.

* * *

## 3 · Decisiones del coordinador (valen igual para quote101, dash101 y peek101)

**D1 · Cada app vive en su propio Worker y le habla a la API desde su mismo
origen.**

- El Worker sirve la interfaz como *static assets* y tiene un **service
  binding** a `suite101-api`. Todo lo que llega a `/s101/*` se reenvía a la API
  sin el prefijo.
- **Por qué:** la sesión es una cookie `SameSite=None`. Si la app vive en un
  sitio y la API en otro, es cookie de terceros, y Safari la bloquea (es decir,
  todo iPhone). Desde el mismo origen la cookie es propia y además no hay CORS
  que configurar.
- El proxy pone `X-App`; la interfaz no lo manda.
- El prefijo es `/s101/` y no `/api/` por dos razones: no chocar con las rutas
  `/api` de Next.js en dash101, y que las tres apps tengan la misma regla.

```toml
# wrangler.toml — esqueleto: mídelo, no lo copies a ciegas
name = "peek101"
main = "worker/index.js"
compatibility_date = "2026-09-01"
assets = { directory = "./dist", binding = "ASSETS" }
# si usas not_found_handling = "single-page-application", agrega
# run_worker_first = ["/s101/*"] para que la API no reciba index.html

[[services]]
binding = "API"
service = "suite101-api"

[env.staging]
name = "peek101-staging"
[[env.staging.services]]
binding = "API"
service = "suite101-api-staging"
```

```js
// worker/index.js
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname.startsWith('/s101/')) {
      u.pathname = u.pathname.slice(5);        // /s101/auth/codigo → /auth/codigo
      const r = new Request(u, req);
      r.headers.set('X-App', 'peek101');
      return env.API.fetch(r);
    }
    return env.ASSETS.fetch(req);
  }
};
```

**D2 · Nombres.** Los Workers nuevos se llaman `quote101`, `dash101` y
`peek101`, cada uno con su gemelo `-staging`. Sus direcciones son
`https://<nombre>.mike-929.workers.dev` hasta que haya dominio propio. Son
nombres nuevos, no renombres, así que OPERAR §8 sigue en pie. Mike puede
vetarlos; si lo hace, se corrige aquí y en el muro **antes** del primer deploy.

**D3 · Netlify no se toca hasta el corte.** El sitio viejo sigue sirviendo
mientras el nuevo se mide a su lado. El corte llega cuando el nuevo pasa la
misma verificación que el viejo, con números. Apagar o borrar un sitio de
Netlify lo hace Mike, porque es irreversible y un chat no borra. Ningún sitio
de Netlify se renombra.

**D4 · Ninguna app toca una base directo.**

- Si falta un campo o una ruta, se agrega en `suite101-api`, con semáforo,
  prueba y recado en el muro. La app espera a que ese cambio esté desplegado.
- Cada cambio de contrato sube `VERSION_CONTRATO` y se anuncia en el muro.
- Una migración de OrgDB se prueba como manda OPERAR §7: `sqlite3` en memoria
  con todas las anteriores aplicadas, `PRAGMA foreign_keys = ON`, con datos,
  filas antes y después, y `PRAGMA foreign_key_check`.

**D5 · Staging primero.** Todo se prueba contra `suite101-api-staging` y el
Worker `-staging` de tu app. A producción sólo llega lo que ya salió verde ahí.

**D6 · La org de demostración.**

- Capturas y pruebas usan una org **`demo` en staging**, con datos ficticios:
  el cliente «Familia Ramírez» y el proyecto «Cocina Ramírez», los mismos que
  ya usa draw101 en su material de venta.
- **Nunca se captura `forespot`**: ahí hay dinero real de clientes reales.
- La siembra dash101, porque el dinero es suyo. Si peek101 o quote101 llegan
  antes, la crean con esos mismos nombres y lo avisan en el muro.

**D7 · `OPERAR.md` lo actualiza un solo chat: dash101**, porque su §1 apunta
al `CONTEXTO.md` de ese repo. Los otros dos no lo tocan; si encuentran algo,
lo dejan en el muro para dash101.

**D8 · Nombres de producto, siempre en minúsculas.**

- **quote101**. En la API se sigue identificando como `cotizador101`: es
  contrato y no se cambia.
- **dash101**. Su interfaz hoy dice CONTA MASTER.
- **peek101**.

* * *
## 4 · Tu construcción, por fases

### Lo que la API ya te da (medido, leyendo el código)

**Cómo entra un cliente.**

1. dash101 le abre el acceso con `POST /orgs/:o/clientes/:id/acceso
   {correo, pin}`. Eso crea su usuario, le fija un PIN y deja
   `portal_activo = 1`.
2. El cliente entra con `POST /auth/codigo` y luego `POST /auth/entrar
   {correo, codigo}` o `{correo, pin}`.
3. `GET /yo` le devuelve `acceso: {org_id, tipo: 'cliente', ref_id, activo}`.
   De ahí sacas la org y su id de cliente.

**Qué ve.** `GET /orgs/:o/peek` (a través de tu proxy, `/s101/orgs/:o/peek`).
Un cliente sólo puede pedir el suyo. Un miembro puede pasar `?cliente_id=`, y
eso le sirve a dash101 para una vista previa. Esto es lo que devuelve, tal
cual:

```
{
  cliente:   { id, nombre, correo },
  proyectos: [ { id, negocio_id, cliente_id, nombre, descripcion, estado,
                 fecha_inicio, fecha_fin_estimada, fecha_cierre,
                 precio_venta, cobrado, avance, creado_at, actualizado_at,
                 items: [ { id, clave, nombre, monto, moneda, estado,
                            etapa, etapa_at, fecha_entrega } ] } ],
  totales:   { vendido, cobrado, saldo, avance },
  pagos:     [ { id, fecha, monto, proyecto_id, descripcion } ]   // hasta 200
}
```

Lo que conviene saber de esa respuesta:

- **Todo el dinero viene en centavos.** Lo formateas tú, en MXN y con las
  cifras en Fira Sans.
- `estado` del proyecto: `planeando`, `activo`, `pausado`, `finiquito` o
  `cerrado`.
- `etapa` del ítem es un entero de **0 a 7**. La `clave` (tipo `M07`) aparece
  a partir de la etapa 4. Los ítems cancelados no vienen.
- **Los totales salen de la misma consulta que la lista**, así que el número
  grande y la tabla no se pueden contradecir. Eso fue un defecto real del
  7-sep; no los recalcules por tu lado.
- **Lo que nunca viene:** `partidas`, egresos, costos, proveedores. La API ya
  lo filtra, y tu prueba comprueba que siga así (fase 3).
- Un cliente que pide cualquier otra tabla recibe
  `403 «un cliente solo abre /peek»`, y `/pool` también le da 403.

### Fase 0 · Medir y reunir

- **Encuentra el «HTML suelto».** Si sirve de base, úsalo; si no, apunta qué
  aprendiste de él y sigue.
- **Los nombres de las etapas 0 a 7.** No están en la API. Viven en el
  «ciclo de vida del ítem» (§2 de `suite101-arquitectura.md`), que no está en
  el proyecto (§8, M7). Hasta tenerlo, **no inventes nombres**: muestra la
  barra de avance y el número de etapa, y deja los nombres en un solo archivo
  de textos que se llene después.
- **La escala de `avance`.** Es un `REAL` que recalcula la API. Mide en staging
  si va de 0 a 1 o de 0 a 100 antes de dibujar un porcentaje.

### Fase 1 · Repo y Worker

- Repo `peek101` (M3), con `OPERAR.md` copiado igual desde otro repo, más
  `README.md`, `.gitignore` y `claude/`.
- Worker `peek101-staging` y luego `peek101` (D1, D2), con el workflow de §5.
- **Ligero de verdad.** Lo va a abrir un cliente en su teléfono, a veces con
  poca señal. Sin framework pesado: HTML y JS sin empaquetador, o Vite con
  JavaScript sin framework. Fuentes propias, cero peticiones a terceros. Mide
  el peso de la primera carga y ponlo en el LEEME del repo.

### Fase 2 · Entrar

- Pide el correo, luego el código o el PIN, luego `/yo`, y de ahí la org y el
  `peek`.
- **Maneja cada error con palabras del cliente, no del programador:**
  - `codigo_invalido`, con los `intentos_restantes`.
  - `demasiados_intentos` (429). Dice cuánto esperar: 45 s para reenviar, una
    hora de ventana en el PIN.
  - `sin_permiso`: el correo no tiene portal.
  - `org_inactiva` y `app_inactiva`.
- **La sesión dura lo que dice `vive_segundos`.** Cuando vence, se regresa a la
  entrada sin perder la vista que tenía abierta.
- Nada de cambiar el PIN desde aquí mientras Mike no lo pida. Olvidé mi PIN =
  entrar con código y fijar uno nuevo (`POST /auth/pin`).

### Fase 3 · Las pantallas

- **Resumen:** vendido, cobrado, saldo y avance, directo de `totales`.
- **Proyectos.** Cada uno con su avance y sus ítems, con etapa, clave y fecha
  de entrega.
- **Pagos:** fecha, monto y descripción.
- **Cómo se prueba (OPERAR §7):**
  - Playwright contra `peek101-staging`, entrando con `codigo_prueba` como el
    cliente «Familia Ramírez» de la org `demo` (D6), a 390 × 844 y a 1440.
  - Se cuentan elementos: ítems pintados igual a ítems del JSON, y la suma de
    pagos pintados igual a `totales.cobrado`.
  - **Una prueba de control que falle a propósito**: si la respuesta trajera un
    campo fuera de la lista de arriba, la prueba lo detecta.
  - Sin scroll horizontal y sin errores de JavaScript.

### Fase 4 · Producción

- Se publica `peek101`.
- **A quién se le abre el portal lo decide Mike**, desde dash101.
- **Cómo le llega el enlace al cliente no existe todavía.** `/acceso` no manda
  correo. Propón en el muro una invitación por Resend, desde la API, con el
  enlace a peek101, y espera la decisión de Mike.

### En paralelo, desde el día uno: la ficha (§6)

- **Tu logotipo no existe:** sácalo con `marca-svg.py peek101`.
- **Capturas sobre todo en celular** (390 × 844), porque así lo va a ver el
  cliente, y una o dos a 1600 × 1100.
- **Datos sólo de `demo`.**
- Tu material vive en el repo `peek101` y en Drive, no en `conta-master`.
  Avísalo en el muro para que se corrija `descargas/venta/LEEME.md`.

* * *

## 5 · Publicar sin Mike y sin PC

Una vez puestos los permisos de §8, la cadena completa es esta:

1. Mike pide algo desde el celular, en una sesión de Claude Code en la web.
2. La sesión abre una rama `claude/…`, mide, hace commit en español, PR y merge
   (OPERAR §5).
3. El push a `main` dispara GitHub Actions, que hace `wrangler deploy` con el
   secreto `CLOUDFLARE_API_TOKEN` del repo.
4. El mismo workflow verifica lo publicado desde el runner, que sí alcanza
   `*.workers.dev`, y deja los números como comentario del commit. Es el patrón
   de `verificar.yml` en `descargas`.
5. La sesión lee ese comentario por la API de GitHub y le cuenta a Mike qué se
   midió.

**Nada de eso pasa por la computadora de Mike.** Las llaves viven en dos
lugares y sólo en dos: los **secretos de Actions** de cada repo y los
**secretos de cada Worker** en Cloudflare. Nunca en un archivo del repo, en un
chat, en un `.bat` ni en una carpeta de OneDrive.

**Ya arreglado (10-sep, chat «sitio», merge `cc1767c`):** el paso «Medir lo
publicado» de `descargas/publicar-sitio.yml` reintenta, sigue las
redirecciones de Pages y deja los números como comentario del commit. Run 5 de
«Publicar sitio» en verde de punta a punta. Cópiale el patrón, no lo reinventes.

Tres cosas que ya no se hacen:

- `.bat` o parches para que Mike los corra. Quedaron sueltos en `t101w` de un
  intento anterior.
- PAT en `CONTEXTO.md` o en `github-token.txt`.
- `wrangler deploy` desde una máquina.

```yaml
# .github/workflows/publicar.yml — esqueleto
name: Publicar
on:
  push: { branches: [main], paths-ignore: ['claude/**'] }
  workflow_dispatch:
permissions:
  contents: write            # para dejar el comentario en el commit
concurrency: { group: publicar, cancel-in-progress: false }
jobs:
  publicar:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN:  ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4
      - run: npx --yes wrangler@4 deploy --env staging
      - run: ./scripts/medir.sh https://peek101-staging.mike-929.workers.dev   # portada, /s101/salud, marca, cifras
      - run: npx --yes wrangler@4 deploy
      - run: ./scripts/medir.sh https://peek101.mike-929.workers.dev --comentar
```

`/s101/salud` pasa por tu proxy hasta la API y te devuelve
`{servicio, version, contrato, entorno, d1}`. Si responde, el binding está
bien puesto.

* * *

## 6 · La ficha de producto y el material para el sitio → Drive

El sitio de la plataforma **ya existe y ya lo arma otro chat**, el chat
«sitio»: `suite101.pages.dev`, publicado y medido el 10-sep desde
`descargas/sitio/`. Hoy enseña dash101, peek101 y nest101 con **maquetas
dibujadas** (`sitio/img/peek101/maqueta-*.png`), porque de esas apps sólo hay datos
reales; quote101 tiene dos capturas y necesita dos más. Tu parte es entregarle
la materia prima de tu app, completa y explicada, para que sustituya las
maquetas por capturas de la org `demo` sin preguntarte nada. Lee sus recados en
`suite101-api/muro/2026-09-10-*-sitio-*.md` antes de empezar.

**Dónde va.** En Google Drive, carpeta **`suite101`**. Hoy se comprobó que
existe, que es de mike@forespot.com y que está vacía; su id es
`1DAInf5w-XgLyb7teIgTJOyfvMbLUotiv`. Crea dentro `suite101/peek101/` y deja ahí
todo.

La misma materia prima va también en tu repo, en `claude/venta/`, que es la
convención de `descargas/venta/LEEME.md`. El repo es la copia con historia;
Drive es la entrega. Si tu sesión no tiene el conector de Google Drive, deja
todo en el repo y pídelo en el muro: alguien con Drive lo sube.

```
suite101/peek101/
  LEEME.md      qué es cada archivo — lo primero que abre el chat del sitio
  web.md        el texto de la página de la app
  ficha.md      la ficha comercial de una hoja
  datos.md      versión, dirección, estado, stack
  marca/        el logotipo en todas sus presentaciones
  capturas/     las pantallas
```

**`LEEME.md`** es obligatorio. Es una tabla con cinco columnas: archivo, qué
es, para qué sirve en el sitio, cómo se generó (el comando o el guion de
captura) y fecha. Si falta algún archivo, el LEEME dice por qué. Marca cuáles
son las 4 capturas de `web.md`.

**`web.md`** lleva los campos **exactos** del diccionario `APPS` de
`descargas/sitio/herramientas/armar-sitio.py`. Así el chat del sitio lo pega
sin reescribir nada. Toma de ahí el tono de roster101 y de quell101.

```
lema:        una frase: lo que la app hace por quien la usa (≤ 12 palabras)
corto:       la línea de la tarjeta en la portada (≤ 10 palabras)
             hoy la portada dice: «El portal del cliente: su proyecto y su estado de cuenta.»
estado:      En producción · En uso · En preparación
plataforma:  p. ej. «Web · celular y computadora»
entrada:     un párrafo de 60 a 90 palabras: qué es, cómo se usa, qué cambia
beneficios:  6 × (título de ≤ 6 palabras · una frase)
funciones:   8 × (nombre · detalle corto, sin verbo)
capturas:    4 × (archivo · pie de una línea)
datos:       Versión · Plataforma · Estado · Modelo
conecta:     2 a 4 renglones: qué recibe de otras apps de la suite y qué les entrega
```

**`ficha.md`** sigue el formato de `descargas/venta/draw101/ficha.md`: título
y subtítulo, para quién (3), 5 beneficios, 8 funciones, capturas (tabla de
archivo y qué enseña, más cómo se tomaron), marca y cómo se pide.
**`datos.md`** sigue el de `descargas/venta/draw101/datos.md`.

**`marca/`**

| Archivo | Para qué |
| --- | --- |
| `peek101-azul.svg` y `.png` (1024 px de ancho) | logotipo sobre fondo claro |
| `peek101-blanco.svg` y `.png` | sobre fondo oscuro o sobre el azul |
| `peek101-negro.svg` | una sola tinta: impresión, sellos |
| `peek101-icono.svg`, `-512.png`, `-192.png`, `-180.png`, `-32.png`, `-16.png`, `.ico` | ícono de app, favicon, pantalla de inicio del celular |
| `peek101-og-1200x630.png` | tarjeta para compartir por redes y WhatsApp |

Reglas de la marca:

- El vector sale de `descargas/venta/herramientas/marca-svg.py`: puros
  `<path>`, sin `<text>` ni `font-family`. Nada de calcar un PNG.
- Azul `#0080C1`. Sansation para la marca y los títulos, Raleway para el
  texto, **Fira Sans para todas las cifras**.
- Se mide con cairosvg y PIL a 512 y a 32 px (OPERAR §7). Que a 32 px el
  ícono siga leyéndose se comprueba, no se supone.

**`capturas/`**

- Tema claro, idioma español, datos de la org `demo` (D6). **Nunca datos
  reales.**
- En computadora, 1600 × 1100. La portada, en 16:9 a 1600 × 900, se llama
  `00-portada-16-9.png`. Si la app se usa en celular, también a 390 × 844, con
  el sufijo `-celular`.
- Se nombran `NN-que-enseña.png`, y van de 4 a 9.
- Se toman con un guion de Playwright que queda en el repo y se puede repetir,
  como `build/capturas_venta.py` de draw101.

**Reglas del contenido.** Las decidió Mike el 9-sep y están en
`descargas/venta/LEEME.md`:

- Se vende como **Suite 101**.
- **Sin precios.** La única llamada a la acción es pedir una demostración a
  **info@forespot.com**.
- **Nada de números medidos en una sola máquina.** Se dice qué se siente, no
  cuánto marcó el cronómetro.
- **La ficha no promete nada que la app no haga hoy.** Si la app cambia, la
  ficha cambia en el mismo PR.

Cuando termines, deja un recado en el muro («material de venta de peek101 en
Drive») para el chat del sitio.

* * *
## 7 · Lo que no se sabe todavía

- **Dónde está el «HTML suelto»** y si sirve.
- **Los nombres de las etapas 0 a 7** (M7).
- **La escala de `avance`.**
- **Si el cliente debe ver el precio de cada ítem.** `peek()` devuelve el
  `monto` de cada ítem. Es su propio precio de venta, no un costo, así que
  parece correcto, pero es decisión de producto: pregúntale a Mike una vez y
  anótalo.
- **Un choque que viene** (ya lo sabe dash101): en `accesos`, cada usuario
  tiene **un solo** acceso. La decisión 4 dice que un cliente que compra a dos
  empresas son dos documentos separados; hoy el segundo acceso **pisaría** al
  primero y el cliente dejaría de ver el portal de la primera empresa. Con una
  sola org no duele, pero peek101 es quien lo va a sufrir: deja propuesto en el
  muro el cambio en la API (acceso por usuario y org, y un selector de empresa
  en tu entrada).

* * *

## 8 · Lo que hace falta de Mike

Se hace una sola vez, desde el navegador del celular, y el chat nunca ve los
valores. Suponlo pendiente hasta medir lo contrario.

| # | Qué | Para qué |
| --- | --- | --- |
| M1 | ✅ **Hecho según Mike (10-sep):** la Claude GitHub App ya está instalada en `mikebalcazar`. Tú lo compruebas con el push en seco y la prueba del workflow (§0.2) | sin esto la sesión clona pero no empuja |
| M2 | ✅ **Hecho el 10-sep:** token nuevo de Cloudflare («Edit Cloudflare Workers» más *D1: Edit* y *Pages: Edit*) pegado como `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` en `cotizador-t101`, `conta-master`, `suite101-api`, `descargas`, `bitacora-obra`, `t101-portal-trabajadores` y `taller101` (y en `peek101` cuando exista). **Probado:** en el run 4 de «Publicar sitio» de `descargas`, el paso que usa el token salió verde. Los otros repos se comprueban en su primer deploy. Si no se sabe si el token viejo ya se revocó, no lo supongas | deploy solo |
| M3 | ✅ **Hecho el 10-sep:** repo privado `peek101` creado, vacío. Mike dice que dejó Workflow permissions en *Read and write*; se comprueba en el primer run | dónde vivir |
| M7 | Subir al proyecto `suite101-arquitectura.md` (7-sep) | los nombres de las etapas 0 a 7 |
| M8 | Conector de **Google Drive** en la sesión que entregue la ficha | subir a `suite101/peek101/` |
| — | Decidir si el cliente ve el precio por ítem (§7) y cómo le llega la invitación (fase 4) | producto |

Si tu push en seco falla, avísale a Mike: M1 y M3 dicen que ya están hechos. Si el deploy sale con 403 de
Cloudflare, falta M2. Dilo con el mensaje exacto y no pidas nada más.

* * *

## 9 · Convenciones que no se negocian

- **Mike decide, el chat ejecuta y mide.** No se le pide que abra GitHub, que
  haga merge ni que verifique.
- **El mensaje de un commit no es prueba de nada.** Tampoco este documento. Se
  abre el archivo y se mide.
- **Ninguna llave** se escribe en un chat, en un commit, en la bitácora ni en
  un archivo. Los secretos se comprueban porque el deploy sale verde, no
  leyéndolos.
- **Dinero en centavos, como entero.** Nunca `REAL`, nunca `parseFloat` para
  guardar.
- **Fuentes propias, cero Google Fonts.** Las cifras van en Fira Sans con
  `unicode-range`.
- **Nombres en minúsculas:** suite101, taller101, quote101, dash101, peek101.
- **No se renombra infraestructura** que ya vive (OPERAR §8). La única
  excepción decidida es la del repo de dash101.
- **Si no se pudo medir, se dice.** Nunca se supone.
- **Drive es la central del proyecto.** Todo lo que otro chat, app o Mike
  necesite ver va a la carpeta `suite101` de Google Drive (id
  `1DAInf5w-XgLyb7teIgTJOyfvMbLUotiv`): tu material de venta en
  `suite101/peek101/`, y cualquier entregable, reporte, captura o documento que
  se comparta, en esa misma carpeta con un `LEEME.md` que diga qué es cada
  archivo. El repo guarda la historia; Drive es donde se entrega y se lee.
  Lee `suite101/LEEME.md` antes de subir. Si tu sesión no tiene Drive, deja el
  archivo en `claude/` de tu repo y pide en el muro que alguien lo suba.

* * *

## 10 · Recados en el muro

Formato: `suite101-api/muro/AAAA-MM-DD-HHMM-peek101-de-que.md`. Es un archivo
nuevo cada vez y nunca se edita el de otro. Lleva tres renglones de encabezado:

```
de:    peek101
para:  todos | coordinador | dash101 | quote101 | peek101 | sitio
qué:   una línea
```

Van cuatro recados como mínimo:

1. **Al arrancar:** qué medí del alcance (push en seco sí o no) y qué voy a
   hacer.
2. **Antes de tocar `suite101-api`:** qué cambio, qué versión de contrato sale
   y a quién afecta.
3. **Al entregar el material de venta:** dónde quedó.
4. **Al cerrar la sesión:** qué quedó hecho, con números, y qué quedó sin
   verificar.
