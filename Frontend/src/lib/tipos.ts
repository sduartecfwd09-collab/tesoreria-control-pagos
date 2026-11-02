// Contrato con el Backend (ver ../Backend/src/routes). Hoy se mantiene a mano;
// se propone generarlo desde OpenAPI cuando crezca la API.
export interface Parametro {
  id: number;
  clave: string;
  valor: string;
  tipo: "entero" | "texto";
  ambito: "global";
  categoria: string | null;
  etiqueta: string;
  ayuda: string;
  unidad: string | null;
  min: number | null;
  max: number | null;
  opciones: string[] | null;
  supuesto: boolean;
  /** solo los visibles se muestran en Configuración */
  visible: boolean;
  /** ejemplo con fechas, redactado por el servidor */
  ejemplo: string | null;
  actualizado: string;
}

export interface Alcance {
  tipo: "todo" | "mio";
  nombre: string | null;
}

export interface Identidad {
  modoPruebas: boolean;
  /** todas las personas activas, Jefatura primero; vacía si no hay modo de pruebas */
  usuarios: { id: number; nombre: string; rol: "Jefatura" | "Tesorero" }[];
}

export interface MiConfiguracion {
  usuario: { id: number; nombre: string };
  /** valores que se aplican (el propio o, si no hay, el general) */
  diasAviso: number;
  diasEspera: number;
  propios: { diasAviso: number | null; diasEspera: number | null };
  /** solo llega al guardar: cuándo se recalcularon los estados (ISO en UTC) */
  estadosCalculadosEn?: string | null;
}

export type EstadoCelda = "leido" | "error" | "sin_sociedad" | "falta";

export interface CeldaCobertura {
  estado: EstadoCelda;
  /** archivo registrado: la celda con problema enlaza a su motivo en el detalle */
  archivoId?: number;
  archivo?: string;
  formato?: string | null;
  movimientos: number;
  duplicados: number;
  saldo?: "cuadra" | "no_cuadra" | "no_verificable";
  /** el resultado del saldo en lenguaje claro */
  saldoMotivo?: string;
  /** los movimientos vienen como imagen y no se pueden leer: no cuenta como estado de cuenta */
  imagenNoLegible?: boolean;
  error?: string | null;
}

export interface FilaCobertura {
  sociedad: string;
  cuenta: string;
  cuentaId: number | null;
  banco: string | null;
  bancoPorConfirmar: boolean | null;
  moneda: string | null;
  monedaPorConfirmar: boolean | null;
  celdas: Record<string, CeldaCobertura>;
}

export interface Cobertura {
  meses: string[];
  filas: FilaCobertura[];
  sinUbicar: { archivo: string; error: string | null }[];
}

export interface ArchivoImportado {
  id: number;
  archivo: string; // solo el nombre del archivo, con los números largos enmascarados
  sociedad: string | null;
  cuenta: string | null;
  formato: string | null;
  mes: string | null;
  /** una sola definición: leído, con error (con motivo), sin sociedad o retirado de la carpeta */
  estado: "leido" | "con_error" | "sin_sociedad" | "retirado";
  movimientos: number;
  duplicados: number;
  motivo: string | null; // visible en «con_error» y «sin_sociedad»
  conImagenes: boolean | null; // null: leído antes de registrar este dato
  advertencias: string[];
  discrepancias: { tipo: string; mensaje: string }[];
  continuidad: { estado: string; verificados: number; fallos: number; filasConFallo: number[] } | null;
  /** archivo leído y con 0 movimientos (tenga imagen o no): cuenta sin actividad */
  sinMovimientos: boolean;
  /** los movimientos vienen como imagen y el sistema no puede leerlos (no es «sin movimientos») */
  imagenNoLegible: boolean;
  /** Cuadra, No cuadra o No verificable, con su motivo en lenguaje claro; null si el archivo no trae la comprobación */
  saldo: TextoSaldo | null;
  /** primera y última fecha con movimientos del archivo */
  fechas: { del: string; al: string } | null;
  monedaOrigen: string | null;
  leidoEn: string | null;
  /** el problema que tiene el archivo ahora (null = no requiere atención) */
  problema: string | null;
  /** justificado a mano; sinEfecto = el archivo cambió o tiene otro problema y vuelve a requerir atención */
  justificacion: (Justificacion & { sinEfecto: boolean }) | null;
  /** los motivos que se pueden elegir para su problema (los entrega el Backend) */
  motivosPosibles: MotivoJustificacion[];
  puedeJustificar: boolean;
  puedeQuitarJustificacion: boolean;
}

