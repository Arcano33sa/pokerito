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
