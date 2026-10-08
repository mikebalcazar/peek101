# peek101 · dónde quedó

## 8-oct-2026 · el look de cost101

Mike, 8-oct: «todas las plataformas en toda suite 101 (…) con el diseño look
and feel de cost101 pero siguiendo los parámetros de tipografía y de logo de
dash y quell». Hecho aquí en `public/estilo.css`:

- En pantalla siempre oscuro: degradado azul de cost101, tarjetas de vidrio,
  botones redondos (principal blanco), barra de vidrio. Al imprimir (el
  estado de cuenta en PDF) vuelven los claros de antes.
- Tipografía igual: Cifras + Raleway locales; títulos en 600. Sansation ya no
  se declara: sólo vive dentro del logo, en trazos.
- Logo oficial `public/peek101-claro.svg` (ya no el círculo con «101»).
- De paso: el cuadro del código de 6 dígitos (`input.pin`) se encogía a un
  círculo de 22 px desde el 5-oct porque heredaba el estilo de los pines del
  plano; ahora esos estilos son `button.pin`.

Probado: `npm run prueba` completo contra el banco local + API de staging
(org demo), y capturas a 1440×900 y 390×844 sin desborde ni texto oscuro
sobre oscuro.
