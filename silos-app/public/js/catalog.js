// Catálogos compartidos entre el servidor y la aplicación.
// Ajustar aquí zonas, roles, tipos de evento y tiempos de respuesta (SLA).

export const ROLES = {
  admin:         { label: 'Jefe de Área (Admin)', level: 4 },
  supervisor:    { label: 'Supervisor de Turno',  level: 3 },
  mantenimiento: { label: 'Mantenimiento',        level: 2 },
  operador:      { label: 'Operador',             level: 1 },
  limpieza:      { label: 'Limpieza',             level: 1 },
};

export const TASK_CATEGORIES = {
  limpieza:  'Limpieza',
  operativa: 'Operativa',
  gestion:   'Gestión',
};

export const TASK_STATUS = {
  pendiente:  'Pendiente',
  en_proceso: 'En proceso',
  completada: 'Completada',
  verificada: 'Verificada',
  rechazada:  'Rechazada',
};

export const PRIORITIES = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };

export const FREQUENCIES = {
  turno:   'Cada turno',
  diario:  'Diario',
  semanal: 'Semanal',
  mensual: 'Mensual',
};

// Turnos (hora local de inicio)
export const SHIFTS = [
  { id: 'T1', label: 'Turno 1 (06:00–14:00)', start: 6 },
  { id: 'T2', label: 'Turno 2 (14:00–22:00)', start: 14 },
  { id: 'T3', label: 'Turno 3 (22:00–06:00)', start: 22 },
];

export const DAMAGE_TYPES = {
  mecanico:      'Mecánico',
  electrico:     'Eléctrico',
  estructural:   'Estructural',
  aspiracion:    'Aspiración / Filtros de polvo',
  instrumentos:  'Instrumentación / Sensores',
  neumatico:     'Neumático / Hidráulico',
  otro:          'Otro',
};

export const DAMAGE_STATUS = {
  reportado:     'Reportado',
  en_revision:   'En revisión',
  en_reparacion: 'En reparación',
  resuelto:      'Resuelto',
  cerrado:       'Cerrado',
};

export const EVENT_TYPES = {
  temperatura: { label: 'Temperatura alta / punto caliente', icon: '🌡️', sev: 'critica' },
  incendio:    { label: 'Humo / Incendio',                   icon: '🔥', sev: 'critica' },
  polvo:       { label: 'Polvo excesivo (riesgo explosión)', icon: '💨', sev: 'alta' },
  accidente:   { label: 'Incidente / Accidente de personal', icon: '⛑️', sev: 'critica' },
  derrame:     { label: 'Derrame de grano',                  icon: '🌾', sev: 'media' },
  atasco:      { label: 'Atasco de transportador / elevador',icon: '⚙️', sev: 'alta' },
  electrico:   { label: 'Falla eléctrica',                   icon: '⚡', sev: 'alta' },
  agua:        { label: 'Ingreso de agua / humedad',         icon: '💧', sev: 'alta' },
  plagas:      { label: 'Plagas (roedores, aves, insectos)', icon: '🐀', sev: 'media' },
  otro:        { label: 'Otro evento',                       icon: '❗', sev: 'media' },
};

export const EVENT_STATUS = { abierta: 'Abierta', atendida: 'En atención', cerrada: 'Cerrada' };

// Minutos máximos para dar acuse (atender) según severidad.
export const SLA_MIN = { critica: 10, alta: 30, media: 240, baja: 1440 };

export const SEVERITY = {
  critica: { label: 'Crítica', color: 'red' },
  alta:    { label: 'Alta',    color: 'orange' },
  media:   { label: 'Media',   color: 'yellow' },
  baja:    { label: 'Baja',    color: 'blue' },
};

// Checklist de inspección 5S adaptado a almacenamiento de granos.
// Puntaje por ítem: 2 = Cumple, 1 = Parcial, 0 = No cumple.
export const CHECKLIST_5S = [
  { s: '1S Seleccionar', items: [
    'Sin materiales, sacos u objetos innecesarios en el área',
    'Sin repuestos, chatarra o herramientas abandonadas',
  ]},
  { s: '2S Ordenar', items: [
    'Herramientas y equipos de limpieza en su lugar asignado',
    'Rutas de evacuación, extintores y tableros despejados',
  ]},
  { s: '3S Limpiar', items: [
    'Pisos y pasillos libres de grano derramado',
    'Sin acumulación de polvo en estructuras, motores y bandejas',
    'Fosas, rejillas, canaletas y pies de elevador limpios',
    'Sin presencia ni rastros de plagas (roedores, aves, insectos)',
  ]},
  { s: '4S Estandarizar', items: [
    'Registros de limpieza del turno completos y firmados',
    'Equipos, zonas y señalética identificados y visibles',
  ]},
  { s: '5S Disciplina', items: [
    'Personal con EPP completo (mascarilla, casco, arnés si aplica)',
    'Programa de limpieza del turno cumplido',
  ]},
];

