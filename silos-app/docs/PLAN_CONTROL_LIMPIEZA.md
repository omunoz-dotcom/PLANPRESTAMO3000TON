# Plan de Control de Orden, Limpieza, Daños y Alertas — Área de Silos

**Responsable:** Jefe de Área de Silos (Almacenera de granos)
**Versión:** 1.0 — borrador para revisión conjunta

---

## 1. Objetivo

Mantener el área de silos limpia, ordenada y segura, y asegurar que **todo daño de equipo y todo evento anormal se reporte en el momento, llegue a quien debe actuar y quede registrado hasta su cierre**.

Riesgos que el plan busca controlar:

- **Explosión por polvo de grano**: el polvo acumulado en estructuras, galerías y pies de elevador es combustible.
- **Plagas** atraídas por grano derramado (pérdida de calidad, contaminación).
- **Daños que se agravan** porque nadie los reportó a tiempo (rodamientos, cangilones, bandas).
- **Puntos calientes / fermentación** en silos sin seguimiento de termometría.
- **Accidentes** por pisos con grano, rutas obstruidas o falta de EPP.

## 2. Alcance

Todas las zonas del área: fosa de recepción, elevadores, prelimpieza, secadora, silos 1–4, galería de transportadores, despacho y cuarto eléctrico. Las zonas y sus equipos se configuran en la plataforma (**Programa → Editar zona**).

## 3. Roles y responsabilidades

| Rol | Responsabilidades | En la plataforma |
|---|---|---|
| **Jefe de Área (Admin)** | Aprueba el programa, revisa indicadores semanales, gestiona usuarios | Todo + usuarios |
| **Supervisor de Turno** | Asigna y verifica tareas, inspección 5S diaria, cierra alertas y daños | Crear/verificar tareas, 5S, programa, reportes |
| **Mantenimiento** | Atiende daños, registra reparación, limpieza técnica (filtros, MCC) | Gestiona el ciclo de los daños |
| **Operador** | Opera equipos, lectura de termometría, reporta eventos y daños | Ejecuta sus tareas, reporta |
| **Limpieza** | Ejecuta el programa de limpieza y las correcciones 5S | Ejecuta sus tareas, reporta |

**Regla de oro:** *cualquier colaborador que vea un evento anormal lo reporta con el botón ALERTA en el momento*, haya o no señal (se envía solo al recuperar conexión).

## 4. Programa de limpieza (frecuencias base)

| Zona | Actividad | Frecuencia | Responsable |
|---|---|---|---|
| Fosa de recepción | Retirar derrames, barrer/aspirar rejillas, revisar colector de polvo | Cada turno | Limpieza |
| Despacho | Recoger derrames de carga, limpiar plataforma de balanza | Cada turno | Limpieza |
| Silos 1–4 | Lectura de termometría y reporte de puntos calientes | Cada turno | Operador |
| Elevadores | Limpieza de pies de elevador, polvo en motores y guardas | Diario | Limpieza |
| Galería de transportadores | Barrido de pasillos, bandejas y motorreductores | Diario | Limpieza |
| Prelimpieza | Revisión y limpieza de filtros de mangas | Semanal | Mantenimiento |
| Toda el área | Inspección de control de plagas (cebaderos, mallas) | Semanal | Supervisor |
| Cuarto eléctrico | Soplado de tableros (desenergizado), sellos, orden | Mensual | Mantenimiento |

Las tareas se **generan solas** al inicio de cada período (turnos 06–14, 14–22 y 22–06). Se pueden ajustar en **Programa**.

**Ciclo de una tarea:** Pendiente → En proceso → Completada (con checklist, observaciones y foto de evidencia) → **Verificada** por el supervisor (o Rechazada con motivo, y vuelve al responsable).

## 5. Inspección 5S

- **Frecuencia mínima:** 1 inspección por zona crítica y por turno (fosa, elevadores, galería); 1 semanal en el resto.
- **Calificación:** Cumple = 2, Parcial = 1, No cumple = 0. El puntaje es el % sobre el máximo.
- **Semáforo:** ≥ 85 % verde · 70–84 % amarillo · < 70 % rojo.
- Cada “No cumple” genera automáticamente una **tarea correctiva** para Limpieza con plazo de 8 h.

Los 12 puntos del checklist (adaptados a almacenamiento de granos) están en `public/js/catalog.js` y se pueden ajustar.

## 6. Reporte de daños de equipos

1. **Quien detecta** reporta: zona, equipo, tipo de falla, severidad, si el equipo está **detenido**, descripción y fotos.
2. Si es crítico o el equipo está detenido → **notificación inmediata** al equipo en línea.
3. **Mantenimiento** lo toma (*En revisión*), inicia la reparación (*En reparación*) y lo marca *Resuelto* indicando trabajo realizado y repuestos.
4. **Supervisor** verifica en campo y lo **cierra**.

Indicador: **Tiempo medio de reparación (MTTR)** = promedio de horas entre reporte y resolución.

## 7. Alertas y eventos — matriz de respuesta

| Evento | Severidad por defecto | Tiempo máx. para atender |
|---|---|---|
| Temperatura alta / punto caliente en silo | Crítica | 10 min |
| Humo / incendio | Crítica | 10 min |
| Incidente / accidente de personal | Crítica | 10 min |
| Polvo excesivo (riesgo explosión) | Alta | 30 min |
| Atasco de transportador / elevador | Alta | 30 min |
| Falla eléctrica | Alta | 30 min |
| Ingreso de agua / humedad | Alta | 30 min |
| Derrame de grano | Media | 4 h |
| Plagas | Media | 4 h |

Flujo: **Abierta** → *Atender / En camino* (cualquier colaborador puede dar acuse) → **Cerrada** por el supervisor indicando acciones y causa.

- Las alertas abiertas se muestran en un **banner rojo** en todas las pantallas hasta que alguien las atiende.
- Si una alerta crítica supera su tiempo de respuesta, la app del supervisor **emite un aviso sonoro cada minuto**.
- Se registra si la alerta fue reportada sin conexión y cuánto tardó en llegar al servidor.

> La plataforma **no reemplaza** los protocolos de emergencia: ante incendio o accidente se activa primero la alarma y la brigada; luego se registra.

## 8. Indicadores (KPI)

| Indicador | Meta inicial | Fuente |
|---|---|---|
| Cumplimiento del programa de limpieza | ≥ 90 % | Tareas completadas / programadas |
| Índice 5S promedio del área | ≥ 85 % | Inspecciones |
| Alertas atendidas dentro del tiempo | ≥ 95 % | Alertas |
| Tiempo medio de reparación (MTTR) | Definir línea base el 1.er mes | Daños |
| Tareas vencidas al cierre del turno | 0 | Tareas |

Revisión: **diaria** al cambio de turno (tablero), **semanal** con el Jefe de Área (Reportes + exportación a Excel).

## 9. Implementación sugerida

| Semana | Actividad |
|---|---|
| 1 | Instalar el servidor en la red de planta; crear usuarios; ajustar zonas, equipos y programa |
| 2 | Piloto con 1 turno: capacitación de 30 min por rol; instalar la app en celulares/tablets |
| 3 | Extender a todos los turnos; primera revisión de KPIs |
| 4 | Ajustes del checklist 5S y tiempos de respuesta según experiencia; línea base de MTTR |

## 10. Pendientes para definir juntos

- Número real de silos, equipos y nombres usados en planta.
- Turnos reales y si hay personal fijo por zona.
- Quién recibe las alertas fuera de horario (¿WhatsApp / SMS / correo?).
- Si se integrará con el sistema de mantenimiento existente (SAP PM u otro).
