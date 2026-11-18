# peek101 · dónde quedó

## 18-nov-2026 · 1.0.3: «Precio por cargar» y lo que se cobra (API 0.105.0)

Mike, 18-nov: «Vamos a separar la contabilidad. Ya no va a ir ligada a los
ítems. Los precios de los proyectos se harán por aparte.» El precio de cada
obra son sus conceptos de cobro y, mientras no tenga, está por cargar (la API
puso todos en cero con respaldo, decisión de Mike con botones).

- Tarjeta y detalle: «Por cargar» en el monto y «—» en el saldo, sin
  porcentaje pagado. Arriba se dice cuántos proyectos están así; el saldo
  global ya los deja fuera (lo hace /peek).
- Detalle: bloque «Lo que se cobra» con los conceptos agrupados por
  cotización, de la misma respuesta de /estado que el desglose. La columna
  «Monto» de los productos se quitó: ya no suman el precio y el cliente
  sumaría dos cosas distintas.
- Medido: `el-desglose-de-su-obra` 4 de 4 y las demás de `npm run prueba`
  en verde; `portal.spec` contra staging con el banco local.

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
