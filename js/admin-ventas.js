// Pestaña Ventas: registrar ventas (el stock se descuenta solo), ver las del mes y bajarlas a Excel.
const OTRO_PRODUCTO = "otro";
const LIBRERIA_EXCEL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const FORMATO_PESOS_EXCEL = '"$"#,##0';
const FORMATO_FECHA_EXCEL = "dd-mm-yyyy hh:mm";

let ventasPeriodo = [];
let cotizacionEnVenta = null; // cotización que se está pasando a venta (pestaña Cotizaciones)
let totalVenta = 0; // total de la venta que se está registrando

// Registrar venta
function opcionesProductos() {
  const grupos = datos.categorias
    .map((c) => {
      const productos = datos.productos.filter((p) => p.categoria_id === c.id);
      if (!productos.length) return "";
      const opciones = productos
        .map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}${p.activo ? "" : " (oculto)"}</option>`)
        .join("");
      return `<optgroup label="${esc(c.nombre)}">${opciones}</optgroup>`;
    })
    .join("");
  return `<option value="">Elige un producto</option>${grupos}<option value="${OTRO_PRODUCTO}">Otro producto o servicio…</option>`;
}

function agregarItem() {
  document.querySelector("[data-items]").insertAdjacentHTML(
    "beforeend",
    `<div class="admin-item" data-item>
      <select data-item-producto aria-label="Producto">${opcionesProductos()}</select>
      <input data-item-nombre placeholder="¿Qué vendiste? Ej: Instalación" aria-label="Qué vendiste" autocomplete="off" hidden>
      <div class="admin-item__numeros">
        <label>Cantidad <input data-item-cantidad inputmode="numeric" value="1" autocomplete="off"></label>
        <label>Precio c/u <input data-item-precio inputmode="numeric" placeholder="$" autocomplete="off"></label>
        <span class="admin-item__subtotal" data-item-subtotal>$0</span>
        <button type="button" class="admin-item__quitar" data-quitar-item aria-label="Quitar este producto">×</button>
      </div>
      <small class="admin-item__aviso" data-item-aviso hidden></small>
    </div>`
  );
  actualizarBotonesQuitar();
}

function actualizarBotonesQuitar() {
  const filas = document.querySelectorAll("[data-item]");
  filas.forEach((fila) => {
    fila.querySelector("[data-quitar-item]").hidden = filas.length === 1;
  });
}

function leerItem(fila) {
  const valor = fila.querySelector("[data-item-producto]").value;
  const producto = datos.productos.find((p) => p.id === valor) ?? null;
  return {
    valor,
    producto,
    nombre: valor === OTRO_PRODUCTO ? fila.querySelector("[data-item-nombre]").value.trim() : producto?.nombre ?? "",
    cantidad: leerEntero(fila.querySelector("[data-item-cantidad]").value),
    precio: leerEntero(fila.querySelector("[data-item-precio]").value),
  };
}

function recalcularVenta() {
  let total = 0;
  document.querySelectorAll("[data-item]").forEach((fila) => {
    const { producto, cantidad, precio } = leerItem(fila);
    const subtotal = cantidad > 0 && precio >= 0 ? cantidad * precio : 0;
    total += subtotal;
    fila.querySelector("[data-item-subtotal]").textContent = formatoPeso.format(subtotal);

    // Avisa, pero deja registrar: a veces el stock del panel no está al día
    const aviso = fila.querySelector("[data-item-aviso]");
    const faltaStock = producto?.stock != null && cantidad > producto.stock;
    aviso.hidden = !faltaStock;
    if (faltaStock) {
      aviso.textContent =
        producto.stock > 0
          ? `En el panel solo quedan ${producto.stock}. Igual puedes registrarla.`
          : "En el panel figura sin stock. Igual puedes registrarla.";
    }
  });
  document.querySelector("[data-total-venta]").textContent = formatoPeso.format(total);
  totalVenta = total;
  actualizarPagoEfectivo();
}

// Billetes con que suele pagar la gente: el monto justo y el siguiente redondeo a $5.000, $10.000, $20.000 y $50.000
function pagosSugeridos(total) {
  if (!(total > 0)) return [];
  const redondeos = [5000, 10000, 20000, 50000].map((billete) => Math.ceil(total / billete) * billete);
  return [total, ...new Set(redondeos.filter((monto) => monto > total))].slice(0, 4);
}

// Con efectivo se muestra "¿Con cuánto paga?" y el vuelto al tiro
function actualizarPagoEfectivo() {
  const form = document.querySelector("[data-form-venta]");
  const bloque = document.querySelector("[data-pago-efectivo]");
  bloque.hidden = form.medio_pago.value !== "Efectivo";
  if (bloque.hidden) return;

  const pagaCon = leerEntero(form.paga_con.value);
  document.querySelector("[data-pagos-rapidos]").innerHTML = pagosSugeridos(totalVenta)
    .map((monto, i) => `<button type="button" class="chip" data-pago-rapido="${monto}" aria-pressed="${monto === pagaCon}">${i === 0 ? "Justo" : formatoPeso.format(monto)}</button>`)
    .join("");

  const vuelto = document.querySelector("[data-vuelto]");
  // Ojo: null >= 0 es verdadero en JavaScript, por eso el vacío se revisa aparte
  vuelto.hidden = pagaCon == null || !(pagaCon >= 0) || !totalVenta;
  if (vuelto.hidden) return;
  const diferencia = pagaCon - totalVenta;
  vuelto.classList.toggle("pago-efectivo__vuelto--falta", diferencia < 0);
  vuelto.innerHTML = diferencia < 0
    ? `<span>Faltan</span><strong>${formatoPeso.format(-diferencia)}</strong>`
    : `<span>Vuelto</span><strong>${formatoPeso.format(diferencia)}</strong>`;
}

// Con despacho se muestra "Datos de entrega". Si está vacío, se completa con los datos del cliente que ya estén.
function actualizarEntrega() {
  const form = document.querySelector("[data-form-venta]");
  const seccion = document.querySelector("[data-datos-entrega]");
  seccion.hidden = form.entrega.value !== "despacho";
  if (seccion.hidden) return;
  const copiar = [["despacho_nombre", "cliente_nombre"], ["despacho_telefono", "cliente_telefono"], ["despacho_comuna", "comuna"]];
  copiar.forEach(([destino, origen]) => {
    if (!form[destino].value.trim()) form[destino].value = form[origen].value.trim();
  });
}

function leerDespacho(form) {
  return {
    nombre: form.despacho_nombre.value.trim(),
    telefono: form.despacho_telefono.value.trim(),
    direccion: form.despacho_direccion.value.trim(),
    numero: form.despacho_numero.value.trim(),
    depto: form.despacho_depto.value.trim(),
    comuna: form.despacho_comuna.value.trim(),
    referencia: form.despacho_referencia.value.trim(),
    fecha_entrega: form.despacho_fecha.value,
  };
}

function revisarDespacho(d) {
  if (!d.nombre) return "Escribe el nombre de quien recibe el despacho.";
  if (!d.telefono) return "Escribe el teléfono de quien recibe, para coordinar la entrega.";
  if (!d.direccion) return "Escribe la calle de la entrega.";
  if (!d.numero) return "Escribe el número de la dirección. Si no tiene, escribe S/N.";
  if (!d.comuna) return "Escribe la comuna de la entrega.";
  return "";
}

// Devuelve el problema a corregir, o "" si está todo bien
function revisarItems(items) {
  for (const [numero, item] of items.entries()) {
    const cual = items.length > 1 ? ` (producto ${numero + 1})` : "";
    if (!item.valor) return `Elige el producto${cual}.`;
    if (!item.nombre) return `Escribe qué vendiste${cual}.`;
    if (!(item.cantidad > 0)) return `La cantidad tiene que ser mayor que 0${cual}.`;
    // Ojo: en JavaScript null >= 0 es verdadero, por eso se revisa el vacío aparte
    if (item.precio == null || !(item.precio >= 0)) return `Escribe el precio${cual}, por ejemplo 19.990.`;
  }
  return "";
}

const dosDigitos = (numero) => String(numero).padStart(2, "0");

// Hoy según Chile, en el formato del campo de fecha ("2026-11-09")
function fechaHoy() {
  const hoy = partesChile();
  return `${hoy.anio}-${dosDigitos(hoy.mes)}-${dosDigitos(hoy.dia)}`;
}

// Si la venta es de hoy se guarda la hora actual; si es de otro día, a mediodía de Chile
function fechaDeVenta(valor) {
  if (valor === fechaHoy()) return new Date().toISOString();
  const [anio, mes, dia] = valor.split("-").map(Number);
  return fechaChile(anio, mes, dia, 12).toISOString();
}

// Sin cotización: venta en blanco. Con cotización: sus productos y los datos del cliente ya puestos
function abrirRegistroVenta(cotizacion = null) {
  const form = document.querySelector("[data-form-venta]");
  form.reset();
  form.querySelector("details").open = false;
  document.querySelector("[data-items]").innerHTML = "";
  cotizacionEnVenta = cotizacion;
  if (cotizacion) {
    cotizacion.items.forEach((item) => {
      agregarItem();
      const fila = [...document.querySelectorAll("[data-item]")].at(-1);
      const producto = datos.productos.find((p) => p.id === item.producto_id);
      const select = fila.querySelector("[data-item-producto]");
      if (producto) {
        select.value = producto.id;
      } else {
        // El producto ya no está en el catálogo: se registra con el nombre que tenía
        select.value = OTRO_PRODUCTO;
        const nombre = fila.querySelector("[data-item-nombre]");
        nombre.hidden = false;
        nombre.value = item.nombre;
      }
      fila.querySelector("[data-item-cantidad]").value = item.cantidad;
      fila.querySelector("[data-item-precio]").value = numeroParaCampo(producto?.precio ?? item.precio_unitario);
    });
    form.cliente_nombre.value = cotizacion.cliente_nombre ?? "";
    form.cliente_telefono.value = cotizacion.cliente_telefono ?? "";
    form.comuna.value = cotizacion.comuna ?? "";
    form.notas.value = cotizacion.referencia ? `Cotización ${cotizacion.referencia}` : "";
    form.querySelector("details").open = true;
  } else {
    agregarItem();
  }
  form.fecha.value = fechaHoy();
  form.fecha.max = fechaHoy();
  form.medio_pago.value = "Efectivo";
  mostrarError("[data-error-venta]", "");
  recalcularVenta();
  actualizarEntrega();
  document.querySelector("[data-dialogo-venta]").showModal();
}

async function guardarVenta(e) {
  e.preventDefault();
  const form = e.target;
  const items = [...document.querySelectorAll("[data-item]")].map(leerItem);
  let problema = revisarItems(items);
  if (!problema && !form.fecha.value) problema = "Elige la fecha de la venta.";
  if (!problema && form.fecha.value > fechaHoy()) problema = "La fecha no puede ser de un día que todavía no llega.";
  const efectivo = form.medio_pago.value === "Efectivo";
  const pagaCon = efectivo ? leerEntero(form.paga_con.value) : null;
  if (!problema && Number.isNaN(pagaCon)) problema = "Escribe con cuánto paga en números, por ejemplo 50.000, o déjalo vacío.";
  if (!problema && pagaCon != null && pagaCon < totalVenta) {
    problema = `Con ${formatoPeso.format(pagaCon)} no alcanza: faltan ${formatoPeso.format(totalVenta - pagaCon)}.`;
  }
  const despacho = form.entrega.value === "despacho" ? leerDespacho(form) : null;
  if (!problema && despacho) problema = revisarDespacho(despacho);
  if (problema) return mostrarError("[data-error-venta]", problema);

  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  boton.textContent = "Guardando…";
  mostrarError("[data-error-venta]", "");
  const { error } = await db.rpc("registrar_venta", {
    venta: {
      fecha: fechaDeVenta(form.fecha.value),
      medio_pago: form.medio_pago.value,
      paga_con: pagaCon,
      entrega: form.entrega.value,
      despacho,
      cliente_nombre: form.cliente_nombre.value,
      cliente_telefono: form.cliente_telefono.value,
      comuna: form.comuna.value,
      notas: form.notas.value,
    },
    items: items.map((item) => ({
      producto_id: item.producto?.id ?? null,
      nombre_producto: item.nombre,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
    })),
  });
  boton.disabled = false;
  boton.textContent = "Guardar venta";
  if (error) {
    console.error(error);
    return mostrarError("[data-error-venta]", "No se pudo guardar la venta. Revisa tu conexión e intenta de nuevo.");
  }

  document.querySelector("[data-dialogo-venta]").close();
  avisar(pagaCon != null && pagaCon > totalVenta ? `Venta registrada · vuelto ${formatoPeso.format(pagaCon - totalVenta)}` : "Venta registrada");
  // Si venía de una cotización, queda marcada como "Compró"
  if (cotizacionEnVenta) {
    const { error: errorCotizacion } = await db.from("cotizaciones").update({ estado: "aceptada" }).eq("id", cotizacionEnVenta.id);
    if (errorCotizacion) console.error(errorCotizacion);
    cotizacionEnVenta = null;
    if (pestanaAbierta() === "cotizaciones") cargarCotizaciones();
    else contarPendientes();
  }
  // Se muestra el mes (o el día) de la venta y se recargan los productos, porque la venta descontó stock.
  // Se puede registrar desde Inicio o desde Ventas: se actualiza la que esté abierta.
  usarMes(form.fecha.value.slice(0, 7));
  if (periodoVentas.tipo === "dia") periodoVentas.dia = form.fecha.value;
  await recargarProductos();
  if (pestanaAbierta() === "resumen") cargarResumen();
  else cargarVentas();
}

// Período que se ve en Ventas (y que baja al Excel): un mes completo o un solo día
const periodoVentas = { tipo: "mes", dia: "" };
const formatoDiaConAnio = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONA });
const conMayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

function rangoPeriodo() {
  return periodoVentas.tipo === "dia" ? rangoDia(periodoVentas.dia) : rangoMes(mesElegido);
}

// Para frases: "en noviembre de 2026", "hoy", "ayer" o "el martes, 3 de noviembre"
function textoEnPeriodo() {
  if (periodoVentas.tipo === "mes") return `en ${nombreMes(mesElegido)}`;
  const nombre = nombreDia(periodoVentas.dia);
  return nombre === "Hoy" || nombre === "Ayer" ? nombre.toLowerCase() : `el ${nombre}`;
}

// Para el Excel: "Noviembre de 2026" o "Martes, 3 de noviembre de 2026"
function tituloPeriodo() {
  if (periodoVentas.tipo === "mes") return conMayuscula(nombreMes(mesElegido));
  const [anio, mes, dia] = periodoVentas.dia.split("-").map(Number);
  return conMayuscula(formatoDiaConAnio.format(fechaChile(anio, mes, dia, 12)));
}

// Botones Mes / Día y el campo que corresponde
function mostrarControlesPeriodo() {
  const esDia = periodoVentas.tipo === "dia";
  document.querySelectorAll("[data-tipo-periodo]").forEach((boton) => {
    boton.setAttribute("aria-pressed", boton.dataset.tipoPeriodo === periodoVentas.tipo);
  });
  const campoDia = document.querySelector("[data-dia]");
  campoDia.hidden = !esDia;
  campoDia.value = periodoVentas.dia;
  campoDia.max = fechaHoy();
  document.querySelector('[data-panel="ventas"] [data-mes]').hidden = esDia;
}

// Al pasar a "Día" se muestra hoy si se estaba viendo este mes, o el primer día del mes elegido.
// Al volver a "Mes" se muestra el mes del día que se estaba viendo.
function cambiarPeriodo(tipo) {
  if (tipo === periodoVentas.tipo) return;
  periodoVentas.tipo = tipo;
  if (tipo === "dia") periodoVentas.dia = mesElegido === mesActual() ? fechaHoy() : `${mesElegido}-01`;
  else usarMes(periodoVentas.dia.slice(0, 7));
  cargarVentas();
}

// Abre Ventas en un día (desde "Ver en Ventas" del Inicio o desde el título de un día)
function verVentasDelDia(dia) {
  periodoVentas.tipo = "dia";
  periodoVentas.dia = dia;
  usarMes(dia.slice(0, 7));
  if (pestanaAbierta() === "ventas") cargarVentas();
  else abrirPestana("ventas");
}

// Totales del período: lo vendido y cuánto entró por cada medio de pago
function mostrarResumenVentas(ventas) {
  const contenedor = document.querySelector("[data-resumen-ventas]");
  contenedor.hidden = !ventas.length;
  if (!ventas.length) return;
  const cuenta = totalesPorPago(ventas);
  const medios = MEDIOS_PAGO.map((medio) => {
    const datosMedio = cuenta.medios[medio];
    const clases = ["resumen-pagos__medio", medio === "Efectivo" ? "resumen-pagos__medio--efectivo" : "", datosMedio.ventas ? "" : "resumen-pagos__medio--vacio"];
    return `
      <div class="${clases.filter(Boolean).join(" ")}">
        <span><svg class="icono" aria-hidden="true"><use href="#${ICONOS_PAGO[medio]}"></use></svg>${medio}</span>
        <strong>${formatoPeso.format(datosMedio.total)}</strong>
        <small>${textoVentas(datosMedio.ventas)}</small>
      </div>`;
  }).join("");
  contenedor.innerHTML = `
    <div class="resumen-pagos__total">
      <span>Total vendido</span>
      <strong>${formatoPeso.format(cuenta.total)}</strong>
      <small>${textoVentas(cuenta.ventas)}</small>
    </div>
    ${medios}`;
}

// Recuadro con los datos de entrega, solo en ventas con despacho
function bloqueEntrega(v) {
  if (v.entrega !== "despacho") return "";
  const d = despachoDeVenta(v);
  const titulo = `<span class="entrega__titulo"><svg class="icono" aria-hidden="true"><use href="#i-despacho"></use></svg>Despacho</span>`;
  if (!d) return `<div class="entrega entrega--sin-datos">${titulo}<small>Sin datos de entrega</small></div>`;
  return `
    <div class="entrega">
      <div class="entrega__cabeza">${titulo}${etiquetaEstadoDespacho(d)}</div>
      <p class="entrega__quien"><strong>${esc(d.nombre)}</strong>${d.telefono ? ` · ${esc(d.telefono)}` : ""}</p>
      <p>${esc(direccionDespacho(d))}${d.comuna ? ` · ${esc(d.comuna)}` : ""}</p>
      ${d.referencia ? `<p class="entrega__ref">${esc(d.referencia)}</p>` : ""}
      ${d.fecha_entrega ? `<p class="entrega__fecha">Entrega: ${esc(nombreDia(d.fecha_entrega))}</p>` : ""}
      ${accionesDespacho(v.id, d)}
    </div>`;
}

// Ventas del período
function tarjetaVenta(v) {
  const productos = v.venta_items
    .map((i) => `<li><span>${i.cantidad} × ${esc(i.nombre_producto)}</span><span>${formatoPeso.format(i.subtotal)}</span></li>`)
    .join("");
  const cliente = [v.cliente_nombre, v.cliente_telefono, v.comuna].filter(Boolean).map(esc).join(" · ");
  const datosVenta = [`#${v.id}`, ENTREGAS[v.entrega]].filter(Boolean).map(esc).join(" · ");
  const vuelto = textoVuelto(v);
  return `
    <article class="admin-venta">
      <header>
        <span class="admin-venta__datos"><time>${formatoHora.format(new Date(v.fecha))}</time>${datosVenta}</span>
        ${etiquetaPago(v.medio_pago)}
      </header>
      ${cliente ? `<p class="admin-venta__cliente">${cliente}</p>` : ""}
      <ul>${productos}</ul>
      ${v.notas ? `<p class="admin-venta__notas">${esc(v.notas)}</p>` : ""}
      ${bloqueEntrega(v)}
      <p class="admin-venta__total"><span>Total</span><strong>${formatoPeso.format(v.total)}</strong></p>
      <div class="admin-venta__pie">
        <span>${vuelto ? esc(vuelto) : ""}</span>
        <button type="button" class="admin-venta__borrar" data-borrar-venta="${v.id}">Eliminar</button>
      </div>
    </article>`;
}

// Las ventas del mes van agrupadas por día, con el total y el efectivo de cada día
function bloqueDia(dia, ventas) {
  const cuenta = totalesPorPago(ventas);
  return `
    <section class="dia-ventas" aria-label="${esc(nombreDia(dia))}">
      <header class="dia-ventas__cabeza">
        <div>
          <h2>${esc(nombreDia(dia))}</h2>
          <small>${textoVentas(cuenta.ventas)} · <button type="button" class="enlace-chico" data-ver-dia="${dia}">Ver solo este día</button></small>
        </div>
        <dl>
          <div class="dia-ventas__efectivo"><dt>Efectivo</dt><dd>${formatoPeso.format(cuenta.efectivo)}</dd></div>
          <div><dt>Total</dt><dd>${formatoPeso.format(cuenta.total)}</dd></div>
        </dl>
      </header>
      <div class="admin__ventas">${ventas.map(tarjetaVenta).join("")}</div>
    </section>`;
}

function mostrarVentas() {
  const lista = document.querySelector("[data-lista-ventas]");
  const bajada = document.querySelector("[data-total-ventas]");
  mostrarResumenVentas(ventasPeriodo);
  if (!ventasPeriodo.length) {
    bajada.textContent = "";
    lista.innerHTML = `<p class="admin__vacio">No hay ventas registradas ${textoEnPeriodo()}.</p>`;
    return;
  }
  bajada.textContent = conMayuscula(`${textoVentas(ventasPeriodo.length)} ${textoEnPeriodo()}`);

  // Un solo día: la lista directa, porque los totales ya están arriba
  if (periodoVentas.tipo === "dia") {
    lista.innerHTML = `<div class="admin__ventas">${ventasPeriodo.map(tarjetaVenta).join("")}</div>`;
    return;
  }
  // Un mes: agrupadas por día. Vienen de la más nueva a la más antigua, así que los días quedan en ese orden
  const porDia = new Map();
  ventasPeriodo.forEach((v) => {
    const dia = diaDeVenta(v.fecha);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(v);
  });
  lista.innerHTML = [...porDia].map(([dia, ventas]) => bloqueDia(dia, ventas)).join("");
}

async function cargarVentas() {
  const lista = document.querySelector("[data-lista-ventas]");
  mostrarControlesPeriodo();
  lista.innerHTML = `<p class="admin__vacio">Cargando ventas…</p>`;
  try {
    const { desde, hasta } = rangoPeriodo();
    ventasPeriodo = await obtenerVentas(desde, hasta);
    mostrarVentas();
  } catch (error) {
    console.error(error);
    document.querySelector("[data-total-ventas]").textContent = "";
    document.querySelector("[data-resumen-ventas]").hidden = true;
    lista.innerHTML = `<p class="admin__vacio">No se pudieron cargar las ventas. Revisa tu conexión.</p>`;
  }
}

async function borrarVenta(id) {
  const confirma = await confirmar(`¿Eliminar la venta #${id}? Los productos vuelven al stock.`);
  if (!confirma) return;
  const { data, error } = await db.from("ventas").delete().eq("id", id).select("id");
  if (error || !data.length) {
    console.error(error);
    return avisar("No se pudo eliminar la venta.", "error");
  }
  avisar("Venta eliminada");
  await Promise.all([recargarProductos(), cargarVentas()]);
}

// Excel
// La librería (SheetJS) se carga recién al descargar, para que el panel abra rápido en el celular
function cargarLibreriaExcel() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolver, rechazar) => {
    const script = document.createElement("script");
    script.src = LIBRERIA_EXCEL;
    script.onload = resolver;
    script.onerror = () => rechazar(new Error("No se pudo cargar la librería de Excel"));
    document.head.append(script);
  });
}

