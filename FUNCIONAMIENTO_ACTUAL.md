# GymGo: funcionamiento actual

## 1. Descripción general

GymGo es una aplicación móvil para la operación de un gimnasio. La solución está
compuesta por:

- **Aplicación móvil:** Expo SDK 57, React Native, TypeScript y Expo Router.
- **API REST:** Node.js, Express 5 y MongoDB mediante Mongoose.
- **Autenticación:** JWT, contraseñas cifradas con bcrypt y autorización por rol.
- **Actualizaciones en tiempo real:** Socket.IO para actualizar algunos datos de
  tienda y disponibilidad de equipos.

La aplicación reconoce tres perfiles:

| Perfil | Propósito |
| --- | --- |
| **Admin** | Administra la operación, usuarios, membresías, pagos, inventario, mantenimiento y comercio. |
| **Coach** | Diseña rutinas y da seguimiento a los clientes que tiene asignados. |
| **Cliente** | Consulta y ejecuta sus rutinas, registra entrenamientos, usa su acceso QR y gestiona su membresía. |

La aplicación inicia en el flujo de autenticación. Una sesión válida abre las
pestañas correspondientes al rol del usuario; las pantallas que no pertenecen al
rol permanecen ocultas.

## 2. Acceso y cuentas

### Inicio de sesión

El usuario inicia sesión con correo y contraseña. La API devuelve un token JWT y
el perfil del usuario. La aplicación guarda el token de forma segura y lo
adjunta a las solicitudes posteriores.

Al abrir la app, se intenta restaurar la sesión con `GET /api/auth/me`. Si el
token ya no es válido, se elimina y el usuario vuelve al inicio de sesión.

### Registro

El registro público crea únicamente cuentas de **Cliente**. Durante el registro
el cliente puede indicar:

- Nombre y correo.
- Objetivo.
- Nivel de experiencia.
- Días disponibles para entrenar.
- Horario preferido.
- Restricciones.
- Zonas o grupos musculares de preferencia.

El primer **Admin** se crea mediante el proceso temporal de bootstrap del
backend. Después, un Admin puede crear cuentas de **Coach** y **Cliente** desde
la administración.

### Roles

Los roles implementados son `Admin`, `Coach` y `Cliente`. La API valida el rol
en cada módulo y también aplica reglas de propiedad:

- Un Cliente solo consulta y modifica su propia información.
- Un Coach trabaja con los clientes que tiene asignados.
- Un Admin tiene acceso global a la operación.

## 3. Funcionamiento del Administrador

El Admin tiene la vista más amplia de GymGo. En la navegación principal dispone
de **Inicio**, **Inventario** y **Usuarios**; desde las pantallas administrativas
también puede acceder a módulos de pagos, mantenimiento, escáner y comercio.

### 3.1 Dashboard operativo

La pantalla de inicio del Admin muestra información de la operación del
gimnasio, obtenida de los accesos registrados:

- Entradas y salidas del día.
- Personas dentro del gimnasio.
- Asistencia por día.
- Entradas agrupadas por hora.
- Hora de mayor demanda.
- Equipos disponibles, ocupados o fuera de servicio por zona.

También ofrece un acceso directo al **escáner de recepción**, utilizado para
validar operaciones presenciales.

### 3.2 Usuarios, clientes y coaches

El Admin puede:

- Crear cuentas de Coach.
- Crear cuentas de Cliente desde la administración.
- Asignar un cliente a un Coach.
- Consultar el directorio de usuarios.
- Consultar el detalle de un cliente.
- Editar información del perfil.
- Consultar y actualizar observaciones del cliente.
- Adjuntar documentos PDF cuando el formulario administrativo lo permite.

Cuando se crea un cliente desde Admin, su membresía queda inicialmente en
estado `pending`. El Admin debe activarla antes de que el cliente pueda utilizar
el acceso QR.

### 3.3 Membresías, planes y pagos

