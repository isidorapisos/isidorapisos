// Panel de administración: lo que usan todas las pestañas.
// Orden de carga: admin-comun → admin-productos → admin-categorias → admin-ventas → admin-stock
// → admin-cotizaciones → admin-resumen → admin-pagina → admin (login y arranque).
const db = supabase.createClient(SUPABASE.url, SUPABASE.clave);
const formatoPeso = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const formatoNumero = new Intl.NumberFormat("es-CL");
// Todo el panel trabaja en hora de Chile, aunque el celular o PC tenga otra zona horaria
const ZONA = "America/Santiago";
const formatoFecha = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA,
});
const formatoPartes = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
});

// Fecha → { anio, mes, dia, hora, minuto, segundo } según el reloj de Chile (mes de 1 a 12)
function partesChile(fecha = new Date()) {
  const p = Object.fromEntries(formatoPartes.formatToParts(fecha).map(({ type, value }) => [type, Number(value)]));
  return { anio: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute, segundo: p.second };
}

// Día y hora de Chile → Date. Se ajusta con el desfase que tiene Chile ese día (cambia con el horario de verano)
function fechaChile(anio, mes, dia, hora = 0) {
  const supuesto = Date.UTC(anio, mes - 1, dia, hora);
  const p = partesChile(new Date(supuesto));
  const desfase = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto) - supuesto;
  return new Date(supuesto - desfase);
}

// Categorías y productos: se cargan al entrar y los usan todas las pestañas
const datos = { categorias: [], productos: [] };

// Los textos vienen de la base: se escapan antes de ponerlos en el HTML
function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// "19.990", "$19.990" o "19990" → 19990. Vacío → null. Texto sin números → NaN.
// No sirve type="number" porque en Chile se escribe 19.990 y el navegador lo lee como 19,99.
function leerEntero(texto) {
  const valor = String(texto ?? "").trim();
  if (valor === "") return null;
  const digitos = valor.replace(/\D/g, "");
  if (digitos === "") return NaN;
  return valor.startsWith("-") ? -Number(digitos) : Number(digitos);
}

// "2,98" o "2.98" → 2.98. Vacío → null. Algo que no es número → NaN
function leerDecimal(texto) {
  const valor = String(texto ?? "").trim().replace(",", ".");
  return valor === "" ? null : Number(valor);
}

// 19990 → "19.990" para mostrarlo en un campo
function numeroParaCampo(numero) {
  return numero == null ? "" : formatoNumero.format(numero);
}

// Las fotos de la carpeta img/ están en la raíz del sitio; las subidas desde el panel son links completos
function rutaFoto(src) {
  if (!src) return "";
  return /^https?:\/\//.test(src) ? src : `../${src}`;
}

function nombreCategoria(id) {
  return datos.categorias.find((c) => c.id === id)?.nombre ?? "";
}

// Mismo orden que la página: por categoría y después por "orden"
function ordenarProductos(lista) {
  const posicion = (p) => datos.categorias.findIndex((c) => c.id === p.categoria_id);
  return lista.sort((a, b) => posicion(a) - posicion(b) || a.orden - b.orden);
}

async function cargarCatalogoAdmin() {
  const [categorias, productos] = await Promise.all([
    db.from("categorias").select("id, nombre, descripcion, orden").order("orden"),
    db.from("productos").select("*"),
  ]);
  if (categorias.error) throw categorias.error;
  if (productos.error) throw productos.error;
  datos.categorias = categorias.data;
  datos.productos = ordenarProductos(productos.data);
}

// Mes elegido en Ventas y Resumen (formato "2026-11"); las dos pestañas comparten el mismo
function mesActual() {
  const hoy = partesChile();
  return `${hoy.anio}-${String(hoy.mes).padStart(2, "0")}`;
}

let mesElegido = mesActual();

function usarMes(mes) {
  mesElegido = mes || mesActual();
  document.querySelectorAll("[data-mes]").forEach((campo) => {
    campo.value = mesElegido;
    campo.max = mesActual();
  });
}