// Excel guarda las fechas como días desde el 30-12-1899, sin zona horaria: se escribe la hora de Chile.
// Se calcula aquí porque la librería corre la hora unos segundos con la zona horaria de Chile.
function fechaExcel(fecha) {
  const p = partesChile(fecha);
  const local = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return (local - Date.UTC(1899, 11, 30)) / 86400000;
}

// Un día sin hora ("2026-11-04") en el formato de fechas de Excel
function diaExcel(dia) {
  const [anio, mes, numero] = dia.split("-").map(Number);
  return (Date.UTC(anio, mes - 1, numero) - Date.UTC(1899, 11, 30)) / 86400000;
}

// Da formato a columnas enteras: $19.990 en las de plata, día y hora en la fecha
function darFormato(hoja, columnas, formato) {
  const rango = XLSX.utils.decode_range(hoja["!ref"]);
  for (let c = rango.s.c; c <= rango.e.c; c++) {
    if (!columnas.includes(hoja[XLSX.utils.encode_cell({ r: 0, c })]?.v)) continue;
    for (let r = 1; r <= rango.e.r; r++) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })];
      if (celda?.t === "n") celda.z = formato;
    }
  }
}

// Agrega al final una fila "TOTAL" que suma esas columnas. Va con fórmula, así sigue sumando si se edita el Excel.
function agregarFilaTotal(hoja, columnaEtiqueta, columnasSuma) {
  const rango = XLSX.utils.decode_range(hoja["!ref"]);
  if (rango.e.r === 0) return; // sin datos, solo títulos
  const fila = rango.e.r + 1;
  const columna = {};
  for (let c = rango.s.c; c <= rango.e.c; c++) columna[hoja[XLSX.utils.encode_cell({ r: 0, c })]?.v] = c;
  hoja[XLSX.utils.encode_cell({ r: fila, c: columna[columnaEtiqueta] })] = { t: "s", v: "TOTAL" };
  columnasSuma.forEach((nombre) => {
    const c = columna[nombre];
    let suma = 0;
    let formato;
    for (let r = 1; r < fila; r++) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })];
      if (celda?.t !== "n") continue;
      suma += celda.v;
      formato = celda.z;
    }
    const letra = XLSX.utils.encode_col(c);
    hoja[XLSX.utils.encode_cell({ r: fila, c })] = { t: "n", v: suma, f: `SUM(${letra}2:${letra}${fila})`, z: formato };
  });
  rango.e.r = fila;
  hoja["!ref"] = XLSX.utils.encode_range(rango);
}

