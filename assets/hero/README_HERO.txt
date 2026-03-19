Pokerito — HERO images (Inicio)

Este folder contiene los héroes usados por las tarjetas del Inicio.
La app intenta cargar primero archivos premium con patrón hero_<modulo> y, si no existen,
usa los SVG base como fallback sin romper nada.

Módulos actuales:

  hero_juego.webp   (o .png / .jpg / .jpeg / .svg)
  hero_admin.webp   (o .png / .jpg / .jpeg / .svg)
  hero_archivo.webp (o .png / .jpg / .jpeg / .svg)

Fallos tolerados:
- Si no existe hero_<modulo>, se mantiene el SVG base correspondiente.
- Los SVG base actuales siguen siendo juego.svg, admin.svg y archivo.svg.


Actualización final Pokerito:
- hero_admin.png = hero aprobado de Administración.
- hero_archivo.png = hero aprobado de Archivo.
- Se retiraron los placeholders hero_admin.svg y hero_archivo.svg; los SVG base admin.svg y archivo.svg quedan solo como fallback.