/** El resultado del saldo en tres partes, más las tres juntas (motivo) para el texto emergente. */
export interface TextoSaldo {
  resultado: "cuadra" | "no_cuadra" | "no_verificable";
  queSePaso: string;
  queSignifica: string;
  queHacer: string;
  motivo: string;
}

export interface Importaciones {
  datos: ArchivoImportado[];
  /** archivos = leídos + con error + sin sociedad; los retirados de la carpeta no cuentan */
  resumen: { archivos: number; leidos: number; conError: number; sinSociedad: number; retirados: number; movimientos: number };
  enCurso: boolean;
  alcance: Alcance;
}

export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
  paginas: number;
  alcance?: Alcance;
}

export interface Sociedad {
  id: number;
  codigo: string | null; // abreviatura interna; puede faltar
  nombreLargo: string;
  activa: boolean;
  tesorero: string | null; // nombre del tesorero vigente; null = sin tesorero asignado
  obligaciones: number;
  cuentas: number;
}

export interface Categoria {
  id: number;
  nombre: string;
  obligaciones: number;
}

export type Frecuencia = "mensual" | "bimestral" | "trimestral" | "semestral" | "anual";
export type Moneda = "CRC" | "USD";

export type CodigoEtiqueta = "falta_dia" | "falta_mes_arranque" | "id_repetido" | "formato_iban";
export type EstadoObligacion = "activa" | "inactiva" | "en_revision" | "revisada";

/** La revisión vigente de una obligación: quién, cuándo (instante UTC) y la nota; sinEfecto = cambiaron los datos o la causa (vuelve a «En revisión»). */
export interface RevisionObligacion {
  quien: string;
  cuando: string;
  nota: string;
  sinEfecto: boolean;
}

export interface EtiquetaObligacion {
  codigo: CodigoEtiqueta;
  texto: string;
  ayuda: string;
}

export interface Obligacion {
  id: number;
  sociedadId: number;
  sociedad: string;
  categoriaId: number;
  categoria: string;
  proveedor: string;
  identificador: string;
  diaEsperadoPago: number | null;
  /** el próximo cambio de día ya programado (empieza en un mes posterior al actual); null si no hay */
  diaProgramado: { desde: string; dia: number } | null;
  diaEditado: boolean;
  frecuencia: Frecuencia;
  frecuenciaPorConfirmar: boolean;
  mesArranque: number | null;
  montoEsperado: number | null; // centavos
  moneda: Moneda;
  monedaPorConfirmar: boolean;
  cuentaEsperada: { id: number; numero: string; banco: string | null } | null;
  responsableEfectivo?: string | null; // el tesorero vigente de la sociedad; solo lo recibe Jefatura
  /** fecha calculada del próximo pago (AAAA-MM-DD); null si falta el día o el mes de arranque */
  proximoPago: string | null;
  activa: boolean;
  origen: "catalogo" | "manual";
  actualizado: string;
  /** observaciones: solo problemas reales */
  etiquetas: EtiquetaObligacion[];
  estado: EstadoObligacion;
  revision: RevisionObligacion | null;
  /** hay una acción posible para esta persona: marcar como revisada (En revisión) o quitar la revisión (Revisada) */
  puedeGestionar: boolean;
}