// Hoja "Resumen": el período, los totales y cuánto entró por cada medio de pago
function hojaResumen(ventas, periodo) {
  const cuenta = totalesPorPago(ventas);
  const unidades = ventas.reduce((suma, v) => suma + v.venta_items.reduce((s, i) => s + i.cantidad, 0), 0);
  const despachos = ventas.filter((v) => v.entrega === "despacho").length;
  const porcentaje = (monto) => (cuenta.total ? monto / cuenta.total : 0);
  const filas = [
    ["Informe de ventas · Isidora"],
    ["Período", periodo],
    ["Descargado el", fechaExcel(new Date())],
    [],
    ["Ventas", cuenta.ventas],
    ["Total vendido", cuenta.total],
    ["Venta promedio", cuenta.ventas ? Math.round(cuenta.total / cuenta.ventas) : 0],
    ["Unidades vendidas", unidades],
    ["Efectivo en caja", cuenta.efectivo],
    ["Despachos", despachos],
    [],
    ["Medio de pago", "Ventas", "Total", "% del total"],
    ...MEDIOS_PAGO.map((medio) => [medio, cuenta.medios[medio].ventas, cuenta.medios[medio].total, porcentaje(cuenta.medios[medio].total)]),
  ];
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  const celda = (referencia) => hoja[referencia];
  celda("B3").z = FORMATO_FECHA_EXCEL;
  ["B6", "B7", "B9"].forEach((referencia) => (celda(referencia).z = FORMATO_PESOS_EXCEL));
  // Medios de pago en las filas 13 a 17; la 18 es el total
  for (let fila = 13; fila <= 17; fila++) {
    celda(`C${fila}`).z = FORMATO_PESOS_EXCEL;
    celda(`D${fila}`).z = "0%";
  }
  hoja.A18 = { t: "s", v: "TOTAL" };
  hoja.B18 = { t: "n", v: cuenta.ventas, f: "SUM(B13:B17)" };
  hoja.C18 = { t: "n", v: cuenta.total, f: "SUM(C13:C17)", z: FORMATO_PESOS_EXCEL };
  hoja.D18 = { t: "n", v: cuenta.total ? 1 : 0, f: "SUM(D13:D17)", z: "0%" };
  hoja["!ref"] = "A1:D18";
  hoja["!cols"] = [{ wch: 22 }, { wch: 32 }, { wch: 14 }, { wch: 12 }];
  return hoja;
}