El Admin administra los planes y atiende los pagos realizados en recepción:

- Crear, editar y eliminar planes.
- Consultar solicitudes de pago pendientes e históricas.
- Buscar una solicitud mediante su PIN de validación.
- Marcar una solicitud como pagada.
- Cancelar una solicitud.
- Activar, renovar o actualizar la membresía al confirmar el pago.
- Consultar el estado, precio, duración y vigencia de cada membresía.

El flujo de pago actual no procesa tarjetas dentro de la app. El Cliente genera
una solicitud y realiza el pago físicamente en recepción; el Admin valida el
PIN para completar la operación.

### 3.4 Inventario y equipos

El Admin puede administrar el catálogo de equipos del gimnasio:

- Registrar equipos.
- Editar equipos.
- Consultar zona, marca y estado.
- Marcar un equipo como disponible, ocupado o fuera de servicio.
- Consultar el nivel de demanda o tráfico del equipo.

El inventario es utilizado por las rutinas y por el cálculo de disponibilidad
que se muestra a Clientes y Coaches.

### 3.5 Mantenimiento

El Admin consulta los reportes enviados por los Clientes y actualiza su estado.
Un reporte incluye el equipo afectado, la descripción, la zona, el usuario que
lo reportó y el estado de atención.

El Admin puede marcar un equipo como fuera de servicio mientras se revisa y
volver a habilitarlo cuando se repara.

### 3.6 Comercio, productos y promociones

El módulo de **Tienda y promociones** permite al Admin:

- Crear, editar y eliminar productos.
- Configurar precio, categoría, imagen y existencia.
- Crear banners promocionales.
- Activar o desactivar promociones.
- Editar o eliminar promociones.
- Ver los productos y promociones publicados en la app del Cliente.

También puede administrar los pedidos de tienda:

- Consultar pedidos.
- Actualizar su estado.
- Validar pedidos mediante PIN.
- Marcar la entrega o redención en recepción.

## 4. Funcionamiento del Coach

El Coach dispone de las pestañas **Inicio**, **Rutinas** y **Clientes**. Sus
consultas están limitadas a los clientes que le fueron asignados.

### 4.1 Dashboard del Coach

El inicio muestra una vista operativa orientada al entrenamiento:

- Resumen de entradas, salidas y ocupación.
- Demanda horaria y hora de mayor actividad.
- Disponibilidad de equipos por zona.
- Rutinas activas y rutinas de los clientes asignados.

Esta información ayuda a planear sesiones considerando la ocupación real del
gimnasio.

### 4.2 Clientes asignados

El Coach puede consultar su cartera de clientes a partir de las rutinas
asignadas. Puede ver:

- Cliente relacionado con una rutina.
- Cantidad de rutinas.
- Objetivo registrado.
- Información de perfil autorizada por la API.
- Progreso e historial de entrenamientos cuando se consulta el detalle.

El listado actual se construye principalmente a partir de las rutinas
publicadas. Si un cliente todavía no tiene una rutina publicada, puede no
aparecer en esa vista.

### 4.3 Creación y edición de rutinas

El Coach puede crear y editar rutinas personalizadas. Una rutina puede incluir:

- Título y objetivo.
- Nivel.
- Días de entrenamiento.
- Bloques de ejercicios.
- Ejercicios, orden, series, repeticiones y descanso.
- Peso sugerido y tipo de métrica.
- Cliente asignado.

Los ejercicios se relacionan con el catálogo disponible del gimnasio y pueden
ser de fuerza o cardio. Para cardio se contemplan métricas como duración,
distancia y nivel.

### 4.4 Plantillas

El Coach puede crear plantillas reutilizables para no comenzar cada rutina
desde cero. En sus plantillas puede:

- Buscar por nombre.
- Editar una plantilla.
- Eliminar una plantilla.
- Elegir un cliente asignado.
- Crear una copia de la plantilla para ese cliente.

