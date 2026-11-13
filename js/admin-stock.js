// Registro de stock por día (dentro de Productos): con cuánto abrió y cerró cada producto,
// lo que entró (llegó mercadería), lo que salió (ventas) y las correcciones, con la hora de cada movimiento.
// Se calcula hacia atrás desde el stock de hoy, igual que la hoja Stock del Excel (obtenerStock en admin-comun).
const TIPOS_MOVIMIENTO = {
  venta: { texto: "Venta", clase: "movimiento__tipo--venta" },
  compra: { texto: "Llegó mercadería", clase: "movimiento__tipo--compra" },
  ajuste: { texto: "Corrección", clase: "movimiento__tipo--ajuste" },
};

let diaStock = "";
let registroStock = [];

// +3 o −3; el cero va como guion para que se lean solo los cambios
function conSigno(numero) {
  if (!numero) return "—";
  return numero > 0 ? `+${formatoNumero.format(numero)}` : `−${formatoNumero.format(-numero)}`;
}

// Productos que van en la tabla: los que llevan stock, y los que no lo llevan pero se movieron ese día
function filasRegistro() {
  return registroStock.filter((s) => s.final != null || s.movimientos.length);
}

function mostrarCifrasStock() {
  const entradas = registroStock.reduce((suma, s) => suma + s.compras, 0);
  const salidas = registroStock.reduce((suma, s) => suma + s.vendidos, 0);
  const correcciones = registroStock.reduce((suma, s) => suma + s.correcciones, 0);
  const movimientos = registroStock.reduce((suma, s) => suma + s.movimientos.length, 0);
  const cifras = [
    ["Entraron", entradas ? `+${formatoNumero.format(entradas)}` : "0", "unidades que llegaron", "cifra-stock--entrada"],
    ["Salieron", salidas ? `−${formatoNumero.format(salidas)}` : "0", "unidades vendidas", "cifra-stock--salida"],
    ["Correcciones", correcciones ? conSigno(correcciones) : "0", "ajustes a mano", ""],
    ["Movimientos", formatoNumero.format(movimientos), movimientos === 1 ? "registro" : "registros", ""],
  ];
  document.querySelector("[data-cifras-stock]").innerHTML = cifras
    .map(([titulo, valor, detalle, clase]) => `<div class="${clase}"><span>${titulo}</span><strong>${valor}</strong><small>${detalle}</small></div>`)
    .join("");
}

function mostrarTablaStock() {
  const filas = filasRegistro();
  const contenedor = document.querySelector("[data-tabla-stock]");
  if (!filas.length) {
    contenedor.innerHTML = `<p class="admin__vacio">Ningún producto lleva el stock todavía. Cárgalo en Catálogo → editar producto → Stock.</p>`;
    return;
  }
  const celda = (etiqueta, contenido, clase = "") => `<span class="stock-dia__num ${clase}" data-etiqueta="${etiqueta}">${contenido}</span>`;
  contenedor.innerHTML = `
    <div class="stock-dia">
      <div class="stock-dia__cabeza" aria-hidden="true">
        <span>Producto</span><span>Abrió con</span><span>Entró</span><span>Salió</span><span>Corrección</span><span>Cerró con</span>
      </div>
      ${filas
        .map((s) => {
          const lleva = s.final != null;
          const disponibilidad = disponibilidadStock(s.final, s.producto.stock_minimo);
          const estado = ESTADOS[disponibilidad];
          const cierre = lleva
            ? `<b>${formatoNumero.format(s.final)}</b>${estado.texto !== "Disponible" ? ` <span class="${estado.clase}">${estado.texto}</span>` : ""}`
            : "—";
          return `
            <div class="stock-dia__fila${s.movimientos.length ? " stock-dia__fila--movida" : ""}">
              <span class="stock-dia__producto">
                <strong>${esc(s.producto.nombre)}</strong>
                <small>${esc(nombreCategoria(s.producto.categoria_id))}${lleva ? "" : " · no lleva stock"}</small>
              </span>
              ${celda("Abrió con", lleva ? formatoNumero.format(s.inicial) : "—")}
              ${celda("Entró", conSigno(s.compras), s.compras ? "stock-dia__num--entrada" : "")}
              ${celda("Salió", conSigno(-s.vendidos), s.vendidos ? "stock-dia__num--salida" : "")}
              ${celda("Corrección", conSigno(s.correcciones))}
              ${celda("Cerró con", cierre, `stock-dia__num--cierre stock-dia__num--${disponibilidad}`)}
            </div>`;
        })
        .join("")}
    </div>`;
}

