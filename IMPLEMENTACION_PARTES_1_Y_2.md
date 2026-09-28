# Implementación de las Partes 1 y 2

Documento de referencia de lo implementado para el backend de GymGo y su aplicación móvil. La API está desplegada en Render y la app utiliza esa URL de forma predeterminada.

## Parte 1: Backend

### Arquitectura

El backend vive en `api/` y usa Node.js 20+, Express 5 y MongoDB con Mongoose. La estructura separa configuración de entorno y base de datos, modelos, controladores, rutas, middleware y utilidades.

Dependencias principales: `express`, `mongoose`, `cors`, `dotenv`, `jsonwebtoken`, `bcryptjs`, `helmet`, `express-rate-limit` y `zod`. El contrato de ejecución usa `npm start`; en Render, el directorio raíz del servicio es `api`, el build es `npm ci` y el start es `npm start`. El puerto se toma del valor `PORT` inyectado por Render, con 3000 como valor local predeterminado.

El endpoint `GET /health` devuelve el estado de la API. La conexión a MongoDB se inicializa antes de aceptar tráfico y el proceso cierra servidor y conexión ante `SIGTERM` o `SIGINT`.

### Modelos

- **User:** nombre, correo, hash de contraseña, rol, estado de cuenta, datos de perfil, membresía, Coach asignado y estado dentro/fuera del gimnasio. Roles implementados: `Admin`, `Coach` y `Cliente`.
- **Routine:** objetivo, nivel, duración, días semanales, ejercicios, estado, cliente asignado y autor. Cada ejercicio incluye grupo muscular, series, repeticiones, peso sugerido, descanso y orden.
- **AccessIoT:** usuario, tipo de evento (`check-in`/`check-out`), origen, lector IoT, identificador único del QR y fecha del evento.

### Autenticación y permisos

Las contraseñas se guardan hasheadas con bcrypt. El login entrega un JWT firmado con expiración configurable; el middleware obtiene la cuenta vigente y `authorize` controla el acceso por rol. Las entradas se validan con Zod y la API aplica Helmet, CORS y límites de solicitudes.

| Método y ruta | Acceso | Uso |
| --- | --- | --- |
| `POST /api/auth/register` | Público | Registra un Cliente con membresía `pending`. |
| `POST /api/auth/login` | Público | Inicia sesión y devuelve JWT y perfil. |
| `POST /api/auth/bootstrap-admin` | Temporal, clave de bootstrap | Crea el primer Admin si el bootstrap está habilitado y aún no existe uno. |
| `POST /api/auth/users` | Admin | Crea un Coach o Cliente; puede vincular el cliente a un Coach. |
| `PATCH /api/auth/users/:id/membership` | Admin | Actualiza estado e intervalo de vigencia de la membresía de un Cliente. |
| `GET /api/auth/me` | JWT | Devuelve el perfil de la sesión actual. |
| `GET /api/routines` | JWT | Devuelve rutinas visibles para el rol: propias del Cliente, de clientes asignados para Coach o todas para Admin. |
| `POST /api/routines` | Admin o Coach | Crea y asigna rutina; Coach solo puede asignarla a sus propios clientes. |
| `GET /api/routines/:id` | JWT con autorización | Consulta una rutina propia, de un cliente asignado o Admin. |
| `PATCH /api/routines/:id` | Admin o Coach autorizado | Modifica una rutina. |
| `DELETE /api/routines/:id` | Admin o Coach autorizado | Elimina una rutina. |
| `POST /api/access/qr` | Cliente con membresía activa | Emite un QR firmado de corta duración. |
| `POST /api/iot/access` | Dispositivo autenticado | Valida el QR y registra entrada o salida. |

### Acceso IoT mediante QR

1. El Cliente autenticado solicita `POST /api/access/qr`.
2. La API solo emite el token si la cuenta y la membresía están activas. El QR tiene un identificador único (`jti`), audiencia IoT y expiración configurada con `QR_TOKEN_TTL_SECONDS` (60 segundos por defecto).
3. El lector envía por HTTPS `{"qrToken":"...","deviceId":"lector-entrada"}` a `POST /api/iot/access`, incluyendo el header `x-device-key`.
4. La API verifica firma, expiración, audiencia, membresía y estado de cuenta; rechaza códigos reutilizados y alterna check-in/check-out.
5. El cambio de estado y el registro de asistencia se guardan en una transacción MongoDB. Atlas debe soportar transacciones (clúster replica set).

### Configuración sensible y Render

Las variables se describen en `api/.env.example`. En Render deben definirse, como mínimo, `MONGO_URI`, `JWT_SECRET`, `QR_TOKEN_SECRET`, `IOT_DEVICE_API_KEY`, `ADMIN_BOOTSTRAP_KEY` y `NODE_ENV=production`; los secretos JWT y QR deben ser distintos y fuertes. `CORS_ORIGINS` permite restringir orígenes web.