/** Campos que se envían al crear o editar (en la edición solo los que cambiaron). */
export interface CambiosObligacion {
  sociedadId?: number;
  categoriaId?: number;
  proveedor?: string;
  identificador?: string;
  diaEsperadoPago?: number | null;
  frecuencia?: Frecuencia;
  frecuenciaPorConfirmar?: boolean;
  mesArranque?: number | null;
  montoEsperado?: number | null;
  moneda?: Moneda;
  monedaPorConfirmar?: boolean;
  cuentaEsperadaId?: number | null;
  activa?: boolean;
  /** Solo al desactivar o reactivar: por qué se cambia. */
  motivo?: string;
}

export interface Regeneracion {
  creados: number;
  actualizados: number;
  eliminados: number;
  protegidos: number;
}

export interface FiltroObligaciones {
  sociedadId?: number;
  categoria?: number;
  activa?: boolean;
  q?: string;
  falta?: "monto" | "cuenta" | "responsable" | "dia" | "frecuencia";
  pagina: number;
  porPagina: number;
}

export interface ResumenCatalogo {
  total: number;
  activas: number;
  inactivas: number;
  sinDia: number;
  /** de las que no tienen día, cuántas están revisadas (siguen contando como sin día) */
  sinDiaRevisadas: number;
  sinMonto: number;
  sinCuenta: number;
  /** obligaciones activas cuya sociedad no tiene tesorero; solo lo recibe Jefatura */
  sinResponsable?: number;
  sinMesArranque: number;
  sinMesArranqueRevisadas: number;
  frecuenciaPorConfirmar: number;
  monedaPorConfirmar: number;
  identificadoresRepetidos: { sociedad: string; identificador: string; proveedores: string[]; obligaciones: number[] }[];
  formatoIban: { id: number; sociedad: string; proveedor: string; identificador: string }[];
  /** con estados de cuenta pero sin obligaciones: aviso individual */
  sociedadesSinObligaciones: string[];
  /** sin estados de cuenta ni obligaciones: una sola línea resumen */
  sociedadesSinEstadosNiObligaciones: string[];
  porSociedad: Record<string, number>;
  porCategoria: Record<string, number>;
}

export interface ResultadoImportacionCatalogo {
  filasLeidas: number;
  creadas: number;
  actualizadas: number;
  sinCambios: number;
  noEnArchivo: number;
  problemas: { fila: number; motivo: string; importada: boolean }[];
}

export type EstadoVencimiento = "proyectado" | "por_vencer" | "vencido" | "pagado" | "pagado_con_inconsistencia" | "sin_informacion" | "por_revisar" | "justificado";

/** Un motivo de la lista fija al justificar; los define el Backend (la pantalla no tiene su propia lista). */
export interface MotivoJustificacion {
  clave: string;
  texto: string;
  /** «Otro» y los que dicen «(explicar)» exigen una nota de 3 a 300 caracteres */
  notaObligatoria: boolean;
}

/** Quién justificó, cuándo (instante UTC), el motivo elegido y la nota (si la hay). */
export interface Justificacion {
  quien: string;
  cuando: string;
  motivo: string;
  nota: string | null;
}

/** El pago que respalda el estado de un vencimiento. `moneda` es la de la cuenta que pagó; null = sin dato (sin símbolo ni código). */
export interface PagoVencimiento {
  fecha: string;
  monto: number; // centavos
  moneda: string | null;
  banco: string | null;
  cuenta: string; // últimos 4
}

