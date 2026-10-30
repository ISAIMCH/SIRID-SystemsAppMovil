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
- **Equipment:** nombre, zona, marca, estado (`available`, `busy`, `out_of_service`) y frecuencia de uso.
- **Payment:** cliente, plan/precio al solicitar, duración, método en recepción, referencia, estado y Admin procesador.

### Autenticación y permisos

Las contraseñas se guardan hasheadas con bcrypt. El login entrega un JWT firmado con expiración configurable; el middleware obtiene la cuenta vigente y `authorize` controla el acceso por rol. Las entradas se validan con Zod y la API aplica Helmet, CORS y límites de solicitudes.

| Método y ruta | Acceso | Uso |
| --- | --- | --- |
| `POST /api/auth/register` | Público | Registra un Cliente con membresía `pending`. |
| `POST /api/auth/login` | Público | Inicia sesión y devuelve JWT y perfil. |
| `POST /api/auth/bootstrap-admin` | Temporal, clave de bootstrap | Crea el primer Admin si el bootstrap está habilitado y aún no existe uno. |
| `POST /api/auth/users` | Admin | Crea un Coach o Cliente; puede vincular el cliente a un Coach. |
| `GET /api/auth/users?role=Cliente` | Admin o Coach | Lista clientes; Coach solo ve clientes asignados. |
| `GET /api/auth/users/:id` | Admin o Coach autorizado | Consulta perfil deportivo, membresía y Coach. |
| `PATCH /api/auth/users/:id/membership` | Admin | Actualiza estado e intervalo de vigencia de la membresía de un Cliente. |
| `GET /api/auth/me` | JWT | Devuelve el perfil de la sesión actual. |
| `GET /api/routines` | JWT | Devuelve rutinas visibles para el rol: propias del Cliente, de clientes asignados para Coach o todas para Admin. |
| `POST /api/routines` | Admin o Coach | Crea y asigna rutina; Coach solo puede asignarla a sus propios clientes. |
| `GET /api/routines/:id` | JWT con autorización | Consulta una rutina propia, de un cliente asignado o Admin. |
| `PATCH /api/routines/:id` | Admin o Coach autorizado | Modifica una rutina. |
| `DELETE /api/routines/:id` | Admin o Coach autorizado | Elimina una rutina. |
| `GET /api/inventory` | JWT | Lista equipos y disponibilidad. |
| `POST`, `PATCH /api/inventory` | Admin | Crea equipos y actualiza su estado. |
| `GET /api/billing/me` | Cliente | Consulta membresía e historial propio. |
| `POST /api/billing/payments` | Cliente | Genera referencia para pagar en recepción. |
| `GET /api/billing/payments` | Admin | Revisa solicitudes e historial. |
| `PATCH /api/billing/payments/:id/status` | Admin | Confirma/cancela y activa/renueva la membresía al confirmar. |
| `POST /api/access/qr` | Cliente con membresía activa | Emite un QR firmado de corta duración. |
| `POST /api/iot/access` | Dispositivo autenticado | Valida el QR y registra entrada o salida. |

### Acceso IoT mediante QR

1. El Cliente autenticado solicita `POST /api/access/qr`.
2. La API solo emite el token si la cuenta y la membresía están activas. El QR tiene un identificador único (`jti`), audiencia IoT y expiración configurada con `QR_TOKEN_TTL_SECONDS` (60 segundos por defecto).
3. El lector envía por HTTPS `{"qrToken":"...","deviceId":"lector-entrada"}` a `POST /api/iot/access`, incluyendo el header `x-device-key`.
4. La API verifica firma, expiración, audiencia, membresía y estado de cuenta; rechaza códigos reutilizados y alterna check-in/check-out.
5. El cambio de estado y el registro de asistencia se guardan en una transacción MongoDB. Atlas debe soportar transacciones (clúster replica set).

### Configuración sensible y Render

