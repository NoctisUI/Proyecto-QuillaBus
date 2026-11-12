# QuillaBus

Aplicación web y API REST para seguir en tiempo real los buses universitarios de Barranquilla. La app se sirve desde el mismo backend (`/`), usa paradas reales de Transmetro y campus, mapa OpenStreetMap y GPS real del conductor.

## Lo que incluye

- **Estudiante:** login/registro, mapa Leaflet, rutas y paradas reales, posición de buses cada 5 s, ETA por parada, alertas de llegada, favoritos y avisos.
- **Conductor:** inicio y fin de recorrido, reporte de avería, reanudación y envío de GPS real cada 5 s con `watchPosition`.
- **Administrador:** resumen operativo, rutas con paradas ordenables, paradas, buses, conductores y publicación de avisos.
- **Seguridad:** contraseñas con bcrypt, JWT de 8 h, autorización por rol, consultas parametrizadas, Helmet/CSP y límite de intentos fallidos.
- **Tiempo real:** el bus solo aparece si su recorrido está `EN_CURSO` y reportó una posición en los últimos 30 segundos. El ETA usa las paradas restantes y la velocidad promedio reciente.
- **Despliegue:** `render.yaml` para Render con PostgreSQL gestionado y HTTPS automático. También funciona en Railway.

## Cuentas demo (solo local)

La clave inicial es `Quilla2026!`, salvo que definas `DEMO_PASSWORD` antes de ejecutar `npm run setup`.

| Rol | Correo |
|---|---|
| Estudiante | `estudiante@universidad.edu.co` |
| Conductor | `conductor@universidad.edu.co` |
| Administrador | `admin@universidad.edu.co` |

## Inicio rápido local

### 1. Requisitos

- Node.js 18 o superior.
- PostgreSQL 13 o superior.
- Un navegador moderno. El GPS requiere **HTTPS** o **localhost**.

### 2. Base de datos

Con PostgreSQL instalado, crea la base:

```bash
createdb quillabus
```

En este equipo ya existe una instalación portable de PostgreSQL en `../.localpg`. Para iniciarla en Windows:

```powershell
cd C:\Users\USUARIO\proyecto_ing_software
& .\.localpg\pgsql\bin\pg_ctl.exe -D .\.localpg\data -o "-p 5432 -h 127.0.0.1" -l .\.localpg\postgres.log start
```

Si la base `quillabus` no existe todavía, desde `quillabus-backend` puedes ejecutar `npm run db:create` (está pensado para el PostgreSQL local en `127.0.0.1:5432` con usuario `postgres`).

### 3. Instalar y arrancar

```powershell
cd quillabus-backend
Copy-Item env.example .env
npm install
npm run build       # genera public/quillabus.html desde frontend/
npm run setup       # crea tablas y carga paradas, rutas, buses, avisos y usuarios demo
npm start
```

Abre <http://localhost:3000>. La app y la API comparten el mismo origen, por lo que no hay CORS ni URLs separadas.

Para desarrollo con recarga automática del backend: `npm run dev`.

### 4. Simular el GPS de un bus

Con el servidor encendido, en otra terminal:

```bash
npm run simular
```

El simulador inicia (o reutiliza) un recorrido del conductor demo y envía una posición cada 5 segundos recorriendo las paradas reales.

Contra un despliegue remoto:

```powershell
$env:API = "https://tu-app.onrender.com/api"
$env:DEMO_PASSWORD = "la-clave-configurada-en-el-servidor"
npm run simular
```

## Uso de la app

### Estudiante

1. Ingresa con la cuenta demo o crea una cuenta con correo `.edu.co`.
2. En **Mapa** elige una ruta y una parada. El ETA y la lista de buses se actualizan cada 5 s.
3. Pulsa **Activar alerta** para recibir un aviso cuando el bus esté a 1, 3, 5, 10 o 15 minutos.
4. En **Rutas** busca por nombre de ruta o parada, guarda favoritas y abre una parada directamente en el mapa.
5. En **Avisos** aparecen los comunicados vigentes publicados por el administrador.