// "2026-11" → del 1 de noviembre al 1 de diciembre a medianoche, hora de Chile
function rangoMes(mes) {
  const [anio, numero] = mes.split("-").map(Number);
  return { desde: fechaChile(anio, numero, 1), hasta: fechaChile(anio, numero + 1, 1) };
}

function nombreMes(mes) {
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: ZONA }).format(rangoMes(mes).desde);
}

// "2026-11-09" → de medianoche a medianoche de ese día, hora de Chile
function rangoDia(dia) {
  const [anio, mes, numero] = dia.split("-").map(Number);
  return { desde: fechaChile(anio, mes, numero), hasta: fechaChile(anio, mes, numero + 1) };
}

function rangoHoy() {
  return rangoDia(diaDeVenta(new Date()));
}

// Día de la venta en Chile ("2026-11-09"), para agruparlas por día
function diaDeVenta(fecha) {
  const p = partesChile(new Date(fecha));
  return `${p.anio}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

const formatoDia = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: ZONA });

// "2026-11-09" → "Hoy", "Ayer" o "lunes, 9 de noviembre"
function nombreDia(dia) {
  const [anio, mes, numero] = dia.split("-").map(Number);
  const fecha = fechaChile(anio, mes, numero, 12);
  const hoy = diaDeVenta(new Date());
  if (dia === hoy) return "Hoy";
  if (diaDeVenta(new Date(fecha.getTime() + 86400000)) === hoy) return "Ayer";
  if (diaDeVenta(new Date(fecha.getTime() - 86400000)) === hoy) return "Mañana";
  return formatoDia.format(fecha);
}

// Ventas del mes con sus productos (las usan Ventas y Resumen)
function obtenerVentasMes(mes) {
  const { desde, hasta } = rangoMes(mes);
  return obtenerVentas(desde, hasta);
}

async function obtenerVentas(desde, hasta) {
  const { data, error } = await db
    .from("ventas")
    .select("id, fecha, cliente_nombre, cliente_telefono, comuna, medio_pago, paga_con, entrega, notas, total, venta_items(id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal), despachos(*)")
    .gte("fecha", desde.toISOString())
    .lt("fecha", hasta.toISOString())
    .order("fecha", { ascending: false });
  if (error) throw error;
  data.forEach((venta) => venta.venta_items.sort((a, b) => a.id - b.id));
  return data;
}

const ENTREGAS = { retiro: "Retiro en local", despacho: "Despacho" };

// Medios de pago, en el orden en que se muestran, con su ícono
const MEDIOS_PAGO = ["Efectivo", "Débito", "Crédito", "Transferencia", "Otro"];
const ICONOS_PAGO = { Efectivo: "i-efectivo", Débito: "i-tarjeta", Crédito: "i-tarjeta", Transferencia: "i-transferencia", Otro: "i-otro" };
const formatoHora = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA });

// Etiqueta del medio de pago con su ícono (en Ventas y en Inicio)
function etiquetaPago(medio) {
  const nombre = medio || "Sin indicar";
  const icono = ICONOS_PAGO[medio] ?? "i-otro";
  const clase = medio === "Efectivo" ? " pago--efectivo" : "";
  return `<span class="pago${clase}"><svg class="icono" aria-hidden="true"><use href="#${icono}"></use></svg>${esc(nombre)}</span>`;
}

// Total, cantidad de ventas y efectivo de un grupo de ventas, con el desglose por medio de pago
function totalesPorPago(ventas) {
  const medios = Object.fromEntries(MEDIOS_PAGO.map((medio) => [medio, { total: 0, ventas: 0 }]));
  let total = 0;
  ventas.forEach((v) => {
    const medio = MEDIOS_PAGO.includes(v.medio_pago) ? v.medio_pago : "Otro";
    medios[medio].total += v.total;
    medios[medio].ventas += 1;
    total += v.total;
  });
  return { total, ventas: ventas.length, efectivo: medios.Efectivo.total, medios };
}

// "Pagó con $50.000 · vuelto $10.010" en las ventas en efectivo que lo tienen anotado
function textoVuelto(v) {
  if (v.medio_pago !== "Efectivo" || v.paga_con == null) return "";
  return `Pagó con ${formatoPeso.format(v.paga_con)} · vuelto ${formatoPeso.format(v.paga_con - v.total)}`;
}

function textoVentas(cantidad) {
  return `${cantidad} ${cantidad === 1 ? "venta" : "ventas"}`;
}

// "9 1234 5678" o "+56 9 1234 5678" → "56912345678" para abrir WhatsApp. Si no es un celular chileno, null.
function telefonoWhatsapp(telefono) {
  const digitos = String(telefono ?? "").replace(/\D/g, "");
  if (/^9\d{8}$/.test(digitos)) return `56${digitos}`;
  if (/^569\d{8}$/.test(digitos)) return digitos;
  return null;
}

// Despachos: los datos de entrega de una venta (vienen junto a la venta, o null si no se anotaron)
const ESTADOS_DESPACHO = {
  pendiente: { texto: "Por entregar", clase: "estado-despacho--pendiente" },
  entregado: { texto: "Entregado", clase: "estado-despacho--entregado" },
};

function despachoDeVenta(v) {
  return (Array.isArray(v.despachos) ? v.despachos[0] : v.despachos) ?? null;
}

// "Los Aromos 1234, Depto 302"
function direccionDespacho(d) {
  return [[d.direccion, d.numero].filter(Boolean).join(" "), d.depto].filter(Boolean).join(", ");
}

function linkMapa(d) {
  const lugar = [[d.direccion, d.numero].filter(Boolean).join(" "), d.comuna, "Chile"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`;
}

