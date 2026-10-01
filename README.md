<div align="center">

# Project-GymGo

### El gimnasio conectado, inteligente y centrado en las personas

Project-GymGo transforma la operación diaria de un gimnasio en una experiencia digital integrada: acceso inteligente, entrenamientos personalizados, equipos conectados, seguimiento del progreso y decisiones basadas en datos.

</div>

## Descripción General

Project-GymGo es una plataforma para modernizar la gestión y la experiencia de un gimnasio. Conecta el hardware del establecimiento, como lectores de acceso y sistemas IoT, con una aplicación móvil donde cada usuario puede consultar, registrar y gestionar su actividad.

La plataforma centraliza la información de clientes, coaches, membresías, rutinas, máquinas, asistencia y mantenimiento. Esto permite que el gimnasio opere con mayor control, que los coaches personalicen mejor sus entrenamientos y que los clientes aprovechen cada sesión de forma más organizada.

El valor de Project-GymGo está en unir la operación física con la experiencia digital:

- El acceso se valida mediante un código QR dinámico.
- Las entradas y salidas alimentan las estadísticas de asistencia.
- El inventario de máquinas influye en la creación de rutinas.
- Los reportes de fallas ayudan a mantener el equipo disponible y seguro.
- El progreso del cliente se registra para convertir cada entrenamiento en información útil.

## Perfiles de Usuario

### Administrador

El Administrador es el dueño o responsable del gimnasio. Cuenta con una visión integral de la operación y puede:

- Gestionar clientes, coaches y membresías.
- Configurar y supervisar el inventario de equipos.
- Revisar pagos y solicitudes de membresía.
- Atender reportes de mantenimiento.
- Consultar asistencia, ocupación y horarios de mayor demanda.
- Tomar decisiones sobre personal, equipo, horarios y operación basándose en datos reales.

Project-GymGo le permite pasar de una administración reactiva a una gestión organizada y medible.

### Coach

El Coach utiliza la plataforma para diseñar entrenamientos personalizados y acompañar el progreso de sus clientes. Puede:

- Consultar sus clientes asignados.
- Crear rutinas mediante Coach Creator.
- Elegir ejercicios considerando el equipo disponible en el gimnasio.
- Organizar entrenamientos por días, objetivos y nivel.
- Asignar rutinas y ajustar planes cuando cambian las necesidades del cliente.
- Consultar información de asistencia y demanda para planificar mejor sus sesiones.

El Coach deja de depender de hojas de papel o mensajes dispersos y trabaja con una vista centralizada de sus clientes y entrenamientos.

### Cliente

El Cliente utiliza Project-GymGo como su aplicación diaria para entrenar y relacionarse con el gimnasio. Puede:

- Acceder mediante su código QR dinámico.
- Consultar su rutina asignada por día.
- Registrar series, repeticiones, peso y descanso.
- Consultar su progreso y racha de entrenamiento.
- Revisar su membresía y solicitar pagos en recepción.
- Consultar el estado de las máquinas.
- Reportar equipos descompuestos.
- Solicitar la sustitución de un ejercicio cuando un equipo no está disponible.

## Módulos y Funcionalidades Principales

### Control de Accesos IoT Virtual

Project-GymGo utiliza un código QR dinámico como pase digital personal del Cliente. El código se renueva periódicamente y está diseñado para ser utilizado por el lector de acceso del gimnasio.

El flujo de acceso funciona así:

1. El Cliente abre su pase digital.
2. Presenta el QR frente al lector del gimnasio.
3. El sistema valida que el código sea vigente y que la membresía permita el acceso.
4. Se registra la entrada o salida del Cliente.
5. La asistencia se incorpora a los datos operativos del gimnasio.

El mismo mecanismo permite registrar check-in y check-out. La aplicación utiliza estos eventos para conocer la asistencia y construir indicadores de ocupación.

#### Rachas de asistencia

La plataforma calcula la constancia del Cliente mediante una racha de entrenamiento. Los días de descanso programados no rompen la racha, por lo que el indicador respeta el plan personal de cada usuario en lugar de exigir entrenamiento diario.

### Inventario y Mantenimiento

El inventario ofrece un catálogo actualizado de las máquinas y equipos del gimnasio. Cada equipo puede incluir:

- Nombre.
- Zona o área del gimnasio.
- Marca.
- Estado de disponibilidad.
- Frecuencia de uso.

Los estados principales son:

- Disponible.
- Ocupado.
- Fuera de servicio.

El Administrador puede registrar equipos y actualizar su estado. Coaches y Clientes pueden consultar el catálogo para conocer qué recursos existen y cuáles están disponibles.

#### Reporte de fallas

Cuando un Cliente detecta un problema, puede seleccionar el equipo desde el inventario y enviar una descripción de la falla. El reporte llega al panel de mantenimiento del Administrador con:

- Equipo afectado.
- Zona.
- Descripción del problema.
- Usuario que lo reportó.
- Estado de atención.