### Conductor

1. Abre la app desde `http://localhost:3000` o desde la URL HTTPS publicada. Si abres el archivo HTML directamente, el navegador bloqueará el GPS.
2. Elige ruta y bus disponible, y pulsa **Iniciar recorrido**.
3. Acepta el permiso de ubicación. La app muestra latitud, longitud, precisión y último envío; transmite cada 5 s mientras el recorrido está en curso.
4. **Reportar avería** pausa la difusión del bus. **Reanudar** la reactiva. **Finalizar** cierra el recorrido y retira el bus del mapa.
5. Mantén la pantalla de QuillaBus abierta y el GPS encendido. Si el navegador suspende la pestaña, al volver se reanuda el envío en el siguiente ciclo.

### Administrador

El panel permite:

- Ver rutas activas, buses en servicio, conductores y avisos vigentes.
- Crear rutas y marcar sus paradas en orden; activar/desactivar rutas.
- Crear y activar/desactivar paradas con coordenadas.
- Crear buses y cambiar su estado (`DISPONIBLE`, `AVERIA`, `INACTIVO`).
- Crear conductores y activar/desactivar sus cuentas.
- Publicar avisos con fecha de vigencia.

## Datos reales

El seed incluye 23 paradas tomadas de OpenStreetMap: estaciones de Transmetro (Portal de Soledad, Pacho Galán, Pedro Ramayá, Estadio Metropolitano, La Catedral, Joe Arroyo, etc.) y puntos de referencia como Uninorte, Uniatlántico, Gran Malecón y el Parque Cultural del Caribe.

Rutas sembradas:

| Ruta | Paradas |
|---|---|
| Ruta 1 · Portal de Soledad – Joe Arroyo | 15 |
| Ruta 2 · Uninorte – Centro | 6 |
| Ruta 3 · Uniatlántico – Gran Malecón | 8 |

El mapa usa **Leaflet 1.9.4 + OpenStreetMap**. Si el servicio público de rutas OSRM responde, dibuja el trazado por calles; si no, usa una línea entre paradas. Ninguna de las dos opciones impide ver buses, ETA o alertas.

## API

Todos los endpoints van bajo `/api`. Salvo salud, login y registro, requieren `Authorization: Bearer <token>`.

| Rol | Método y ruta | Función |
|---|---|---|
| Público | `GET /salud` | Estado del servicio |
| Público | `POST /auth/registro`, `POST /auth/login` | Registro de estudiante e inicio de sesión |
| Todos | `GET /rutas`, `GET /rutas/:id/paradas`, `GET /rutas/:id/buses` | Rutas, paradas y buses visibles |
| Todos | `GET /paradas/:id/eta?ruta=ID` | ETA; `204` si no hay buses en servicio |
| Todos | `GET /avisos` | Avisos vigentes |
| Estudiante | `GET/POST /alertas`, `PATCH/DELETE /alertas/:id` | Alertas de llegada |
| Estudiante | `GET/POST /favoritos`, `DELETE /favoritos/:id` | Rutas y paradas favoritas |
| Estudiante | `POST /push/token` | Registrar token de Firebase |
| Conductor | `POST /recorridos`, `POST /recorridos/:id/finalizar`, `/averia`, `/reanudar` | Ciclo del recorrido |
| Conductor | `POST /buses/:id/ubicacion` | Enviar GPS del bus |
| Conductor | `GET /buses`, `GET /conductor/recorrido` | Buses y recorrido activo |
| Admin | `GET /admin/resumen` | Indicadores |
| Admin | `GET/POST/PATCH /admin/rutas`, `PUT /admin/rutas/:id/paradas` | Gestión de rutas |
| Admin | `GET/POST/PATCH /admin/paradas` | Gestión de paradas |
| Admin | `GET/POST/PATCH /admin/buses` | Gestión de buses |
| Admin | `GET/POST/PATCH /admin/conductores` | Gestión de conductores |
| Admin | `GET /admin/avisos`, `POST /avisos` | Gestión de avisos |

## Estructura