const COLUMNAS_VENTAS = [
  "N° venta", "Fecha", "Cliente", "Teléfono", "Comuna", "Medio de pago", "Pagó con", "Vuelto", "Entrega",
  "Producto", "Cantidad", "Precio unitario", "Subtotal", "Total de la venta", "Notas",
];

// Hoja "Por día": lo que entró cada día por cada medio de pago, para cuadrar la caja
function hojaPorDia(enOrden) {
  const porDia = new Map();
  enOrden.forEach((v) => {
    const dia = diaDeVenta(v.fecha);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(v);
  });
  const filas = [...porDia].map(([dia, ventas]) => {
    const cuenta = totalesPorPago(ventas);
    return {
      Día: diaExcel(dia),
      Ventas: cuenta.ventas,
      ...Object.fromEntries(MEDIOS_PAGO.map((medio) => [medio, cuenta.medios[medio].total])),
      Total: cuenta.total,
    };
  });
  const hoja = XLSX.utils.json_to_sheet(filas, { header: ["Día", "Ventas", ...MEDIOS_PAGO, "Total"] });
  darFormato(hoja, ["Día"], "dd-mm-yyyy");
  darFormato(hoja, [...MEDIOS_PAGO, "Total"], FORMATO_PESOS_EXCEL);
  agregarFilaTotal(hoja, "Día", ["Ventas", ...MEDIOS_PAGO, "Total"]);
  hoja["!cols"] = [12, 8, ...MEDIOS_PAGO.map(() => 14), 14].map((wch) => ({ wch }));
  return hoja;
}