El Administrador puede marcar el equipo como fuera de servicio mientras se revisa y marcarlo como reparado cuando vuelve a estar disponible. De esta manera, un equipo reportado deja de considerarse una opción confiable para la operación y los entrenamientos.

### Coach Creator y Rutinas Inteligentes

Coach Creator es el espacio de trabajo del Coach para diseñar y asignar entrenamientos personalizados.

El Coach define:

- Nombre y objetivo de la rutina.
- Duración del plan.
- Nivel del cliente.
- Días programados de entrenamiento.
- Cliente que recibirá la rutina.
- Ejercicios, series, repeticiones, peso sugerido y descanso.

#### Rutinas basadas en el equipo real

Al agregar un ejercicio, el Coach selecciona el equipo desde el catálogo real del gimnasio. No se permite escribir una máquina que no exista en el inventario.

Esto garantiza que una rutina sea coherente con los recursos disponibles y evita asignar ejercicios basados en máquinas inexistentes o fuera de servicio.

Cada ejercicio queda relacionado con:

- El grupo muscular.
- La máquina o equipo utilizado.
- El día del plan.
- Las series y repeticiones.
- El peso recomendado.
- El tiempo de descanso.

Una vez guardada, la rutina queda asignada al Cliente, quien puede consultarla organizada por día desde su aplicación.

#### Sustitución de ejercicios

Cuando un Cliente encuentra un equipo ocupado o no disponible, puede pulsar **Sustituir ejercicio**. La interfaz queda preparada para mostrar alternativas del mismo grupo muscular y priorizar equipos disponibles y menos saturados.

Esta función permite que el entrenamiento continúe sin perder el objetivo de la sesión.

### Registro de Entrenamiento

El Cliente puede registrar lo que realmente ocurrió durante su sesión, sin limitarse a consultar el peso recomendado.

Por cada ejercicio y serie puede registrar:

- Repeticiones logradas.
- Peso utilizado.
- Tiempo de descanso.
- Observaciones del ejercicio.

Al completar una sesión, la plataforma guarda también:

- Rutina utilizada.
- Día de entrenamiento.
- Duración total.
- Volumen acumulado de trabajo.
- Ejercicios realizados.

Esta información permite comparar sesiones, visualizar evolución y entregar al Coach una referencia objetiva para ajustar el plan.

### Dashboard Operativo y Demanda

El Administrador y el Coach disponen de información operativa basada en eventos reales de acceso IoT.

El dashboard puede mostrar:

- Entradas del día.
- Salidas del día.
- Personas actualmente dentro del gimnasio.
- Asistencia diaria o semanal.
- Entradas agrupadas por hora.
- Hora de mayor demanda.
- Disponibilidad de equipos por zona.
- Equipos ocupados o fuera de servicio.

#### Demanda horaria

Los check-ins y check-outs permiten identificar los momentos de mayor actividad. El gimnasio puede usar esta información para:

- Ajustar horarios del personal.
- Organizar mejor las sesiones.
- Distribuir clientes y coaches.
- Planificar promociones en horarios de baja demanda.
- Identificar zonas que necesitan más equipamiento.

La ocupación actual se calcula a partir de los Clientes con entrada registrada y sin salida posterior. Las zonas del inventario muestran cuántos equipos están disponibles, ocupados o fuera de servicio.

### Gestión de Membresías y Pagos

Project-GymGo centraliza el estado de la membresía del Cliente y permite consultar su vigencia, plan, precio e historial de pagos.

El Administrador puede:

- Configurar el plan de un Cliente.
- Definir precio y duración.
- Revisar solicitudes de pago.
- Confirmar un pago recibido en recepción.
- Cancelar una solicitud.
- Activar o renovar la membresía al confirmar el pago.

El Cliente puede:

- Consultar su plan actual.
- Ver el estado de su membresía.
- Revisar fechas de inicio y vencimiento.
- Consultar su historial de pagos.
- Solicitar una referencia para pagar en recepción.

El flujo de pago en recepción funciona así:

1. El Cliente solicita el pago desde la sección **Pago y membresía**.
2. La aplicación genera una referencia de pago.
3. El Cliente presenta la referencia en recepción.
4. El Administrador confirma o cancela la solicitud.
5. Al confirmar, la membresía se activa o se extiende por el periodo correspondiente.

La plataforma está preparada para evolucionar hacia pagos digitales y renovación automática cuando el gimnasio conecte un proveedor de pagos.

## Valor para el Gimnasio

Project-GymGo convierte información dispersa en una operación conectada:

- El acceso genera datos de asistencia.
- La asistencia ayuda a entender la demanda.
- La demanda orienta la planificación de rutinas y recursos.
- El inventario mantiene los entrenamientos alineados con la realidad del gimnasio.
- Los reportes de fallas protegen la experiencia del Cliente.
- El registro de entrenamiento permite medir progreso.
- Las membresías y pagos reducen el trabajo administrativo.

El resultado es una experiencia más clara para el Cliente, una herramienta de trabajo más potente para el Coach y una visión de negocio más útil para el Administrador.