function etiquetaEstadoDespacho(d) {
  const estado = ESTADOS_DESPACHO[d.estado] ?? ESTADOS_DESPACHO.pendiente;
  return `<span class="estado-despacho ${estado.clase}">${estado.texto}</span>`;
}

// Mapa, WhatsApp a quien recibe y marcar entregado (en Ventas y en Inicio)
function accionesDespacho(ventaId, d) {
  const whatsapp = telefonoWhatsapp(d.telefono);
  const mensaje = `Hola ${d.nombre}, te escribimos de Isidora por el despacho de tu pedido a ${direccionDespacho(d)}.`;
  const entregado = d.estado === "entregado";
  return `
    <div class="entrega__acciones">
      <a class="boton boton--chico boton--borde" href="${linkMapa(d)}" target="_blank" rel="noopener"><svg class="icono"><use href="#i-mapa"></use></svg>Mapa</a>
      ${whatsapp ? `<a class="boton boton--chico boton--borde" href="https://wa.me/${whatsapp}?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener"><svg class="icono"><use href="#i-cotizaciones"></use></svg>WhatsApp</a>` : ""}
      <button type="button" class="boton boton--chico${entregado ? " boton--borde" : ""}" data-despacho-venta="${ventaId}" data-estado="${entregado ? "pendiente" : "entregado"}">
        ${entregado ? "Volver a pendiente" : `<svg class="icono"><use href="#i-check"></use></svg>Marcar entregado`}
      </button>
    </div>`;
}

async function cambiarEstadoDespacho(ventaId, estado) {
  const { data, error } = await db
    .from("despachos")
    .update({ estado, entregado_en: estado === "entregado" ? new Date().toISOString() : null })
    .eq("venta_id", ventaId)
    .select("venta_id");
  if (error || !data.length) {
    console.error(error);
    avisar("No se pudo actualizar el despacho.", "error");
    return false;
  }
  avisar(estado === "entregado" ? "Despacho entregado" : "El despacho volvió a pendiente");
  return true;
}