export interface Vencimiento {
  id: number;
  obligacionId: number;
  sociedad: string;
  categoria: string;
  proveedor: string;
  identificador: string;
  frecuencia: Frecuencia;
  periodo: string;
  /** pendiente de un periodo anterior al que se está viendo */
  mesAnterior: boolean;
  fecha: string;
  /** solo si la fecha se movió «de una sola vez» */
  fechaOriginal: string | null;
  montoEsperado: number | null;
  moneda: Moneda;
  estado: EstadoVencimiento;
  /** el de la obligación o, si falta, el tesorero de la sociedad */
  responsableEfectivo?: string | null; // solo lo recibe Jefatura
  /** días de hoy a la fecha vigente (negativo = ya pasó); se calcula en el servidor con su reloj */
  dias: number;
  motivo: string | null;
  /** pago menos fecha vigente, en días (positivo = pagó después) */
  diferenciaDias: number | null;
  /** con «Sin información»: hasta qué fecha hay estados de cuenta de la sociedad */
  sinInfoHasta: string | null;
  textoEstado: string | null;
  pago: PagoVencimiento | null;
  conciliado: boolean;
  futuro: boolean;
  /** pago asociado a mano: quién, cuándo (instante UTC) y por qué; null si no hay una asociación vigente */
  asociadoAMano: AsociacionManual | null;
  /** la asociación sigue vigente pero el pago ya no aparece en los estados de cuenta */
  sinEfecto: boolean;
  /** justificado a mano (solo mientras el estado sea Justificado: con un pago, el pago manda) */
  justificado: Justificacion | null;
  /** hay una acción posible para esta persona (asociar un pago, justificar, o quitar lo que haya) */
  puedeGestionar: boolean;
}

export interface AsociacionManual {
  quien: string;
  cuando: string;
  motivo: string;
}

/** Un pago del banco que se puede asociar a un vencimiento (descripción con los números largos enmascarados, cuenta con los últimos 4). */
export interface CandidatoPago {
  movimientoId: number;
  fecha: string;
  descripcion: string | null;
  cuenta: string;
  banco: string | null;
  monto: number;
  moneda: string | null;
  /** el identificador de la obligación aparece en la descripción o en la referencia del pago */
  traeNumero: boolean;
  /** el nombre del proveedor (o un alias conocido) aparece en la descripción del pago */
  traeProveedor: boolean;
}

export interface AvisoDatos {
  sociedadId: number;
  sociedad: string;
  estadosHasta: string | null;
  sinEstadosDesde: string | null;
  texto: string;
}

/** Una fila del Histórico (GET /api/historico). */
export interface FilaHistorico {
  id: number;
  sociedad: string;
  proveedor: string;
  categoria: string;
  periodo: string;
  fecha: string;
  estado: EstadoVencimiento;
  pago: PagoVencimiento | null;
}

export interface FiltroHistorico {
  desde?: string;
  hasta?: string;
  sociedadId?: number;
  categoria?: number;
  /** estados separados por coma */
  estado?: string;
  q?: string;
  pagina: number;
  porPagina: number;
}

export interface RespuestaHistorico extends Pagina<FilaHistorico> {
  alcance: Alcance;
  /** el rango que se aplicó (el que se pidió o el de los últimos meses por defecto) */
  rango: { desde: string; hasta: string };
  porDefecto: boolean;
  /** primera y última fecha con movimientos de los estados de cuenta cargados; null = ninguno */
  coberturaEstados: { primera: string; ultima: string } | null;
  cobertura: { sinInformacion: boolean; parcial: boolean };
  resumen: Record<string, number>;
}

/** Primera y última fecha con datos (GET /api/fechas/limites), con el alcance de la persona; null = sin datos. */
export interface LimitesFechas {
  alcance: Alcance;
  hoy: string;
  /** por dónde se puede navegar en el selector de fechas (parámetros, no depende de los datos) */
  ventana: { primera: string; ultima: string };
  vencimientos: { primera: string; ultima: string } | null;
  movimientos: { primera: string; ultima: string } | null;
}

export interface FiltroVencimientos {
  sociedadId?: number;
  categoria?: number;
  periodo?: string;
  /** día exacto de la fecha de vencimiento (AAAA-MM-DD), ambos incluidos */
  fechaDesde?: string;
  fechaHasta?: string;
  q?: string;
  /** estados separados por coma */
  estado?: string;
  /** con `periodo`: incluye los pendientes de periodos anteriores */
  pendientesAnteriores?: boolean;
  pagina: number;
  porPagina: number;
}