Para crear el primer Admin, configura `ENABLE_ADMIN_BOOTSTRAP=true` de forma temporal. Envía a `/api/auth/bootstrap-admin` un JSON con `name`, `email`, `password` (mínimo 10 caracteres) y `bootstrapKey` igual a `ADMIN_BOOTSTRAP_KEY`. Después de crearlo, cambia `ENABLE_ADMIN_BOOTSTRAP=false` y elimina o rota la clave de bootstrap. Si ya existe un Admin, inicia sesión con esa cuenta; el endpoint inicial responde conflicto y no crea otro.

No se deben copiar `MONGO_URI`, secretos, claves IoT ni tokens a la app móvil. El `.env` real no se versiona; solo se publica `.env.example` con placeholders.

## Parte 2: Aplicación móvil

### Estructura y estado de sesión

La app mantiene Expo Router (SDK 57) como sistema de navegación, en vez de añadir un segundo navigator React Navigation. El grupo `(auth)` contiene el acceso; `(main)` queda protegido por sesión y usa pestañas según el rol. El estado global se maneja con React Context y Hooks.

Axios usa como base `https://sirid-systemsappmovil.onrender.com/api`; se puede sobrescribir con `EXPO_PUBLIC_API_URL`. Un interceptor adjunta `Authorization: Bearer <JWT>` a cada llamada autenticada. En iOS y Android el JWT se guarda en `expo-secure-store`; en web se usa `sessionStorage`. Al arrancar, la app valida la sesión con `/api/auth/me` y descarta tokens inválidos. El login y el registro de Cliente están en `src/features/gymgo/auth-screen.tsx`.

Dependencias móviles añadidas para esta integración: `axios`, `react-native-qrcode-svg` y `react-native-svg` (instalado en la versión compatible con Expo SDK 57). Se reutiliza `expo-secure-store`, ya presente en el proyecto.

### Vistas por rol

- **Cliente:** dashboard con estado de membresía y conteo de rutinas, pantalla de acceso con QR renovable y temporizador, y consulta de rutinas con ejercicios, series, repeticiones, peso y descanso.
- **Admin:** dashboard operativo básico, creación de cuentas de Cliente desde la app y asignación opcional por ID de Coach. Las membresías creadas quedan pendientes y se deben activar antes de permitir el acceso QR.
- **Coach:** dashboard, rutinas de sus clientes y resumen básico de clientes que se identifican desde las rutinas asignadas.
- **Todos los roles:** pueden cerrar sesión. Los tabs visibles dependen del rol recibido desde la API.

El QR en la app se vuelve a solicitar cada 45 segundos, antes de su expiración predeterminada de 60 segundos, y ofrece un botón de reintento si falla la petición.

### Crear cuentas Admin y Coach

El registro público de la app crea únicamente Clientes. El primer Admin se crea mediante el bootstrap temporal de la API descrito arriba. Después, un Admin crea Coaches con `POST /api/auth/users`, usando `Authorization: Bearer <JWT_ADMIN>` y un cuerpo como:

```json
{
  "name": "Nombre del Coach",
  "email": "coach@tugimnasio.com",
  "password": "[contraseña de al menos 10 caracteres]",
  "role": "Coach"
}
```

Admin y Coach después inician sesión en la misma pantalla de acceso, con sus correos y contraseñas. La app determina sus permisos y pestañas mediante el campo `role` que devuelve la API.

### Comandos de desarrollo y validación

Desde la raíz del proyecto:

```powershell
npm install
npx expo start
npx expo lint
npx tsc --noEmit
npx expo-doctor
npx expo export --platform web
```

Para el backend, desde `api/`:

```powershell
npm ci
npm test
npm start
```

## Alcance pendiente

La primera y segunda parte son una base funcional conectada a Render, no la implementación de todos los módulos del README. Aún no están desarrollados: login por OTP/correo, flujo de invitación de Coach por email, directorio de clientes con nombres y perfiles, editor de rutinas dentro de la app, métricas reales de demanda y ocupación, historial de entrenamientos, pagos, inventario, mantenimiento, notificaciones push, ventas ni PIN/NFC.

La app Admin permite crear Clientes, pero la creación de Coach se realiza actualmente por el endpoint protegido de la API. El dashboard indica que las métricas de demanda no están disponibles; no muestra datos ficticios. Antes de producción comercial conviene añadir pruebas de integración de autenticación/QR y revisar las alertas moderadas de dependencias transitivas reportadas por `npm audit` sin forzar actualizaciones incompatibles del SDK Expo.