Las variables se describen en `api/.env.example`. En Render deben definirse, como mínimo, `MONGO_URI`, `JWT_SECRET`, `QR_TOKEN_SECRET`, `IOT_DEVICE_API_KEY`, `ADMIN_BOOTSTRAP_KEY` y `NODE_ENV=production`; los secretos JWT y QR deben ser distintos y fuertes. En producción también es obligatorio `CORS_ORIGINS`: la lista, separada por comas, de los orígenes web permitidos (por ejemplo, la URL del dashboard de Admin). Sin esa variable, la API no arranca. La app móvil no envía `Origin`, así que no le afecta.

Para crear el primer Admin, configura `ENABLE_ADMIN_BOOTSTRAP=true` de forma temporal. Envía a `/api/auth/bootstrap-admin` un JSON con `name`, `email`, `password` (mínimo 10 caracteres) y `bootstrapKey` igual a `ADMIN_BOOTSTRAP_KEY`. Después de crearlo, cambia `ENABLE_ADMIN_BOOTSTRAP=false` y elimina o rota la clave de bootstrap. Si ya existe un Admin, inicia sesión con esa cuenta; el endpoint inicial responde conflicto y no crea otro.

No se deben copiar `MONGO_URI`, secretos, claves IoT ni tokens a la app móvil. El `.env` real no se versiona; solo se publica `.env.example` con placeholders.

### Organizaciones y sucursales (etapas 1 y 2)

Los datos pertenecen a una organización (el dueño o la cadena) y, cuando son físicos, a una sucursal:

| Nivel | Modelos |
|---|---|
| Global | Usuarios (una cuenta de GymGo para todos los gimnasios), diccionario de ejercicios y grupos musculares |
| Organización | Planes, productos, promociones, ejercicios propios, plantillas y rutinas |
| Sucursal | Equipos, stock de productos (`ProductStock`), accesos, reportes de mantenimiento, pedidos de la tienda y pagos |
| Personal | Historial de entrenamientos |

- `OrganizationMember` guarda los roles de cada persona: `Propietario` y `Cliente` valen en toda la organización; `Gerente`, `Coach` y `Recepcion` se asignan por sucursal y se pueden combinar.
- `Membership` guarda la membresía de un cliente con cada organización. `gymAccess` define dónde es válida: `all` (todas las sucursales), `home` (la sucursal elegida al venderla, como el Plan Básico) o `list` (sucursales concretas). Se copia del plan al vender para que editar el plan no cambie las membresías ya vendidas.
- `User.isPlatformAdmin` marca al personal de SIRID; se otorga con `npm run platform:admin correo@ejemplo.com`.

**Aislamiento (etapa 2).** Cada petición trabaja dentro de una organización y de sus sucursales:

- `authenticate` carga los roles de `OrganizationMember` y `authorize` decide con ellos: `Admin` equivale a Propietario (todas las sucursales) o Gerente (sus sucursales); `Coach` y `Recepcion` valen en las sucursales donde se asignaron; `Cliente`, en toda la organización.
- El header opcional `X-Gym-Id` elige la sucursal (y con ella la organización). Si la persona no tiene acceso, responde 403. Sin header, el personal consulta todas sus sucursales con el rol que usa la ruta, y las escrituras van a la sucursal principal. Un cliente trabaja siempre con una sola sucursal, su sucursal base.
- Las altas de personal, productos, equipos, pagos y ventas aceptan `gymId` en el cuerpo para elegir la sucursal, siempre que sea una de las del usuario.
- `Membership` es la fuente de verdad de la membresía; `User.membership` guarda una copia para la app y el dashboard. El QR y el pago en recepción usan la membresía de la organización.
- `GET /products` mantiene `stock` (el de la sucursal elegida o la principal) y agrega `stockByGym`. Al cobrar, el stock se descuenta en la sucursal de la venta.
- Recepción puede cobrar pagos y ventas, canjear PIN, consultar planes, promociones y clientes, y validar accesos de su sucursal. Editar o eliminar pagos queda para Admin.
- El login y `GET /auth/me` agregan `organization`, `gyms` y `defaultGymId`. `GET /auth/me/gyms` lista las sucursales de la persona con sus roles. `role` conserva el valor anterior (Propietario o Gerente → `Admin`).
- Socket.IO une cada conexión a salas por organización y por sucursal (`org:<id>:owners|admins|staff`, `gym:<id>:managers|reception`, `user:<id>`). Los nombres de los eventos no cambian.
- Los documentos ya no toman la organización predeterminada: sin organización o sucursal, no se guardan. Solo el registro público de clientes usa la organización predeterminada, hasta que en la etapa 3 los clientes se unan con código.

