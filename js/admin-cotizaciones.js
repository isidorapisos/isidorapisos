// Pestaña Cotizaciones: lo que la gente cotiza desde la página (lista, ficha de producto o calculadora).
// La referencia (por ejemplo C-7SWJ8) es la misma que le llega al negocio en el WhatsApp o el correo.
const ESTADOS_COTIZACION = {
  pendiente: "Pendiente",
  enviada: "Respondida",
  aceptada: "Compró",
  rechazada: "No compró",
};

let cotizaciones = [];

function tarjetaCotizacion(c) {
  const productos = c.items
    .map((i) => {
      const monto = i.precio_unitario == null ? "A consultar" : formatoPeso.format(i.cantidad * i.precio_unitario);
      return `<li><span>${i.cantidad} × ${esc(i.nombre)}</span><span>${monto}</span></li>`;
    })
    .join("");
  const sinPrecio = c.items.some((i) => i.precio_unitario == null);
  const total = c.total === 0 && sinPrecio ? "A consultar" : `${formatoPeso.format(c.total)}${sinPrecio ? " + a consultar" : ""}`;
  const cliente =
    [c.cliente_nombre, c.cliente_telefono, c.comuna].filter(Boolean).map(esc).join(" · ") ||
    "Sin datos: cotizó un producto directo por WhatsApp o correo, búscalo por la referencia.";
  const whatsapp = telefonoWhatsapp(c.cliente_telefono);
  const saludo = `Hola${c.cliente_nombre ? ` ${c.cliente_nombre}` : ""}, te escribo por tu cotización ${c.referencia ?? ""}.`;
  const estados = Object.entries(ESTADOS_COTIZACION)
    .map(([valor, texto]) => `<option value="${valor}"${valor === c.estado ? " selected" : ""}>${texto}</option>`)
    .join("");
  return `
    <article class="admin-venta admin-cotizacion">
      <header>
        <span>${[c.referencia, formatoFecha.format(new Date(c.fecha))].filter(Boolean).map(esc).join(" · ")}</span>
        <select data-estado-cotizacion="${c.id}" aria-label="Estado de la cotización">${estados}</select>
      </header>
      <p class="admin-venta__cliente">${cliente}</p>
      <ul>${productos}</ul>
      <p class="admin-venta__total"><span>Total estimado</span><strong>${total}</strong></p>
      <div class="admin-cotizacion__acciones">
        ${whatsapp ? `<a class="boton boton--chico" href="https://wa.me/${whatsapp}?text=${encodeURIComponent(saludo)}" target="_blank" rel="noopener">Responder por WhatsApp</a>` : ""}
        <button type="button" class="boton boton--chico boton--borde" data-venta-desde="${c.id}">Pasar a venta</button>
        <button type="button" class="admin-venta__borrar" data-borrar-cotizacion="${c.id}">Eliminar</button>
      </div>
    </article>`;
}

function mostrarCotizaciones() {
  const filtro = document.querySelector("[data-filtro-cotizaciones]").value;
  const visibles = filtro === "todas" ? cotizaciones : cotizaciones.filter((c) => c.estado === filtro);
  document.querySelector("[data-lista-cotizaciones]").innerHTML = visibles.length
    ? visibles.map(tarjetaCotizacion).join("")
    : `<p class="admin__vacio">${filtro === "pendiente" ? "No hay cotizaciones pendientes. Las que manden desde la página van a aparecer aquí." : "No hay cotizaciones con este filtro."}</p>`;
}

async function cargarCotizaciones() {
  const lista = document.querySelector("[data-lista-cotizaciones]");
  lista.innerHTML = `<p class="admin__vacio">Cargando cotizaciones…</p>`;
  const filtro = document.querySelector("[data-filtro-cotizaciones]").value;
  let consulta = db.from("cotizaciones").select("*").order("fecha", { ascending: false }).limit(100);
  if (filtro !== "todas") consulta = consulta.eq("estado", filtro);
  const { data, error } = await consulta;
  if (error) {
    console.error(error);
    lista.innerHTML = `<p class="admin__vacio">No se pudieron cargar las cotizaciones. Revisa tu conexión.</p>`;
    return;
  }
  cotizaciones = data;
  mostrarCotizaciones();
  contarPendientes();
}

// Número de cotizaciones pendientes, en la pestaña
async function contarPendientes() {
  const { count, error } = await db.from("cotizaciones").select("id", { count: "exact", head: true }).eq("estado", "pendiente");
  const contador = document.querySelector("[data-contador-cotizaciones]");
  contador.textContent = count ?? "";
  contador.hidden = Boolean(error) || !count;
}

async function cambiarEstado(id, estado) {
  const { error } = await db.from("cotizaciones").update({ estado }).eq("id", id);
  if (error) {
    console.error(error);
    avisar("No se pudo cambiar el estado.", "error");
    return cargarCotizaciones();
  }
  const cotizacion = cotizaciones.find((c) => c.id === id);
  if (cotizacion) cotizacion.estado = estado;
  avisar(`Marcada como "${ESTADOS_COTIZACION[estado]}"`);
  mostrarCotizaciones();
  contarPendientes();
}

async function borrarCotizacion(id) {
  const cotizacion = cotizaciones.find((c) => c.id === id);
  const confirma = await confirmar(`¿Eliminar la cotización ${cotizacion?.referencia ?? `#${id}`}?`);
  if (!confirma) return;
  const { data, error } = await db.from("cotizaciones").delete().eq("id", id).select("id");
  if (error || !data.length) {
    console.error(error);
    return avisar("No se pudo eliminar la cotización.", "error");
  }
  cotizaciones = cotizaciones.filter((c) => c.id !== id);
  avisar("Cotización eliminada");
  mostrarCotizaciones();
  contarPendientes();
}

function prepararCotizaciones() {
  document.querySelector("[data-filtro-cotizaciones]").addEventListener("change", cargarCotizaciones);
  const lista = document.querySelector("[data-lista-cotizaciones]");
  lista.addEventListener("change", (e) => {
    const estado = e.target.closest("[data-estado-cotizacion]");
    if (estado) cambiarEstado(Number(estado.dataset.estadoCotizacion), estado.value);
  });
  lista.addEventListener("click", (e) => {
    const venta = e.target.closest("[data-venta-desde]");
    if (venta) {
      // Abre "Registrar venta" con los productos y los datos del cliente ya puestos
      const cotizacion = cotizaciones.find((c) => c.id === Number(venta.dataset.ventaDesde));
      if (cotizacion) abrirRegistroVenta(cotizacion);
    }
    const borrar = e.target.closest("[data-borrar-cotizacion]");
    if (borrar) borrarCotizacion(Number(borrar.dataset.borrarCotizacion));
  });
}
