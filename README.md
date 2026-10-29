# LuzMap · Projection mapping en el navegador

Esta app de **projection mapping** funciona en el navegador, en la línea de SurfaBeam Pro. Con ella encajas superficies sobre objetos reales (paredes, cajas, la furgo, una puerta, una rueda…) y proyectas encima tus **imágenes y vídeos**.

No hace falta instalar nada. Funciona en Chrome o Edge (recomendado) y en Firefox, y se puede usar sin conexión.

## ▶ Abrir la app

**https://raw.githack.com/camperuzzzo/luzmap/main/index.html**

Ábrelo en Chrome, en el ordenador o en el móvil. Si cambias el código, la versión nueva tarda unos minutos en aparecer en ese enlace.

## Cómo usarla

1. Abre el enlace de arriba en Chrome. También puedes descargar el repositorio y abrir `index.html` con doble clic.
2. Conecta el proyector como **pantalla extendida** (no duplicada).
3. Pulsa **Proyectar**. Se abre una ventana negra: llévala al proyector y haz **doble clic** (o pulsa `F`) para ponerla a pantalla completa.
   Si solo tienes una pantalla, usa el botón de pantalla completa del editor.
4. Añade un **Plano** por cada cara del objeto. Verás en la pared un patrón de prueba numerado: arrastra las **4 esquinas** hasta que coincidan con las del objeto real. Las flechas del teclado mueven 1 px y `Shift`+flechas mueven 10 px.
5. **Importa** tus imágenes o vídeos y arrástralos sobre cada superficie.
6. Desactiva las **Guías** (`G`) y empieza el show. **Guardar** descarga un archivo `.luzmap` con el mapeo y todos los medios.

Dentro de la app, el botón **?** abre la guía completa con todos los atajos.

## En el móvil (Samsung Galaxy S23 y otros Android)

1. Abre el enlace de la app en **Chrome**. Con **⋮ → Añadir a pantalla de inicio** queda instalada como app y funciona sin internet.
2. Conecta el móvil al proyector:
   - **Con cable**: adaptador **USB-C a HDMI**. Si se abre Samsung DeX, cámbialo a **Duplicar pantalla** (desde la notificación de DeX o los ajustes rápidos).
   - **Sin cable**: **Smart View** desde los ajustes rápidos, si el proyector o la tele admiten duplicar pantalla.
3. Prepara las superficies e importa tus fotos o vídeos de la galería. Toca un medio para ponerlo en la superficie seleccionada.
4. Pulsa **Proyectar**: el escenario se pone a pantalla completa en horizontal, y eso es lo que sale por el proyector. Mueve las esquinas con el dedo; puedes tocar cerca del punto, no hace falta taparlo.
5. Para afinar sin teclado, usa **Ajuste fino** en el panel de la superficie: flechas en pantalla con paso de 1, 10 o ¼ px.
6. Sal con el gesto **Atrás**, desactiva **Guías** y vuelve a **Proyectar** para el show. La pantalla no se apaga mientras la app está abierta.

## Funciones

- **Esquinas (perspectiva real)**: cada plano tiene 4 puntos y la imagen se deforma con perspectiva correcta, no con un simple estirado.
- **Malla de deformación** de 1×1 a 12×12 puntos con interpolación suave, para superficies curvas (carrocerías, columnas, toldos).
- **Máscaras** poligonales para recortar formas. Se pueden invertir para hacer agujeros, y hay una máscara elíptica que sigue la perspectiva.
- **Dibujar forma**: haz clic alrededor de un objeto y se crea una superficie con ese contorno.
- **Contenido** de cada superficie:
  - imagen
  - vídeo (bucle, velocidad, volumen)
  - color sólido
  - efectos animados: plasma, degradado, franjas, arcoíris, bordes de neón, pulso, barrido
  - texto (fijo o en marquesina)
  - cámara web
  - patrón de calibración
- **Ajustes de contenido**: encaje (estirar, rellenar, encajar, mosaico), zoom, giro, desplazamiento, espejo, opacidad, brillo, contraste, saturación y tono.
- **Ajustes de superficie**: borde suave y modos de fusión (sumar luz, trama, multiplicar).
- **Escenas**: cada escena guarda qué se proyecta en cada superficie. Cambias de escena con fundido usando las teclas `1`…`9`, o las reproduces en bucle con una duración por escena.
- **Edición precisa**: imán entre esquinas de superficies vecinas, rejilla con ajuste, deshacer y rehacer, y bloqueo de superficies.
- **Ventana de proyector sincronizada**: también puedes arrastrar las esquinas directamente sobre la proyección. En Chrome, con el permiso de *gestión de ventanas*, la ventana se coloca sola en la segunda pantalla.
- **Guardado automático** en el navegador. Los medios se guardan en IndexedDB, así que siguen ahí al volver.
- **Proyectos portables** en `.luzmap`: un único archivo con el mapeo y los medios. También se puede exportar solo el mapeo en `.json`.
- **PWA**: se puede instalar como app y funciona sin internet cuando se sirve por `http(s)`.

## Dirección propia (opcional)

Si quieres una dirección más corta, activa GitHub Pages en **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**. En un minuto la app estará también en `https://camperuzzzo.github.io/luzmap/`.

Para probarla en local, ejecuta `python3 -m http.server` en esta carpeta y abre <http://localhost:8000>.

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `index.html`, `js/editor.js` | Editor: paneles, biblioteca, escenas, inspector y atajos |
| `output.html`, `js/output.js` | Ventana de salida para el proyector |
| `js/renderer.js` | Render WebGL: perspectiva, malla, máscaras (stencil), efectos y fundidos |
| `js/geom.js` | Homografía, malla Catmull-Rom y utilidades de polígonos |
| `js/stage.js`, `js/overlay.js` | Escenario, guías y edición con ratón o teclado |
| `js/state.js` | Modelo del proyecto y deshacer/rehacer |
| `js/media.js` | Medios (IndexedDB), vídeos, cámara, textos y patrones |
| `js/link.js` | Sincronización entre editor y proyector |
| `js/project-file.js` | Formato `.luzmap` |

## Consejos

- Usa vídeos en **MP4 (H.264)** o **WebM**.
- Oscurece la sala y coloca el proyector lo más de frente posible al objeto.
- El sonido de los vídeos sale por el ordenador del editor. El proyector siempre va en silencio.