La API no arranca si la migración no se ha ejecutado.

**Migración** (desde `api/`, con `MONGO_URI` en `api/.env`):

1. Respaldo con [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools):
   ```
   mongodump --uri="<MONGO_URI>" --out="backups/antes-etapa-1"
   ```
   Para restaurarlo: `mongorestore --uri="<MONGO_URI>" --drop "backups/antes-etapa-1"`. La carpeta `backups/` no se sube al repositorio.
2. Modo prueba, que solo cuenta lo que cambiaría: `npm run migrate:tenancy --dry-run`
3. Aplicar: `npm run migrate:tenancy`
4. Desplegar la API.

El script se puede ejecutar varias veces: solo completa lo que falta. En la etapa 2 además pasa el stock de cada producto a su sucursal, quita los campos de sucursal antiguos de productos, promociones y ejercicios, y reemplaza índices obsoletos. Solo agrega a la organización predeterminada a usuarios que no pertenecen a ninguna. Después de `npm run seed`, ejecútalo otra vez para registrar a los usuarios nuevos en la organización.

## Parte 2: Aplicación móvil

### Estructura y estado de sesión

La app mantiene Expo Router (SDK 57) como sistema de navegación, en vez de añadir un segundo navigator React Navigation. El grupo `(auth)` contiene el acceso; `(main)` queda protegido por sesión y usa pestañas según el rol. El estado global se maneja con React Context y Hooks.

Axios usa como base `https://sirid-systemsappmovil.onrender.com/api`; se puede sobrescribir con `EXPO_PUBLIC_API_URL`. Un interceptor adjunta `Authorization: Bearer <JWT>` a cada llamada autenticada. En iOS y Android el JWT se guarda en `expo-secure-store`; en web se usa `sessionStorage`. Al arrancar, la app valida la sesión con `/api/auth/me` y descarta tokens inválidos. El login y el registro de Cliente están en `src/features/gymgo/auth-screen.tsx`.

Dependencias móviles añadidas para esta integración: `axios`, `react-native-qrcode-svg` y `react-native-svg` (instalado en la versión compatible con Expo SDK 57). Se reutiliza `expo-secure-store`, ya presente en el proyecto.

### Vistas por rol

- **Cliente:** dashboard con estado de membresía, registro de objetivo/nivel/días/preferencias, QR renovable, consulta de rutinas e historial/pago en recepción.
- **Admin:** dashboard, alta de Coach/Cliente, configuración inicial de perfil y plan/precio, directorio, inventario y revisión de solicitudes de pago.
- **Coach:** dashboard, directorio limitado a clientes asignados, rutinas y catálogo de equipos.
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

El módulo de pago actualmente genera una referencia para recepción; el personal Admin confirma o cancela y el servidor actualiza la vigencia de la membresía. No se procesa tarjeta ni existe proveedor online configurado. Aún no están desarrollados: login por OTP/correo, invitación de Coach por email, configuración completa del gimnasio/sucursales, pasarela/renovación automática, creación/edición de rutinas en la app, métricas reales de demanda/ocupación, registro e historial de entrenamientos, rachas, mantenimiento, notificaciones push, ventas ni PIN/NFC.

El dashboard indica que las métricas de demanda no están disponibles; no muestra datos ficticios. Antes de producción comercial conviene añadir pruebas de integración de inventario, pagos, membresías y QR, e integrar un proveedor de pago antes de habilitar cobros online.
