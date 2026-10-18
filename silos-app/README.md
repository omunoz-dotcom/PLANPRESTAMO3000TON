# Silos · Control de Área

Plataforma para el control de **orden y limpieza**, **daños de equipos** y **alertas de eventos** del área de silos (almacenera de granos).

- Funciona en **PC (navegador)**, **en línea** y como **app instalable en Android e iOS** (PWA).
- **Trabaja sin internet**: todo se guarda en el dispositivo y **se sube automáticamente** apenas hay conexión.
- **Usuarios por colaborador** con **roles**: Jefe de Área (admin), Supervisor, Mantenimiento, Operador, Limpieza.
- **Alertas en tiempo real** con sonido, vibración y notificación; tiempos de respuesta por severidad.
- Tareas **operativas, de gestión y de limpieza**, programa de limpieza que **genera tareas por turno/día/semana/mes**, inspecciones **5S** con tareas correctivas automáticas, y reportes exportables a Excel.

El plan de gestión (roles, frecuencias, matriz de alertas, KPIs) está en [`docs/PLAN_CONTROL_LIMPIEZA.md`](docs/PLAN_CONTROL_LIMPIEZA.md).

## Arquitectura

```
 Celular / Tablet / PC  (PWA)                         Servidor (Node.js)
 ┌──────────────────────────────┐   HTTPS /api/sync   ┌────────────────────────┐
 │ Interfaz (HTML/JS)           │ ──────────────────▶ │ Permisos por rol       │
 │ IndexedDB (datos locales)    │ ◀────────────────── │ SQLite (silos.db)      │
 │ Cola de envío (offline)      │   /api/stream (SSE) │ Generador de tareas    │
 │ Service Worker (app offline) │ ◀── alertas ─────── │ Alertas en tiempo real │
 └──────────────────────────────┘                     └────────────────────────┘
```

- **Sin dependencias externas**: solo Node.js ≥ 22.13 (usa `node:sqlite` incorporado). Nada que instalar con npm.
- **Sincronización**: cada registro tiene un ID único generado en el dispositivo; el servidor aplica “última modificación gana” y **valida permisos por rol** (un operador no puede cerrar alertas ni editar el título de una tarea, aunque manipule la app).
- **Sesión sin conexión**: tras ingresar una vez en línea, el usuario puede volver a entrar en ese dispositivo sin señal (contraseña verificada localmente con PBKDF2). Varios colaboradores pueden compartir una tablet.
- **Fotos**: se comprimen en el dispositivo (~150 KB) antes de guardarse.

## Puesta en marcha

```bash
cd silos-app
npm start             # producción  → http://localhost:8080
npm run demo          # con usuarios de prueba (contraseña demo123)
npm test              # pruebas del servidor
```

Usuario inicial: **admin / admin123** (cámbielo en *Mi perfil*). Con `npm run demo` también se crean `supervisor`, `operador`, `limpieza` y `mantenimiento` (contraseña `demo123`).

Variables de entorno:

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | 8080 | Puerto HTTP |
| `DATA_DIR` | `./data` | Carpeta de la base de datos (respaldar a diario) |
| `ADMIN_PASSWORD` | admin123 | Contraseña del admin al crear la base |
| `UTC_OFFSET` | -5 | Zona horaria (Ecuador) para generar tareas por turno |
| `TOKEN_DAYS` | 30 | Días de validez de la sesión (permite trabajar offline) |
| `SECRET` | autogenerado | Clave para firmar sesiones |
| `TRUST_PROXY` | 0 | `1` cuando corre detrás del proxy HTTPS de la nube |

## Despliegue

**Nube (recomendado): guía paso a paso en [`docs/DESPLIEGUE_NUBE.md`](docs/DESPLIEGUE_NUBE.md)** — Render con el `render.yaml` incluido, o cualquier servicio compatible con Docker.

Para que funcione en celulares (cámara, instalación, modo offline) el sitio debe servirse por **HTTPS**. Opciones:

1. **Servidor en planta** (recomendado si la red interna llega a toda el área): un PC/servidor con Node.js detrás de un proxy HTTPS (IIS, Nginx o Caddy) con certificado de la empresa.
2. **Nube** (si hay datos móviles en el área): cualquier VPS o servicio con Node.js 22 (Azure App Service, Railway, Render, etc.) montando `DATA_DIR` en un disco persistente.

Respaldo: copiar `data/silos.db` (con el servicio detenido o usando `sqlite3 .backup`).

## Instalar en dispositivos

- **Android (Chrome)**: abrir la dirección → menú ⋮ → *Instalar aplicación*.
- **iPhone/iPad (Safari)**: abrir la dirección → Compartir → *Agregar a pantalla de inicio*. (Las notificaciones en iOS requieren iOS 16.4+ y la app instalada.)
- **PC (Chrome/Edge)**: ícono de instalar en la barra de direcciones, o usar directamente en el navegador.

Al ingresar por primera vez, en *Mi perfil → Activar notificaciones*.

### App nativa (tiendas Google Play / App Store) — siguiente fase

La misma carpeta `public/` puede empaquetarse con **Capacitor** sin reescribir la app:

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
npx cap init "Silos" com.almacenera.silos --web-dir public
npx cap add android && npx cap add ios
npx cap open android   # Android Studio  /  npx cap open ios (Xcode, requiere Mac)
```

En la app nativa, configure la dirección del servidor en la pantalla de ingreso (*Configuración del servidor*). La fase nativa permitiría además notificaciones push con la app cerrada (Firebase/APNs).

## Estructura

```
silos-app/
├── server/
│   ├── server.js      API, archivos estáticos, tiempo real (SSE)
│   ├── db.js          Esquema SQLite, contraseñas, datos iniciales
│   ├── rules.js       Permisos por rol y validación de cada registro
│   └── scheduler.js   Generación automática de tareas del programa
├── public/
│   ├── index.html, app.css, sw.js, manifest.webmanifest
│   └── js/
│       ├── catalog.js Zonas, roles, tipos de evento, SLA, checklist 5S (editar aquí)
│       ├── data.js    IndexedDB, cola offline, sincronización, sesión
│       ├── ui.js      Componentes, fotos, notificaciones, CSV
│       └── app.js     Pantallas
├── docs/PLAN_CONTROL_LIMPIEZA.md
└── test/api.test.js
```

## Limitaciones conocidas (v1)

- Notificaciones con la app **cerrada** no están incluidas (requiere Web Push o app nativa). Con la app abierta o en segundo plano reciente, las alertas suenan y notifican.
- Conflictos: si dos personas editan el mismo registro sin conexión, gana la última modificación; los comentarios nunca se pierden porque cada uno es un registro independiente.
- La gestión de usuarios requiere conexión.