```text
quillabus-backend/
├─ server.js                 API Express + servidor de la app
├─ setup.js                  Esquema y datos reales iniciales
├─ simulador.js              GPS simulado para pruebas
├─ schema.sql                Modelo PostgreSQL
├─ frontend/                 Fuente de la app en partes
│  ├─ 01-head.html           Metadatos, Leaflet y estilos
│  ├─ 03-core.js             Estado, API, sesión y autenticación
│  ├─ 04-estudiante.js       Mapa, rutas, ETA, alertas y avisos
│  ├─ 05-conductor.js        Recorrido y GPS real
│  ├─ 06-admin.js            Panel de administración
│  └─ 07-init.js             Latido de 5 s y push opcional
├─ public/
│  ├─ quillabus.html         Generado por npm run build
│  ├─ firebase-config.js     Configuración opcional de FCM
│  ├─ firebase-messaging-sw.js
│  └─ favicon.svg
├─ scripts/
│  ├─ build-frontend.js      Une frontend/ en un único HTML
│  └─ create-db.js
├─ env.example
├─ render.yaml               Blueprint si este directorio es la raíz del repo
└─ package.json
```

El HTML final se genera con `npm run build`. No edites directamente `public/quillabus.html`: edita `frontend/` y vuelve a compilar.

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión de PostgreSQL |
| `JWT_SECRET` | Sí | Clave larga y aleatoria para firmar tokens |
| `PORT` | No | Puerto HTTP; Render/Railway lo inyectan |
| `NODE_ENV` | No | `production` activa caché estática y CSP de producción |
| `CORS_ORIGIN` | No | Solo si otro origen consume la API; separa varios con comas |
| `DEMO_PASSWORD` | No | Clave inicial de los usuarios demo; úsala en producción |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | Ruta al JSON de servicio Firebase (local) |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | No | JSON completo de Firebase como variable (producción) |

## Despliegue en Render

Render ofrece HTTPS automático y PostgreSQL gestionado. Hay dos formas según cómo organices el repositorio:

### Opción A: el repositorio incluye la carpeta `quillabus-backend` (recomendada)

En la raíz de este proyecto ya existe `render.yaml` con `rootDir: quillabus-backend`. El repositorio está publicado en <https://github.com/NoctisUI/Proyecto-QuillaBus>.