// Hoja "Despachos": a quién, dónde y cuándo se entrega cada venta con despacho
function hojaDespachos(enOrden) {
  const filas = enOrden
    .filter((v) => v.entrega === "despacho")
    .map((v) => {
      const d = despachoDeVenta(v);
      return {
        "N° venta": v.id,
        "Fecha de venta": fechaExcel(new Date(v.fecha)),
        Recibe: d?.nombre ?? "Sin datos de entrega",
        Teléfono: d?.telefono ?? "",
        Dirección: d ? direccionDespacho(d) : "",
        Comuna: d?.comuna ?? "",
        Referencia: d?.referencia ?? "",
        "Fecha de entrega": d?.fecha_entrega ? diaExcel(d.fecha_entrega) : "",
        Estado: d ? ESTADOS_DESPACHO[d.estado]?.texto ?? "" : "",
        "Total de la venta": v.total,
      };
    });
  const columnas = ["N° venta", "Fecha de venta", "Recibe", "Teléfono", "Dirección", "Comuna", "Referencia", "Fecha de entrega", "Estado", "Total de la venta"];
  const hoja = XLSX.utils.json_to_sheet(filas, { header: columnas });
  darFormato(hoja, ["Fecha de venta"], FORMATO_FECHA_EXCEL);
  darFormato(hoja, ["Fecha de entrega"], "dd-mm-yyyy");
  darFormato(hoja, ["Total de la venta"], FORMATO_PESOS_EXCEL);
  agregarFilaTotal(hoja, "Recibe", ["Total de la venta"]);
  hoja["!cols"] = [9, 17, 22, 15, 30, 18, 28, 15, 13, 17].map((wch) => ({ wch }));
  return hoja;
}