// Stock de cada producto en un período (un mes o un día): lo que había al empezar, lo que llegó,
// lo vendido y lo que quedó. Se calcula hacia atrás desde el stock de hoy, con las compras,
// correcciones y ventas registradas.
async function obtenerStock(desde, hasta) {
  const [movimientos, ventas] = await Promise.all([
    db.from("movimientos_stock").select("producto_id, tipo, cantidad, fecha, nota").gte("fecha", desde.toISOString()),
    db.from("ventas").select("id, fecha, venta_items(producto_id, cantidad)").gte("fecha", desde.toISOString()),
  ]);
  if (movimientos.error) throw movimientos.error;
  if (ventas.error) throw ventas.error;

  return datos.productos.map((p) => {
    let compras = 0;
    let correcciones = 0;
    let vendidos = 0;
    let despuesDelPeriodo = 0; // cuánto cambió el stock desde que terminó el período hasta hoy
    // Cada movimiento del período: cantidad positiva si entró, negativa si salió
    const detalle = [];
    movimientos.data
      .filter((m) => m.producto_id === p.id)
      .forEach((m) => {
        if (new Date(m.fecha) >= hasta) return (despuesDelPeriodo += m.cantidad);
        if (m.tipo === "compra") compras += m.cantidad;
        else correcciones += m.cantidad;
        detalle.push({ fecha: m.fecha, tipo: m.tipo === "compra" ? "compra" : "ajuste", cantidad: m.cantidad, nota: m.nota });
      });
    ventas.data.forEach((v) =>
      v.venta_items
        .filter((i) => i.producto_id === p.id)
        .forEach((i) => {
          if (new Date(v.fecha) >= hasta) return (despuesDelPeriodo -= i.cantidad);
          vendidos += i.cantidad;
          detalle.push({ fecha: v.fecha, tipo: "venta", cantidad: -i.cantidad, venta: v.id });
        })
    );
    // Si el producto no tiene stock cargado, solo se informa lo vendido
    const final = p.stock == null ? null : p.stock - despuesDelPeriodo;
    const inicial = final == null ? null : final - compras - correcciones + vendidos;

    // Con cuánto quedó después de cada movimiento: se parte del cierre y se va hacia atrás
    detalle.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    let queda = final;
    for (let i = detalle.length - 1; i >= 0; i--) {
      detalle[i].queda = queda;
      if (queda != null) queda -= detalle[i].cantidad;
    }
    return { producto: p, inicial, compras, vendidos, correcciones, final, movimientos: detalle };
  });
}

// Disponibilidad de un producto con cierta cantidad (igual que calcula la base)
function disponibilidadStock(stock, minimo) {
  if (stock == null) return "disponible";
  if (stock <= 0) return "agotado";
  if (stock <= (minimo ?? 0)) return "pocas";
  return "disponible";
}

// Suma unidades y plata por producto (la usan el Excel y el Resumen)
function resumenPorProducto(ventas) {
  const porNombre = new Map();
  ventas.forEach((venta) =>
    venta.venta_items.forEach((item) => {
      const actual = porNombre.get(item.nombre_producto) ?? { nombre: item.nombre_producto, unidades: 0, total: 0 };
      actual.unidades += item.cantidad;
      actual.total += item.subtotal;
      porNombre.set(item.nombre_producto, actual);
    })
  );
  return [...porNombre.values()].sort((a, b) => b.total - a.total);
}

// Mensaje corto abajo de la pantalla
let temporizadorAviso;
function avisar(mensaje, tipo = "ok") {
  const aviso = document.querySelector("[data-aviso]");
  aviso.textContent = mensaje;
  aviso.dataset.tipo = tipo;
  aviso.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    aviso.hidden = true;
  }, 3500);
}

// Pregunta antes de borrar algo. Devuelve true si la persona confirma.
function confirmar(texto, textoBoton = "Eliminar") {
  const dialogo = document.querySelector("[data-dialogo-confirmar]");
  dialogo.querySelector("[data-confirmar-texto]").textContent = texto;
  dialogo.querySelector("[data-confirmar-si]").textContent = textoBoton;
  dialogo.returnValue = "";
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener("close", () => resolver(dialogo.returnValue === "si"), { once: true });
  });
}

function mostrarError(selector, mensaje) {
  const error = document.querySelector(selector);
  error.textContent = mensaje;
  error.hidden = !mensaje;
  if (mensaje) error.scrollIntoView({ block: "nearest" });
}

// Botones × de las ventanas
document.addEventListener("click", (e) => {
  const cerrar = e.target.closest("[data-cerrar]");
  if (cerrar) cerrar.closest("dialog").close();
});