// Zonas iniciales del área de silos (editables desde la app).
export const SEED_ZONES = [
  { id: 'z-recepcion', name: 'Fosa de recepción / Tolva', type: 'recepcion', equipment: ['Rejilla de fosa', 'Transportador de fosa', 'Colector de polvo'] },
  { id: 'z-elevadores', name: 'Elevadores de cangilones', type: 'elevador', equipment: ['Elevador 1', 'Elevador 2', 'Pie de elevador', 'Cabeza de elevador'] },
  { id: 'z-limpieza', name: 'Prelimpieza / Zarandas', type: 'proceso', equipment: ['Zaranda', 'Ciclón', 'Filtro de mangas'] },
  { id: 'z-secadora', name: 'Secadora', type: 'proceso', equipment: ['Secadora', 'Quemador', 'Ventilador'] },
  { id: 'z-silo1', name: 'Silo 1', type: 'silo', equipment: ['Aireadores', 'Termometría', 'Sinfín de barrido', 'Compuerta de descarga'] },
  { id: 'z-silo2', name: 'Silo 2', type: 'silo', equipment: ['Aireadores', 'Termometría', 'Sinfín de barrido', 'Compuerta de descarga'] },
  { id: 'z-silo3', name: 'Silo 3', type: 'silo', equipment: ['Aireadores', 'Termometría', 'Sinfín de barrido', 'Compuerta de descarga'] },
  { id: 'z-silo4', name: 'Silo 4', type: 'silo', equipment: ['Aireadores', 'Termometría', 'Sinfín de barrido', 'Compuerta de descarga'] },
  { id: 'z-transportadores', name: 'Galería de transportadores', type: 'transporte', equipment: ['Redler superior', 'Redler inferior', 'Banda transportadora'] },
  { id: 'z-despacho', name: 'Despacho / Carga de camiones', type: 'despacho', equipment: ['Tolva de despacho', 'Balanza', 'Manga de carga'] },
  { id: 'z-electrico', name: 'Cuarto eléctrico / MCC', type: 'electrico', equipment: ['Tablero MCC', 'Variadores', 'PLC'] },
];

// Programa base de limpieza (genera tareas automáticamente por período).
export const SEED_PLANS = [
  { id: 'p-fosa-turno', zone_id: 'z-recepcion', title: 'Limpieza de fosa y rejillas de recepción', frequency: 'turno', role: 'limpieza',
    checklist: ['Retirar grano derramado alrededor de la fosa', 'Barrer y aspirar rejillas', 'Verificar colector de polvo'] },
  { id: 'p-pies-elev', zone_id: 'z-elevadores', title: 'Limpieza de pies de elevador', frequency: 'diario', role: 'limpieza',
    checklist: ['Retirar acumulación de grano en pie de elevador', 'Limpiar polvo en motores y guardas', 'Reportar fugas o ruidos anormales'] },
  { id: 'p-galeria', zone_id: 'z-transportadores', title: 'Barrido de galería de transportadores', frequency: 'diario', role: 'limpieza',
    checklist: ['Barrer pasillos de galería', 'Limpiar bandejas y estructuras', 'Retirar polvo de motorreductores'] },
  { id: 'p-despacho', zone_id: 'z-despacho', title: 'Limpieza de zona de despacho', frequency: 'turno', role: 'limpieza',
    checklist: ['Recoger grano derramado en carga', 'Limpiar plataforma de balanza'] },
  { id: 'p-filtros', zone_id: 'z-limpieza', title: 'Revisión y limpieza de filtros de mangas', frequency: 'semanal', role: 'mantenimiento',
    checklist: ['Verificar presión diferencial', 'Limpiar tolva del filtro', 'Revisar estado de mangas'] },
  { id: 'p-termo', zone_id: 'z-silo1', title: 'Lectura de termometría de silos', frequency: 'turno', role: 'operador',
    checklist: ['Registrar temperatura Silo 1', 'Registrar temperatura Silo 2', 'Registrar temperatura Silo 3', 'Registrar temperatura Silo 4', 'Reportar puntos calientes'] },
  { id: 'p-plagas', zone_id: 'z-recepcion', title: 'Inspección de control de plagas', frequency: 'semanal', role: 'supervisor',
    checklist: ['Revisar cebaderos', 'Verificar mallas antiaves', 'Registrar hallazgos'] },
  { id: 'p-mcc', zone_id: 'z-electrico', title: 'Limpieza de cuarto eléctrico', frequency: 'mensual', role: 'mantenimiento',
    checklist: ['Soplado de polvo en tableros (equipo desenergizado)', 'Verificar sellos de puertas', 'Orden general'] },
];
