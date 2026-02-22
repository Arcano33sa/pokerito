# Pokerito — v0.1.10 — Etapas 1–6/7

Proyecto estático (sin build) para PWA iPad landscape.

## Etapa 1
- Pestaña USUARIOS + HERO + botón COMPARTIR APP (sin Firebase)

## Etapa 2
- Firebase por CDN modular (Auth + Firestore): firebaseConfig.js + firebaseInit.js + carga en index.html

## Etapa 3
- Login Google en USUARIOS + estado de sesión

## Etapa 4
- Gate TOTAL por autorización (allowedUsers) + accessRequests (PENDING/REJECTED)

## Etapa 5
- Bootstrap del primer ADMIN por correo (dueño) para no quedar bloqueado
- Reglas de referencia en firestore.rules

## Etapa 6
- Panel ADMIN en USUARIOS: aprobar/rechazar solicitudes, asignar/cambiar rol, revocar acceso
- Regla anti-autogol: no dejar 0 ADMIN

## Correr local
- Sirve la carpeta con cualquier server estático (por ejemplo `python -m http.server 8080`)
- Abre http://localhost:8080
