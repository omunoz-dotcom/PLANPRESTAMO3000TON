# Despliegue en la nube (Render) — paso a paso

Resultado: la plataforma queda en una dirección como `https://silos-control.onrender.com`, con **HTTPS**, accesible desde PC, Android e iOS, y con la base de datos en un **disco persistente**.

**Costo aproximado:** plan *Starter* (~7 USD/mes) + disco de 1 GB (~0,25 USD/mes). El plan gratuito **no sirve**: se apaga tras unos minutos sin uso y no guarda la base de datos.

---

## Paso 1 — Crear la cuenta en Render
1. Entra a **https://render.com** → **Get Started**.
2. Elige **Sign up with GitHub** y autoriza con la cuenta **omunoz-dotcom**.
3. Agrega un método de pago en **Billing** (requerido para el plan Starter).

## Paso 2 — Crear el servicio desde el Blueprint
El repositorio ya incluye el archivo `render.yaml`, que configura todo automáticamente.

1. En el panel de Render: **New +** → **Blueprint**.
2. Conecta el repositorio **omunoz-dotcom/PLANPRESTAMO3000TON** (si no aparece: *Configure account* y dale acceso).
3. Elige la rama: **`main`** (si ya se fusionó el pull request) o **`claude/eager-shannon-enzu5r`**.
4. Render mostrará el servicio **silos-control** con su disco **silos-data**.
5. Te pedirá el valor de **`ADMIN_PASSWORD`**: escribe una contraseña segura para el usuario `admin` (mínimo 8 caracteres; guárdala).
6. Pulsa **Apply**. La primera publicación tarda 3–5 minutos.

## Paso 3 — Verificar
1. Abre el servicio **silos-control** → copia la dirección (`https://silos-control.onrender.com` o similar).
2. Ábrela en el navegador: debe aparecer la pantalla de ingreso.
3. Ingresa con **admin** y la contraseña del paso 2.5.
4. Comprobación técnica opcional: `https://TU-DIRECCION/api/health` debe responder `{"ok":true,...}`.

## Paso 4 — Configuración inicial (como Jefe de Área)
1. **Usuarios** → crea un usuario por colaborador con su rol.
2. **Programa** → ajusta zonas, equipos y actividades de limpieza.
3. **Mi perfil** → *Activar notificaciones*.

## Paso 5 — Instalar en los dispositivos
Comparte la dirección con el personal:
- **Android (Chrome):** abrir la dirección → menú ⋮ → **Instalar aplicación**.
- **iPhone (Safari):** abrir la dirección → botón **Compartir** → **Agregar a pantalla de inicio**. Luego abrirla desde el ícono y activar notificaciones en *Mi perfil*.
- **PC:** Chrome o Edge → ícono **Instalar** en la barra de direcciones (o usarla en el navegador).

Cada colaborador debe **ingresar una vez con internet** en su dispositivo; desde entonces puede trabajar sin señal.

## Paso 6 (opcional) — Dirección propia
Para usar algo como `https://silos.tuempresa.com`: en Render → servicio → **Settings → Custom Domains** → agregar el dominio y crear el registro **CNAME** que indique Render (lo hace el área de TI). El certificado HTTPS es automático.

---

## Operación

| Tema | Cómo |
|---|---|
| **Actualizaciones** | Cada cambio subido a la rama configurada se publica solo (`autoDeploy`). Los celulares toman la nueva versión al abrir la app con conexión. |
| **Respaldos** | Render guarda instantáneas diarias del disco (*Disks → Snapshots*). Además se recomienda descargar una copia mensual de los reportes en CSV. |
| **Registros / errores** | Servicio → **Logs**. |
| **Zona horaria** | `UTC_OFFSET=-5` (Ecuador). Cambiar en *Environment* si aplica. |
| **Olvido de contraseña admin** | Otro admin la cambia desde *Usuarios*. Si no hay otro admin, pedir soporte técnico. |

## Alternativas
El proyecto incluye un `Dockerfile` estándar, por lo que también puede desplegarse en **Railway**, **Fly.io**, **Azure App Service** o **Google Cloud Run** (este último requiere una base de datos externa porque no tiene disco persistente). En todos los casos: montar un volumen en `/var/data` y definir `ADMIN_PASSWORD`.