function mostrarMovimientosStock() {
  // Todos los movimientos del día, del más nuevo al más antiguo
  const movimientos = registroStock
    .flatMap((s) => s.movimientos.map((m) => ({ ...m, producto: s.producto })))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const contenedor = document.querySelector("[data-movimientos-stock]");
  if (!movimientos.length) {
    contenedor.innerHTML = `<p class="admin__vacio">Este día no entró ni salió nada.</p>`;
    return;
  }
  contenedor.innerHTML = `<ul class="movimientos">${movimientos
    .map((m) => {
      const tipo = TIPOS_MOVIMIENTO[m.tipo];
      const detalle = m.tipo === "venta" ? `Venta #${m.venta}` : m.nota || "";
      return `
        <li class="movimiento">
          <time>${formatoHora.format(new Date(m.fecha))}</time>
          <span class="movimiento__detalle">
            <strong>${esc(m.producto.nombre)}</strong>
            <small><span class="movimiento__tipo ${tipo.clase}">${tipo.texto}</span>${detalle ? ` ${esc(detalle)}` : ""}</small>
          </span>
          <span class="movimiento__cantidad${m.cantidad > 0 ? " movimiento__cantidad--entrada" : " movimiento__cantidad--salida"}">${conSigno(m.cantidad)}</span>
          <span class="movimiento__queda">${m.queda == null ? "" : `Quedan ${formatoNumero.format(m.queda)}`}</span>
        </li>`;
    })
    .join("")}</ul>`;
}

function mostrarDiaStock() {
  const campo = document.querySelector("[data-dia-stock]");
  campo.value = diaStock;
  campo.max = fechaHoy();
  document.querySelector('[data-mover-dia-stock="1"]').disabled = diaStock >= fechaHoy();
  const [anio, mes, dia] = diaStock.split("-").map(Number);
  const nombre = nombreDia(diaStock);
  document.querySelector("[data-nombre-dia-stock]").textContent =
    nombre === "Hoy" || nombre === "Ayer" ? `${nombre}, ${formatoDia.format(fechaChile(anio, mes, dia, 12))}` : nombre;
}

async function cargarRegistroStock() {
  if (!diaStock) diaStock = fechaHoy();
  mostrarDiaStock();
  const subvista = document.querySelector('[data-subvista="stock"]');
  subvista.classList.add("admin__recargando");
  try {
    const { desde, hasta } = rangoDia(diaStock);
    registroStock = await obtenerStock(desde, hasta);
    mostrarCifrasStock();
    mostrarTablaStock();
    mostrarMovimientosStock();
  } catch (error) {
    console.error(error);
    document.querySelector("[data-tabla-stock]").innerHTML = `<p class="admin__vacio">No se pudo cargar el registro. Revisa tu conexión.</p>`;
  } finally {
    subvista.classList.remove("admin__recargando");
  }
}

// Mueve el día de a uno con las flechas (nunca pasa de hoy)
function moverDiaStock(dias) {
  const [anio, mes, dia] = diaStock.split("-").map(Number);
  const nuevo = diaDeVenta(fechaChile(anio, mes, dia + dias, 12));
  if (nuevo > fechaHoy()) return;
  diaStock = nuevo;
  cargarRegistroStock();
}

// Excel del día: el stock de cada producto y todos los movimientos
async function descargarExcelStock() {
  const boton = document.querySelector("[data-excel-stock]");
  const contenido = boton.innerHTML;
  boton.disabled = true;
  boton.textContent = "Preparando…";
  try {
    await cargarLibreriaExcel();
    const filas = filasRegistro().map((s) => ({
      Producto: s.producto.nombre,
      Categoría: nombreCategoria(s.producto.categoria_id),
      "Abrió con": s.inicial ?? "",
      Entró: s.compras,
      Salió: s.vendidos,
      Corrección: s.correcciones,
      "Cerró con": s.final ?? "",
      Precio: s.producto.precio ?? "",
      "Valor al cierre": s.final != null && s.producto.precio != null ? Math.max(0, s.final) * s.producto.precio : "",
    }));
    const hojaStock = XLSX.utils.json_to_sheet(filas, {
      header: ["Producto", "Categoría", "Abrió con", "Entró", "Salió", "Corrección", "Cerró con", "Precio", "Valor al cierre"],
    });
    darFormato(hojaStock, ["Precio", "Valor al cierre"], FORMATO_PESOS_EXCEL);
    agregarFilaTotal(hojaStock, "Producto", ["Entró", "Salió", "Corrección", "Valor al cierre"]);
    hojaStock["!cols"] = [34, 18, 11, 9, 9, 12, 11, 12, 16].map((wch) => ({ wch }));

    const movimientos = registroStock
      .flatMap((s) => s.movimientos.map((m) => ({ ...m, producto: s.producto })))
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
      .map((m) => ({
        Hora: fechaExcel(new Date(m.fecha)),
        Producto: m.producto.nombre,
        Movimiento: TIPOS_MOVIMIENTO[m.tipo].texto,
        Cantidad: m.cantidad,
        Quedan: m.queda ?? "",
        Detalle: m.tipo === "venta" ? `Venta #${m.venta}` : m.nota ?? "",
      }));
    const hojaMovimientos = XLSX.utils.json_to_sheet(movimientos, { header: ["Hora", "Producto", "Movimiento", "Cantidad", "Quedan", "Detalle"] });
    darFormato(hojaMovimientos, ["Hora"], FORMATO_FECHA_EXCEL);
    hojaMovimientos["!cols"] = [17, 34, 18, 10, 9, 30].map((wch) => ({ wch }));

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hojaStock, "Stock del día");
    XLSX.utils.book_append_sheet(libro, hojaMovimientos, "Movimientos");
    XLSX.writeFile(libro, `stock-${diaStock}.xlsx`);
  } catch (error) {
    console.error(error);
    avisar("No se pudo crear el Excel. Revisa tu conexión.", "error");
  } finally {
    boton.disabled = false;
    boton.innerHTML = contenido;
  }
}

// Catálogo o Registro de stock, dentro de la pestaña Productos
function abrirSubvista(nombre) {
  document.querySelectorAll("[data-subvista-boton]").forEach((boton) => {
    boton.setAttribute("aria-selected", boton.dataset.subvistaBoton === nombre);
  });
  document.querySelectorAll("[data-subvista]").forEach((subvista) => {
    subvista.hidden = subvista.dataset.subvista !== nombre;
  });
  if (nombre === "stock") cargarRegistroStock();
}

function prepararRegistroStock() {
  document.querySelectorAll("[data-subvista-boton]").forEach((boton) =>
    boton.addEventListener("click", () => abrirSubvista(boton.dataset.subvistaBoton))
  );
  document.querySelectorAll("[data-mover-dia-stock]").forEach((boton) =>
    boton.addEventListener("click", () => moverDiaStock(Number(boton.dataset.moverDiaStock)))
  );
  document.querySelector("[data-dia-stock]").addEventListener("change", (e) => {
    if (!e.target.value) return;
    diaStock = e.target.value > fechaHoy() ? fechaHoy() : e.target.value;
    cargarRegistroStock();
  });
  document.querySelector("[data-excel-stock]").addEventListener("click", descargarExcelStock);
}