1. Abre el [flujo de Blueprint en Render](https://render.com/deploy?repo=https://github.com/NoctisUI/Proyecto-QuillaBus) e inicia sesión con GitHub.
2. Autoriza el repositorio (público o privado, según corresponda) y confirma `render.yaml`.
3. Render crea la base `quillabus-db` y el servicio web. En el primer arranque, `npm run setup` crea las tablas y siembra los datos.
4. En **Environment** del servicio, copia el valor generado de `DEMO_PASSWORD` para entrar como administrador. `JWT_SECRET` también se genera automáticamente.
5. Abre la URL `https://tu-app.onrender.com`. La app se sirve en `/` y la API en `/api`.

Si haces cambios locales, publícalos con:

```bash
git push origin main
```

Render volverá a desplegar automáticamente porque el Blueprint tiene `autoDeploy: true`.

### Opción B: el repositorio es solo la carpeta del backend

Si subes `quillabus-backend` como raíz del repositorio, Render usará su `render.yaml` (sin `rootDir`). Los pasos son los mismos.

### Configuración manual (si no usas Blueprint)

- Runtime: Node.
- Build: `npm install && npm run build`.
- Start: `npm run setup && npm start`.
- Health check: `/api/salud`.
- Variables: `DATABASE_URL` (de la base de Render), `JWT_SECRET`, `DEMO_PASSWORD`, `NODE_ENV=production`.
- Si usas la URL externa de PostgreSQL y exige SSL: agrega `?sslmode=require` a `DATABASE_URL`.

### Railway

1. Crea un proyecto y agrega **PostgreSQL**.
2. Agrega un servicio desde el repositorio. Si publicas el proyecto completo, define **Root Directory** = `quillabus-backend`.
3. Build: `npm install && npm run build`. Start: `npm run setup && npm start`.
4. Variables: `DATABASE_URL` (referencia al plugin de PostgreSQL), `JWT_SECRET`, `DEMO_PASSWORD`, `NODE_ENV=production`.
5. Genera un dominio público; Railway y Render entregan HTTPS automático, necesario para el GPS.

> Los planes gratuitos pueden dormir el servicio, limitar recursos o caducar la base de datos. Para un uso real, revisa el plan y configura respaldos. `npm run setup` no borra datos: si ya existen usuarios, se salta el seed.

## Notificaciones push opcionales (Firebase)

La app funciona sin Firebase. Para activar push:

1. Crea un proyecto en Firebase y agrega una app web.
2. Copia los datos de configuración en `public/firebase-config.js`:
   ```js
   self.QUILLABUS_FIREBASE = {
     config: { apiKey: "...", authDomain: "...", projectId: "...", messagingSenderId: "...", appId: "..." },
     vapidKey: "..."
   };
   ```
3. En Firebase Cloud Messaging > Web Push, genera una clave VAPID.
4. En el backend, define `GOOGLE_APPLICATION_CREDENTIALS_JSON` con el JSON completo de la cuenta de servicio (o `GOOGLE_APPLICATION_CREDENTIALS` con la ruta en local).
5. Vuelve a desplegar. El botón **Activar** de la sección Alertas pedirá permiso y registrará el token; el backend envía la notificación cuando una alerta se cumple.

Sin esos valores, el botón aparece como **No configurado** y las alertas siguen funcionando dentro de la app.

## Seguridad y límites

- Las contraseñas se almacenan con bcrypt y los tokens expiran a las 8 horas.
- Todos los endpoints validan rol en el backend; el rol no se elige en el frontend.
- El login/registro limita intentos fallidos por IP. Los inicios exitosos no cuentan para el límite.
- CORS queda desactivado si `CORS_ORIGIN` está vacío, porque la app es del mismo origen.
- Helmet aplica CSP para permitir solo Leaflet/unpkg, tiles OSM, fuentes de Google, OSRM y Firebase.
- El GPS se comparte únicamente mientras el conductor tiene un recorrido en curso y lo autoriza en el navegador.
- En producción cambia `DEMO_PASSWORD` antes del primer `npm run setup`. Si ya sembraste la base, puedes cambiar la clave desde PostgreSQL o recrear la base de desarrollo.
- Un recorrido nunca se finaliza solo si el conductor cierra la pestaña; el administrador puede ver el estado y el conductor puede retomarlo al volver.

## Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| `Falta JWT_SECRET` | Copia `env.example` a `.env` y define `JWT_SECRET`. |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL no está iniciado. Arráncalo o revisa `DATABASE_URL`. |
| `La base ya tiene datos, no se cargó la demostración` | Es normal en despliegues posteriores. Para reiniciar en local, recrea la base. |
| El ETA muestra `—` | No hay buses en servicio. Inicia un recorrido desde la cuenta conductor o ejecuta `npm run simular`. |
| El mapa no carga | Revisa la conexión a unpkg/OpenStreetMap y la consola del navegador. El resto de funciones sigue operativo. |
| El GPS no envía | Abre la app por HTTPS o localhost, concede permiso de ubicación y pulsa **Reintentar GPS**. |
| `Demasiados intentos fallidos` | Espera unos minutos; el límite es por IP y solo cuenta intentos fallidos. |
| Push no se activa | Completa `public/firebase-config.js`, define las credenciales del backend y vuelve a desplegar. |
| Cambios del frontend no aparecen | Ejecuta `npm run build`; el HTML se sirve con `Cache-Control: no-cache`. |

## Verificación rápida

```bash
curl http://localhost:3000/api/salud
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"estudiante@universidad.edu.co","password":"Quilla2026!"}'
```

La app fue probada en Chrome con login de los tres roles, mapa Leaflet, búsqueda de paradas reales, creación de alertas, GPS del conductor transmitiendo, visibilidad del bus para el estudiante y panel de administración, sin errores de JavaScript ni violaciones de CSP.