// Hojas: "Resumen" (totales del período), "Ventas" (una fila por producto vendido),
// "Por día" (caja de cada día por medio de pago), "Despachos" (datos de entrega),
// "Stock" (inicial, compras, vendidos y disponible) y "Por producto" (totales vendidos).
// Cada hoja termina con su fila de TOTAL.
function crearLibroExcel(ventas, stock, periodo) {
  const enOrden = [...ventas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const filas = enOrden.flatMap((v) =>
    v.venta_items.map((i, numero) => {
      // Lo que es de toda la venta va solo en su primera fila, para que la suma no lo repita
      const primera = numero === 0;
      return {
        "N° venta": v.id,
        Fecha: fechaExcel(new Date(v.fecha)),
        Cliente: v.cliente_nombre ?? "",
        Teléfono: v.cliente_telefono ?? "",
        Comuna: v.comuna ?? "",
        "Medio de pago": v.medio_pago ?? "",
        "Pagó con": primera ? v.paga_con ?? "" : "",
        Vuelto: primera && v.paga_con != null ? v.paga_con - v.total : "",
        Entrega: ENTREGAS[v.entrega] ?? "",
        Producto: i.nombre_producto,
        Cantidad: i.cantidad,
        "Precio unitario": i.precio_unitario,
        Subtotal: i.subtotal,
        "Total de la venta": primera ? v.total : "",
        Notas: v.notas ?? "",
      };
    })
  );
  const hojaVentas = XLSX.utils.json_to_sheet(filas, { header: COLUMNAS_VENTAS });
  darFormato(hojaVentas, ["Fecha"], FORMATO_FECHA_EXCEL);
  darFormato(hojaVentas, ["Pagó con", "Vuelto", "Precio unitario", "Subtotal", "Total de la venta"], FORMATO_PESOS_EXCEL);
  agregarFilaTotal(hojaVentas, "Producto", ["Cantidad", "Subtotal", "Total de la venta"]);
  hojaVentas["!cols"] = [9, 17, 22, 14, 16, 15, 12, 12, 15, 34, 9, 15, 13, 17, 30].map((wch) => ({ wch }));

  // Las celdas quedan vacías en los productos que no tienen el stock cargado
  const vacioSiNulo = (numero) => (numero == null ? "" : numero);
  const filasStock = stock.map((s) => ({
    Producto: s.producto.nombre,
    Categoría: nombreCategoria(s.producto.categoria_id),
    "Stock inicial": vacioSiNulo(s.inicial),
    Compras: s.compras,
    Vendidos: s.vendidos,
    Correcciones: s.correcciones,
    "Stock disponible": vacioSiNulo(s.final),
    Precio: vacioSiNulo(s.producto.precio),
    "Valor del stock": s.final != null && s.producto.precio != null ? Math.max(0, s.final) * s.producto.precio : "",
  }));
  const hojaStock = XLSX.utils.json_to_sheet(filasStock);
  darFormato(hojaStock, ["Precio", "Valor del stock"], FORMATO_PESOS_EXCEL);
  agregarFilaTotal(hojaStock, "Producto", ["Compras", "Vendidos", "Valor del stock"]);
  hojaStock["!cols"] = [34, 16, 13, 10, 10, 13, 16, 12, 16].map((wch) => ({ wch }));

  const porProducto = resumenPorProducto(ventas).map((p) => ({
    Producto: p.nombre,
    "Unidades vendidas": p.unidades,
    "Total vendido": p.total,
  }));
  const hojaProductos = XLSX.utils.json_to_sheet(porProducto);
  darFormato(hojaProductos, ["Total vendido"], FORMATO_PESOS_EXCEL);
  agregarFilaTotal(hojaProductos, "Producto", ["Unidades vendidas", "Total vendido"]);
  hojaProductos["!cols"] = [{ wch: 34 }, { wch: 18 }, { wch: 16 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaResumen(ventas, periodo), "Resumen");
  XLSX.utils.book_append_sheet(libro, hojaVentas, "Ventas");
  XLSX.utils.book_append_sheet(libro, hojaPorDia(enOrden), "Por día");
  XLSX.utils.book_append_sheet(libro, hojaDespachos(enOrden), "Despachos");
  XLSX.utils.book_append_sheet(libro, hojaStock, "Stock");
  XLSX.utils.book_append_sheet(libro, hojaProductos, "Por producto");
  return libro;
}

// El Excel es del período que se está viendo: el mes completo o el día elegido
async function descargarExcel() {
  const boton = document.querySelector("[data-excel]");
  const contenido = boton.innerHTML;
  boton.disabled = true;
  boton.textContent = "Preparando…";
  try {
    const { desde, hasta } = rangoPeriodo();
    const [ventas, stock] = await Promise.all([obtenerVentas(desde, hasta), obtenerStock(desde, hasta), cargarLibreriaExcel()]);
    const hayStock = stock.some((s) => s.final != null || s.compras);
    if (!ventas.length && !hayStock) return avisar(`No hay ventas ni stock cargado ${textoEnPeriodo()}.`, "error");
    const archivo = periodoVentas.tipo === "dia" ? `ventas-${periodoVentas.dia}.xlsx` : `ventas-y-stock-${mesElegido}.xlsx`;
    XLSX.writeFile(crearLibroExcel(ventas, stock, tituloPeriodo()), archivo);
  } catch (error) {
    console.error(error);
    avisar("No se pudo crear el Excel. Revisa tu conexión.", "error");
  } finally {
    boton.disabled = false;
    boton.innerHTML = contenido;
  }
}

function prepararVentas() {
  const form = document.querySelector("[data-form-venta]");
  form.medio_pago.innerHTML = MEDIOS_PAGO.map((medio) => `<option>${medio}</option>`).join("");
  form.addEventListener("submit", guardarVenta);
  form.medio_pago.addEventListener("change", actualizarPagoEfectivo);
  form.paga_con.addEventListener("input", actualizarPagoEfectivo);
  form.entrega.addEventListener("change", actualizarEntrega);
  document.querySelector("[data-pagos-rapidos]").addEventListener("click", (e) => {
    const boton = e.target.closest("[data-pago-rapido]");
    if (!boton) return;
    form.paga_con.value = numeroParaCampo(Number(boton.dataset.pagoRapido));
    actualizarPagoEfectivo();
  });

  const items = document.querySelector("[data-items]");
  // Al elegir un producto se pone su precio (se puede cambiar, por ejemplo si hubo descuento)
  items.addEventListener("change", (e) => {
    const select = e.target.closest("[data-item-producto]");
    if (!select) return;
    const fila = select.closest("[data-item]");
    const producto = datos.productos.find((p) => p.id === select.value);
    const esOtro = select.value === OTRO_PRODUCTO;
    const nombre = fila.querySelector("[data-item-nombre]");
    nombre.hidden = !esOtro;
    if (esOtro) nombre.focus();
    fila.querySelector("[data-item-precio]").value = numeroParaCampo(producto?.precio);
    recalcularVenta();
  });
  items.addEventListener("input", recalcularVenta);
  items.addEventListener("click", (e) => {
    const quitar = e.target.closest("[data-quitar-item]");
    if (!quitar) return;
    quitar.closest("[data-item]").remove();
    actualizarBotonesQuitar();
    recalcularVenta();
  });

  document.querySelector("[data-agregar-item]").addEventListener("click", () => {
    agregarItem();
    recalcularVenta();
  });
  document.querySelector("[data-nueva-venta]").addEventListener("click", () => abrirRegistroVenta());
  document.querySelector("[data-excel]").addEventListener("click", descargarExcel);
  document.querySelector("[data-lista-ventas]").addEventListener("click", (e) => {
    const borrar = e.target.closest("[data-borrar-venta]");
    if (borrar) borrarVenta(Number(borrar.dataset.borrarVenta));
    const dia = e.target.closest("[data-ver-dia]");
    if (dia) verVentasDelDia(dia.dataset.verDia);
  });

  // Ver por mes o por día
  document.querySelectorAll("[data-tipo-periodo]").forEach((boton) =>
    boton.addEventListener("click", () => cambiarPeriodo(boton.dataset.tipoPeriodo))
  );
  document.querySelector("[data-dia]").addEventListener("change", (e) => {
    if (!e.target.value) return;
    periodoVentas.dia = e.target.value > fechaHoy() ? fechaHoy() : e.target.value;
    usarMes(periodoVentas.dia.slice(0, 7));
    cargarVentas();
  });
}