La plantilla se copia al cliente al asignarla; esto permite conservar una base
reutilizable sin modificar directamente la rutina de otros clientes.

### 4.5 Seguimiento del cliente

El Coach puede consultar el historial de sesiones de un cliente y sus métricas
de progreso, incluyendo los ejercicios realizados y los valores registrados en
cada sesión. Con esta información puede ajustar la rutina o publicar una nueva
versión.

El Coach no administra membresías, pagos ni usuarios globales, y no puede
modificar clientes que no estén dentro de su cartera autorizada.

## 5. Funcionamiento del Cliente

El Cliente dispone de las pestañas **Inicio**, **Rutinas** y **Perfil**. La
pestaña de Perfil contiene el acceso a la información de membresía y pagos.

### 5.1 Inicio

La pantalla de inicio del Cliente muestra:

- Saludo y objetivo personal.
- Estado de la membresía.
- Cantidad de rutinas activas.
- Racha actual de entrenamiento.
- Acceso rápido al QR.
- Resumen de progreso y actividad reciente.

El Cliente también puede consultar sus estadísticas personales, como sesiones
totales, sesiones completadas en la semana, volumen acumulado y última sesión.

### 5.2 Acceso QR

El Cliente solicita un QR dinámico desde la aplicación. El código:

1. Se genera únicamente para una cuenta con membresía activa.
2. Tiene una vigencia corta.
3. Se renueva antes de expirar.
4. Se presenta en el lector de acceso del gimnasio.

El dispositivo IoT envía el QR a la API. La API valida la firma, vigencia,
audiencia, membresía y uso único del código. Si todo es válido, registra
alternadamente la entrada o salida del Cliente y actualiza los datos de
ocupación.

Una membresía pendiente, suspendida o vencida impide generar un QR válido.

### 5.3 Rutinas y entrenamiento

El Cliente consulta sus rutinas organizadas por día de la semana. En una sesión
puede:

- Ver ejercicios y bloques.
- Consultar series, descanso y valores sugeridos.
- Registrar repeticiones y peso en ejercicios de fuerza.
- Registrar duración, distancia o nivel en ejercicios de cardio.
- Marcar un ejercicio como omitido.
- Consultar el último rendimiento conocido para usarlo como referencia.
- Ver la disponibilidad y demanda estimada del equipo.
- Finalizar la sesión y guardar el entrenamiento.

Al guardar una sesión se conservan los bloques, series, ejercicios realizados,
métricas, duración y volumen. Estos datos alimentan la racha y el progreso del
Cliente, y quedan disponibles para el Coach autorizado.

Cuando un equipo no está disponible, la interfaz contempla la sustitución por
otro ejercicio compatible con el grupo muscular y la disponibilidad del
gimnasio.

### 5.4 Membresía y pagos

Desde Perfil, el Cliente puede consultar:

- Plan actual.
- Estado de la membresía.
- Precio y moneda.
- Fecha de inicio.
- Fecha de vencimiento.
- Historial de pagos.

También puede generar una solicitud de pago en recepción. La aplicación
muestra una referencia y un PIN que el Cliente presenta al personal del
gimnasio. Si ya existe una membresía activa, la app solicita confirmación antes
de permitir adelantar el siguiente pago.

### 5.5 Perfil físico y preferencias

El Cliente puede completar o actualizar información relacionada con su
entrenamiento:

- Objetivo.
- Nivel de experiencia.
- Días disponibles.
- Horario preferido.
- Restricciones.
- Zonas preferidas.
- Peso y estatura.

Estos datos sirven como contexto para la planificación del Coach y para las
estadísticas personales.

### 5.6 Reportes de mantenimiento

El Cliente puede reportar una falla desde el contexto del equipo. El reporte
incluye una descripción y queda disponible para el Admin. Mientras el equipo
está marcado fuera de servicio, su disponibilidad se refleja en el inventario y
en las rutinas que lo utilizan.

### 5.7 Tienda y pedidos

El Cliente puede consultar la tienda y:

- Filtrar productos por categoría.
- Ver imágenes, precio y existencia.
- Consultar promociones.
- Agregar productos a una lista o carrito.
- Consultar sus pedidos.
- Solicitar la compra para recogerla o completarla en recepción.

Las promociones pueden llevar directamente a productos aplicables o a la
sección de membresías. Los cambios de ventas pueden actualizarse en tiempo real
en la aplicación.

## 6. Módulos y permisos de la API

La API está montada bajo `/api` y expone los siguientes grupos:

| Módulo | Admin | Coach | Cliente |
| --- | :---: | :---: | :---: |
| Autenticación y perfil propio | Sí | Sí | Sí |
| Directorio de usuarios | Global | Clientes asignados | Solo propio |
| Rutinas | Todas | Asignadas/autorizadas | Solo propias |
| Plantillas | Sí | Sí | No |
| Entrenamientos | Historial autorizado | Historial de clientes asignados | Solo propios |
| Dashboard operativo | Sí | Sí | No |
| QR y acceso | Recepción/IoT | No | Genera su QR |
| Inventario | Administra | Consulta y puede actualizar según autorización | Consulta tráfico |
| Mantenimiento | Gestiona reportes | No | Crea reportes |
| Membresías y planes | Gestiona | No | Consulta y solicita pago |
| Productos y promociones | Gestiona | No | Consulta |
| Pedidos de tienda | Gestiona y redime | No | Crea y consulta propios |

Todos los módulos protegidos requieren autenticación. Las operaciones
administrativas se validan en el backend, no solo mediante el ocultamiento de
pestañas en la app.

## 7. Flujo de datos principal

1. El usuario inicia sesión o se registra.
2. La app conserva el JWT y lo usa para llamar a la API.
3. La API identifica al usuario y aplica permisos por rol.
4. Los cambios se guardan en MongoDB.
5. La app actualiza sus pantallas con las respuestas de la API.
6. Los eventos de acceso y algunos cambios de tienda/equipos pueden reflejarse
   mediante Socket.IO.

La URL de la API puede configurarse mediante `EXPO_PUBLIC_API_URL`. Si no se
define, la app utiliza la API desplegada de GymGo.

## 8. Estados relevantes

### Membresía

- `pending`: creada, pero todavía no activada.
- `active`: permite utilizar el acceso QR.
- `suspended`: bloqueada temporalmente.
- `expired`: vencida.

### Equipo

- `available`: disponible.
- `busy`: ocupado o con demanda.
- `out_of_service`: fuera de servicio.

### Pago

- `pending`: solicitud creada y pendiente de recepción.
- `paid`: confirmado por el Admin.
- `cancelled`: cancelado.

## 9. Limitaciones y notas del estado actual

- El pago se confirma en recepción; no hay cobro con tarjeta integrado en la
  aplicación.
- La asignación de clientes se valida en la API y depende de que el Coach esté
  correctamente vinculado al usuario.
- La vista de clientes del Coach se alimenta de rutinas publicadas; un cliente
  sin rutina puede no aparecer en el listado resumido.
- El acceso QR requiere membresía activa y un lector/dispositivo IoT configurado
  con sus credenciales.
- La disponibilidad de equipos depende de que el inventario y sus estados estén
  actualizados.
- La sustitución de ejercicios depende de que existan alternativas compatibles
  en el catálogo del gimnasio.
- El contenido mostrado puede cambiar según el rol, los permisos del usuario y
  la información registrada en la base de datos.

## 10. Tecnologías principales

- Expo SDK 57 y Expo Router.
- React Native 0.86 y TypeScript.
- Axios para comunicación HTTP.
- Zustand para el carrito.
- Reanimated y componentes nativos de Expo para interacción y animación.
- Node.js 20+, Express 5 y Mongoose.
- MongoDB.
- JWT y bcrypt.
- Socket.IO.
- Zod, Helmet, CORS y rate limiting para protección de la API.