/** Detalle de solo lectura de un vencimiento (GET /api/vencimientos/:id). */
export interface MovimientoDetalle {
  fecha: string;
  monto: number; // centavos
  moneda: string | null; // la de la cuenta; null = sin dato
  banco: string | null;
  cuenta: string; // últimos 4
  sociedad: string;
  descripcion: string | null; // con los números largos enmascarados
  /** es el movimiento que respalda el estado */
  delPago: boolean;
}

export interface ObligacionDelGrupo {
  proveedor: string;
  categoria: string;
  diaPago: number | null;
  /** estado de su vencimiento del mes; null si no tiene */
  estado: string | null;
}

export interface DetalleVencimiento {
  id: number;
  proveedor: string;
  categoria: string;
  identificador: string;
  sociedad: string;
  periodo: string;
  fecha: string;
  fechaOriginal: string;
  movida: boolean;
  fechaMovidaPor: string | null;
  /** quién movió la fecha, cuándo (instante UTC) y por qué; null si no está movida */
  movidaPor: { quien: string; cuando: string; motivo: string } | null;
  /** hasta dónde se puede mover la fecha (ISO, extremos incluidos) */
  rangoMoverFecha: { desde: string; hasta: string };
  puedeMoverFecha: boolean;
  puedeQuitarMovimiento: boolean;
  estado: EstadoVencimiento;
  motivo: string | null;
  textoEstado: string | null;
  diferenciaDias: number | null;
  sinInfoHasta: string | null;
  responsableEfectivo?: string | null; // solo lo recibe Jefatura
  ventana: { desde: string; hasta: string; diasAntes: number; diasDespues: number };
  cobertura: { estadosHasta: string | null; cuentas: number; cuentasSinCobertura: { cuenta: string; banco: string | null; hasta: string | null }[] } | null;
  /** textos armados por el servidor con los datos reales: qué pasó, por qué y qué hacer */
  textos: { resumen: string; parrafos: string[]; queHacer: string | null };
  asociadoAMano: AsociacionManual | null;
  sinEfecto: boolean;
  justificado: Justificacion | null;
  /** los motivos que se pueden elegir al justificar un vencimiento */
  motivosDeJustificacion: MotivoJustificacion[];
  puedeGestionar: boolean;
  /** obligaciones de la sociedad con el mismo número de servicio (vacío si no se comparte) */
  grupo: ObligacionDelGrupo[];
  movimientos: MovimientoDetalle[];
}

export type ClaveGrupoAviso = "vencidos" | "por_vencer" | "por_revisar" | "sin_informacion";

export interface FilaAviso {
  id: number;
  sociedad: string;
  proveedor: string;
  /** ya viene enmascarado */
  identificador: string;
  periodo: string;
  /** fecha habitual de pago */
  fecha: string;
  estado: EstadoVencimiento;
  textoEstado: string;
  dias: number;
  responsableEfectivo?: string | null; // solo lo recibe Jefatura
}

export interface GrupoAviso {
  clave: ClaveGrupoAviso;
  titulo: string;
  total: number;
  filas: FilaAviso[];
}

export interface Avisos {
  alcance: Alcance;
  /** última vez que se calcularon los estados (ISO en UTC); null si nunca */
  estadosCalculadosEn: string | null;
  usuario: { nombre: string; rol: string } | null;
  diasAviso: number;
  hoy: string;
  total: number;
  grupos: GrupoAviso[];
}

export interface MovimientoSinObligacion {
  /** identifica el grupo para pedir su detalle */
  clave: string;
  proveedor: string;
  identificador: string;
  pagos: number;
  primeraFecha: string;
  ultimaFecha: string;
  sociedades: string[];
  cuentas: string[];
}

export interface MovimientosSinObligacion {
  datos: MovimientoSinObligacion[];
  totalGrupos: number;
  totalPagos: number;
  alcance: Alcance;
}

export interface PagoSinObligacion {
  fecha: string;
  banco: string | null;
  cuenta: string;
  sociedad: string;
  descripcion: string | null;
  referencia: string | null;
  /** débito en centavos */
  monto: number;
  moneda: string | null;
  identificador: string;
  comoSeExtrajo: string;
  archivo: { id: number; nombre: string; rutaRelativa: string } | null;
  hoja: string | null;
  fila: number | null;
}

export interface DetalleMovimientoSinObligacion {
  proveedor: string;
  pagos: PagoSinObligacion[];
}

export interface InfoArchivo {
  id: number;
  nombre: string;
  rutaRelativa: string;
  estado: string;
  motivoArchivo: string | null;
  sociedad: string | null;
  cuenta: string | null;
  banco: string | null;
  moneda: string | null;
  formato: string | null;
  mes: string | null;
  hoja: string | null;
  periodoDeclarado: { del: string | null; al: string | null } | null;
  fechas: { del: string; al: string } | null;
  filasLeidas: number;
  movimientos: number;
  duplicados: number;
  /** centavos; null = no detectado */
  saldoInicial: number | null;
  saldoFinal: number | null;
  imagenNoLegible: boolean;
  saldo: TextoSaldo | null;
  problema: string | null;
  justificacion: (Justificacion & { sinEfecto: boolean }) | null;
  motivosPosibles: MotivoJustificacion[];
  puedeJustificar: boolean;
  puedeQuitarJustificacion: boolean;
}

/** Una fila del Historial de cambios (GET /api/historial-cambios): un dato cambiado. Sin montos, cuentas ni identificadores completos. */
export interface FilaHistorial {
  id: number;
  creadoEn: string;
  /** null = sin sociedad (p. ej. un archivo cuya carpeta no la tiene) */
  sociedad: string | null;
  obligacion: { proveedor: string; categoria: string; identificador: string } | null;
  /** solo en las líneas de un archivo: la cuenta (últimos 4), el mes y el nombre del archivo; nunca la ruta */
  archivo: { nombre: string | null; mes: string | null; cuenta: string | null } | null;
  /** crear | editar | activar | desactivar | asociar_pago | quitar_asociacion | justificar | quitar_justificacion */
  accion: string;
  campo: string;
  antes: string | null;
  despues: string | null;
  motivo: string | null;
  /** el nombre guardado en la línea, no el actual de la persona */
  nombreUsuario: string;
  modoPruebas: boolean;
}

export interface RespuestaHistorial extends Pagina<FilaHistorial> {
  alcance: Alcance;
  /** lo que existe dentro del alcance de la persona, para los filtros */
  opciones: { sociedades: { id: number; nombre: string }[]; personas: { id: number; nombre: string }[]; campos: string[] };
}

export interface FiltroHistorial {
  desde?: string;
  hasta?: string;
  sociedadId?: number;
  usuarioId?: number;
  campo?: string;
  pagina: number;
}

export type TipoDiferencia = "posible_renombre" | "ya_no_esta" | "dia_distinto";
export type AccionDiferencia = "es_la_misma" | "son_distintas" | "sigue_vigente" | "desactivar" | "mantener_plataforma" | "usar_excel";

export interface DatosDiferencia {
  proveedor: string;
  /** ya viene enmascarado */
  identificador: string;
  dia: number | null;
}

export interface FilaDiferencia {
  clave: string;
  tipo: TipoDiferencia;
  estado: "pendiente" | "decidida";
  sociedadId: number;
  sociedad: string;
  plataforma: DatosDiferencia;
  excel: DatosDiferencia | null;
  decision: { accion: AccionDiferencia; quien: string; cuando: string; motivo: string } | null;
  /** las acciones que esta persona puede hacer ahora (vacío si ya está decidida o no puede actuar) */
  acciones: AccionDiferencia[];
  puedeGestionar: boolean;
}

export interface RespuestaDiferencias {
  datos: FilaDiferencia[];
  /** pendientes por tipo (con el filtro de sociedad, sin el de tipo ni el de estado) */
  resumen: Record<TipoDiferencia, number>;
  pendientes: number;
  /** false = no hay tabla de pagos frecuentes que leer */
  disponible: boolean;
  alcance: Alcance;
}
