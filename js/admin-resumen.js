// Pestaña Resumen: números del mes, gráfico de ventas por día y productos más vendidos.
const formatoDecimal = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const SVG = "http://www.w3.org/2000/svg";

let ultimoResumen = null; // { ventas, mes }: se guarda para redibujar el gráfico si cambia el ancho

// Números del mes
function mostrarTarjetas(ventas) {
  const total = ventas.reduce((suma, v) => suma + v.total, 0);
  const unidades = ventas.reduce((suma, v) => suma + v.venta_items.reduce((s, i) => s + i.cantidad, 0), 0);
  const promedio = ventas.length ? Math.round(total / ventas.length) : 0;
  const tarjetas = [
    ["Total vendido", formatoPeso.format(total)],
    ["Ventas", formatoNumero.format(ventas.length)],
    ["Venta promedio", formatoPeso.format(promedio)],
    ["Unidades vendidas", formatoNumero.format(unidades)],
  ];
  document.querySelector("[data-tarjetas-resumen]").innerHTML = tarjetas
    .map(([titulo, valor]) => `<div><span>${titulo}</span><strong>${valor}</strong></div>`)
    .join("");
}

// Un registro por cada día del mes, aunque ese día no haya ventas
function ventasPorDia(ventas, mes) {
  const [anio, numero] = mes.split("-").map(Number);
  const cantidadDias = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  const dias = Array.from({ length: cantidadDias }, (_, i) => ({ fecha: fechaChile(anio, numero, i + 1, 12), total: 0, ventas: 0 }));
  ventas.forEach((v) => {
    const dia = dias[partesChile(new Date(v.fecha)).dia - 1];
    if (!dia) return;
    dia.total += v.total;
    dia.ventas += 1;
  });
  return dias;
}

// Montos cortos para el gráfico: $50 mil, $1,2 M
function pesosCorto(monto) {
  if (monto >= 1_000_000) return `$${formatoDecimal.format(monto / 1_000_000)} M`;
  if (monto >= 1000) return `$${formatoDecimal.format(Math.round(monto / 100) / 10)} mil`;
  return formatoPeso.format(monto);
}

// Marcas del eje en números redondos (0, 50 mil, 100 mil…), con 5 tramos como máximo
function marcasEje(maximo) {
  const potencia = 10 ** Math.floor(Math.log10(maximo / 5));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => Math.ceil(maximo / p) <= 5);
  const tope = Math.ceil(maximo / paso) * paso;
  return Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);
}

// Columna con las puntas de arriba redondeadas (4 px) y la base recta
function rutaColumna(x, y, ancho, alto) {
  const r = Math.min(4, alto, ancho / 2);
  return `M${x},${y + alto}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + ancho - r}A${r},${r} 0 0 1 ${x + ancho},${y + r}V${y + alto}Z`;
}

function elementoSvg(nombre, atributos, texto) {
  const elemento = document.createElementNS(SVG, nombre);
  Object.entries(atributos).forEach(([clave, valor]) => elemento.setAttribute(clave, valor));
  if (texto != null) elemento.textContent = texto;
  return elemento;
}

function dibujarGrafico(dias) {
  const contenedor = document.querySelector("[data-grafico-dias]");
  contenedor.replaceChildren();
  const mejor = dias.reduce((a, b) => (b.total > a.total ? b : a));
  if (mejor.total === 0) {
    contenedor.innerHTML = `<p class="admin__vacio">Cuando registres ventas, aquí vas a ver cuánto vendiste cada día.</p>`;
    return;
  }

  const titular = document.createElement("p");
  titular.className = "grafico__titular";
  titular.textContent = `Mejor día: ${formatoDia.format(mejor.fecha)}, con ${formatoPeso.format(mejor.total)} (${textoVentas(mejor.ventas)}).`;

  const lienzo = document.createElement("div");
  lienzo.className = "grafico";
  contenedor.append(titular, lienzo);

  const ancho = Math.max(280, lienzo.clientWidth);
  const alto = 220;
  const margen = { arriba: 22, derecha: 6, abajo: 24, izquierda: 56 };
  const anchoPlot = ancho - margen.izquierda - margen.derecha;
  const altoPlot = alto - margen.arriba - margen.abajo;
  const marcas = marcasEje(mejor.total);
  const tope = marcas.at(-1);
  const y = (valor) => margen.arriba + altoPlot - (valor / tope) * altoPlot;
  const espacio = anchoPlot / dias.length;
  const anchoColumna = Math.max(2, Math.min(24, espacio - 2)); // 2 px de aire entre columnas

  const svg = elementoSvg("svg", {
    viewBox: `0 0 ${ancho} ${alto}`,
    width: ancho,
    height: alto,
    role: "group",
    "aria-label": `Ventas por día. ${titular.textContent}`,
  });

  // Líneas guía y montos del eje
  marcas.forEach((marca) => {
    svg.append(
      elementoSvg("line", { class: "grafico__grilla", x1: margen.izquierda, x2: ancho - margen.derecha, y1: y(marca), y2: y(marca) }),
      elementoSvg("text", { x: margen.izquierda - 8, y: y(marca) + 4, "text-anchor": "end" }, pesosCorto(marca))
    );
  });

  // Días del eje: 1, 5, 10, 15… y el último
  const diasEje = [1, 5, 10, 15, 20, 25, dias.length].filter((dia, i, lista) => lista.indexOf(dia) === i && (dia === 1 || dia === dias.length || dias.length - dia >= 3));
  diasEje.forEach((dia) => {
    svg.append(elementoSvg("text", { x: margen.izquierda + (dia - 0.5) * espacio, y: alto - 6, "text-anchor": "middle" }, dia));
  });

  const tooltip = document.createElement("div");
  tooltip.className = "grafico__tooltip";
  tooltip.hidden = true;
  const valorTooltip = document.createElement("strong");
  const detalleTooltip = document.createElement("span");
  tooltip.append(valorTooltip, detalleTooltip);

  const columnas = dias.map((dia, i) => {
    const x = margen.izquierda + i * espacio + (espacio - anchoColumna) / 2;
    const altoColumna = (dia.total / tope) * altoPlot;
    if (!dia.total) return null;
    const columna = elementoSvg("path", { class: "grafico__barra", d: rutaColumna(x, y(dia.total), anchoColumna, altoColumna) });
    svg.append(columna);
    return columna;
  });

  // Etiqueta solo en el mejor día (el resto se ve tocando la columna o en la tabla)
  const iMejor = dias.indexOf(mejor);
  const xMejor = margen.izquierda + (iMejor + 0.5) * espacio;
  const anclaMejor = xMejor < margen.izquierda + 30 ? "start" : xMejor > ancho - 30 ? "end" : "middle";
  svg.append(elementoSvg("text", { class: "grafico__valor", x: xMejor, y: y(mejor.total) - 6, "text-anchor": anclaMejor }, pesosCorto(mejor.total)));

  const mostrar = (i) => {
    const dia = dias[i];
    valorTooltip.textContent = formatoPeso.format(dia.total);
    detalleTooltip.textContent = `${formatoDia.format(dia.fecha)} · ${textoVentas(dia.ventas)}`;
    tooltip.hidden = false;
    const centro = margen.izquierda + (i + 0.5) * espacio;
    const mitad = tooltip.offsetWidth / 2;
    tooltip.style.left = `${Math.min(Math.max(centro, mitad), ancho - mitad)}px`;
    tooltip.style.top = `${y(dia.total)}px`;
    columnas.forEach((columna, j) => columna?.classList.toggle("activa", j === i));
  };
  const ocultar = () => {
    tooltip.hidden = true;
    columnas.forEach((columna) => columna?.classList.remove("activa"));
  };

  // Con el mouse, el dedo o el teclado se elige el día más cercano: no hace falta atinarle a la columna
  const diaEn = (evento) => {
    const caja = svg.getBoundingClientRect();
    const x = (evento.clientX - caja.left) * (ancho / caja.width);
    const i = Math.floor((x - margen.izquierda) / espacio);
    return i >= 0 && i < dias.length ? i : null;
  };
  svg.addEventListener("pointerdown", (e) => {
    const i = diaEn(e);
    if (i != null) mostrar(i);
  });
  svg.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" && !e.buttons) return;
    const i = diaEn(e);
    if (i == null) ocultar();
    else mostrar(i);
  });
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") ocultar();
  });

  // Una zona por día con ventas, para recorrerlas con Tab y para lectores de pantalla
  dias.forEach((dia, i) => {
    if (!dia.total) return;
    const zona = elementoSvg("rect", {
      class: "grafico__toque",
      x: margen.izquierda + i * espacio,
      y: margen.arriba,
      width: espacio,
      height: altoPlot,
      tabindex: 0,
      "aria-label": `${formatoDia.format(dia.fecha)}: ${formatoPeso.format(dia.total)}, ${textoVentas(dia.ventas)}`,
    });
    zona.addEventListener("focus", () => mostrar(i));
    zona.addEventListener("blur", ocultar);
    svg.append(zona);
  });

  lienzo.append(svg, tooltip);

  // La misma información en tabla, para quien no quiera tocar columna por columna
  const filas = dias
    .filter((dia) => dia.total)
    .map((dia) => `<tr><td>${formatoDia.format(dia.fecha)}</td><td class="num">${dia.ventas}</td><td class="num">${formatoPeso.format(dia.total)}</td></tr>`)
    .join("");
  contenedor.insertAdjacentHTML(
    "beforeend",
    `<details class="grafico__tabla">
      <summary>Ver como tabla</summary>
      <table class="admin__tabla">
        <thead><tr><th>Día</th><th class="num">Ventas</th><th class="num">Total</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </details>`
  );
}

function mostrarProductosTop(ventas) {
  const lista = resumenPorProducto(ventas).slice(0, 10);
  document.querySelector("[data-top-productos]").innerHTML = lista.length
    ? `<table class="admin__tabla">
        <thead><tr><th>Producto</th><th class="num">Unidades</th><th class="num">Total</th></tr></thead>
        <tbody>${lista
          .map((p) => `<tr><td>${esc(p.nombre)}</td><td class="num">${formatoNumero.format(p.unidades)}</td><td class="num">${formatoPeso.format(p.total)}</td></tr>`)
          .join("")}</tbody>
      </table>`
    : `<p class="admin__vacio">Todavía no hay ventas en ${nombreMes(mesElegido)}.</p>`;
}

// Productos que se están acabando (con el stock de hoy)
function mostrarStockBajo() {
  const contenedor = document.querySelector("[data-stock-bajo]");
  const conStock = datos.productos.filter((p) => p.stock != null);
  const bajos = conStock
    .filter((p) => p.disponibilidad === "agotado" || p.disponibilidad === "pocas")
    .sort((a, b) => a.stock - b.stock);
  if (!conStock.length) {
    contenedor.innerHTML = `<p class="admin__vacio">Cuando cargues el stock de los productos, aquí vas a ver los que se están acabando.</p>`;
    return;
  }
  if (!bajos.length) {
    contenedor.innerHTML = `<p class="admin__vacio">Ningún producto tiene stock bajo.</p>`;
    return;
  }
  contenedor.innerHTML = `<table class="admin__tabla">
      <thead><tr><th>Producto</th><th class="num">Quedan</th><th class="num">Aviso</th></tr></thead>
      <tbody>${bajos
        .map((p) => {
          const estado = ESTADOS[p.disponibilidad];
          return `<tr><td>${esc(p.nombre)} <span class="${estado.clase}">${estado.texto}</span></td><td class="num">${p.stock}</td><td class="num">${p.stock_minimo}</td></tr>`;
        })
        .join("")}</tbody>
    </table>`;
}

// Las últimas cotizaciones pendientes (al tocarlas se abre la sección Cotizaciones)
function mostrarPendientesInicio(pendientes) {
  const contenedor = document.querySelector("[data-pendientes-inicio]");
  if (!pendientes.length) {
    contenedor.innerHTML = `<p class="admin__vacio">No hay cotizaciones pendientes.</p>`;
    return;
  }
  contenedor.innerHTML = `<div class="pendientes">${pendientes
    .map((c) => {
      const productos = c.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(", ");
      const total = c.total ? formatoPeso.format(c.total) : "A consultar";
      return `
        <button type="button" class="pendiente" data-ir-pestana="cotizaciones">
          <span>
            <strong>${esc(c.cliente_nombre || c.referencia || "Sin nombre")}</strong>
            <small>${esc(productos)}</small>
          </span>
          <b>${total}</b>
        </button>`;
    })
    .join("")}</div>`;
}

// Caja del día: el efectivo destacado, el total, el desglose por medio de pago y las últimas ventas
const VENTAS_HOY_VISIBLES = 5;

function filaMedioPago(medio, datosMedio, totalDia) {
  const porcentaje = totalDia ? Math.round((datosMedio.total / totalDia) * 100) : 0;
  const clase = datosMedio.ventas ? "" : " medio--vacio";
  return `
    <li class="medio${clase}" title="${porcentaje}% de lo vendido hoy">
      <span class="medio__nombre"><svg class="icono" aria-hidden="true"><use href="#${ICONOS_PAGO[medio]}"></use></svg>${medio}</span>
      <span class="medio__barra" aria-hidden="true"><i style="width: ${porcentaje}%"></i></span>
      <span class="medio__valor"><strong>${formatoPeso.format(datosMedio.total)}</strong><small>${textoVentas(datosMedio.ventas)}</small></span>
    </li>`;
}

function filaVentaHoy(v) {
  const productos = v.venta_items.map((i) => `${i.cantidad} × ${i.nombre_producto}`).join(", ");
  const vuelto = textoVuelto(v);
  return `
    <li class="hoy-venta">
      <time>${formatoHora.format(new Date(v.fecha))}</time>
      <span class="hoy-venta__detalle">
        <strong>${esc(v.cliente_nombre || productos)}</strong>
        <small>${esc(v.cliente_nombre ? productos : vuelto || `Venta #${v.id}`)}</small>
      </span>
      ${etiquetaPago(v.medio_pago)}
      <b>${formatoPeso.format(v.total)}</b>
    </li>`;
}

function mostrarHoy(ventasHoy) {
  const cuenta = totalesPorPago(ventasHoy);
  const enEfectivo = cuenta.medios.Efectivo.ventas;
  const promedio = cuenta.ventas ? Math.round(cuenta.total / cuenta.ventas) : 0;
  const ocultas = ventasHoy.length - VENTAS_HOY_VISIBLES;
  document.querySelector("[data-hoy-fecha]").textContent = formatoDia.format(new Date());
  document.querySelector("[data-hoy]").innerHTML = `
    <div class="hoy__grilla">
      <div class="hoy__cifra hoy__cifra--efectivo">
        <span><svg class="icono" aria-hidden="true"><use href="#i-efectivo"></use></svg>Efectivo en caja</span>
        <strong>${formatoPeso.format(cuenta.efectivo)}</strong>
        <small>${enEfectivo ? `${textoVentas(enEfectivo)} en efectivo` : "Sin ventas en efectivo"}</small>
      </div>
      <div class="hoy__cifra">
        <span>Total vendido hoy</span>
        <strong>${formatoPeso.format(cuenta.total)}</strong>
        <small>${cuenta.ventas ? `${textoVentas(cuenta.ventas)} · promedio ${formatoPeso.format(promedio)}` : "Todavía no hay ventas"}</small>
      </div>
      <div class="hoy__medios">
        <h3>Por medio de pago</h3>
        <ul>${MEDIOS_PAGO.map((medio) => filaMedioPago(medio, cuenta.medios[medio], cuenta.total)).join("")}</ul>
      </div>
    </div>
    ${cuenta.ventas
      ? `<ul class="hoy__lista">${ventasHoy.slice(0, VENTAS_HOY_VISIBLES).map(filaVentaHoy).join("")}</ul>
         ${ocultas > 0 ? `<button type="button" class="enlace-flecha hoy__mas" data-ver-ventas-hoy>Ver ${ocultas} ${ocultas === 1 ? "venta más" : "ventas más"} <svg class="icono"><use href="#i-flecha"></use></svg></button>` : ""}`
      : `<p class="hoy__vacio">Cuando registres una venta hoy, aparece aquí con su medio de pago.</p>`}`;
}

// Despachos por entregar: primero los que tienen fecha más cercana, después los sin fecha
function tarjetaDespacho(d) {
  const venta = d.ventas;
  const productos = (venta?.venta_items ?? []).map((i) => `${i.cantidad} × ${i.nombre_producto}`).join(", ");
  const cuando = d.fecha_entrega ? `Entrega: ${nombreDia(d.fecha_entrega)}` : "Sin fecha de entrega";
  return `
    <article class="despacho">
      <div class="despacho__info">
        <div class="despacho__cabeza">
          <strong>${esc(d.nombre)}</strong>
          <span class="despacho__cuando${d.fecha_entrega && d.fecha_entrega < fechaHoy() ? " despacho__cuando--atrasado" : ""}">${esc(cuando)}</span>
        </div>
        <p>${esc(direccionDespacho(d))}${d.comuna ? ` · ${esc(d.comuna)}` : ""}</p>
        ${d.referencia ? `<p class="entrega__ref">${esc(d.referencia)}</p>` : ""}
        <small>Venta #${d.venta_id}${venta ? ` · ${formatoPeso.format(venta.total)}` : ""}${productos ? ` · ${esc(productos)}` : ""}</small>
      </div>
      ${accionesDespacho(d.venta_id, d)}
    </article>`;
}

function mostrarDespachosPendientes(despachos) {
  const contador = document.querySelector("[data-contador-despachos]");
  contador.hidden = !despachos.length;
  contador.textContent = despachos.length;
  document.querySelector("[data-despachos-pendientes]").innerHTML = despachos.length
    ? `<div class="despachos">${despachos.map(tarjetaDespacho).join("")}</div>`
    : `<p class="admin__vacio">No hay despachos pendientes.</p>`;
}

function mostrarResumen() {
  if (!ultimoResumen) return;
  const { ventas, mes, pendientes, hoy, despachos } = ultimoResumen;
  mostrarHoy(hoy);
  mostrarDespachosPendientes(despachos);
  document.querySelector("[data-nombre-mes]").textContent = nombreMes(mes);
  mostrarTarjetas(ventas);
  dibujarGrafico(ventasPorDia(ventas, mes));
  mostrarPendientesInicio(pendientes);
  mostrarProductosTop(ventas);
  mostrarStockBajo();
}

async function cargarResumen() {
  // Mientras carga se deja lo anterior más claro, sin que la página salte
  const panel = document.querySelector('[data-panel="resumen"]');
  panel.classList.add("admin__recargando");
  try {
    const { desde, hasta } = rangoHoy();
    const [ventas, pendientes, hoy, despachos] = await Promise.all([
      obtenerVentasMes(mesElegido),
      db.from("cotizaciones").select("id, referencia, cliente_nombre, total, items").eq("estado", "pendiente").order("fecha", { ascending: false }).limit(4),
      obtenerVentas(desde, hasta),
      db
        .from("despachos")
        .select("*, ventas(total, venta_items(nombre_producto, cantidad))")
        .eq("estado", "pendiente")
        .order("fecha_entrega", { ascending: true, nullsFirst: false })
        .order("creado_en", { ascending: true })
        .limit(30),
    ]);
    if (pendientes.error) console.error(pendientes.error);
    if (despachos.error) console.error(despachos.error);
    ultimoResumen = { ventas, mes: mesElegido, pendientes: pendientes.data ?? [], hoy, despachos: despachos.data ?? [] };
    mostrarResumen();
  } catch (error) {
    console.error(error);
    avisar("No se pudo cargar el resumen. Revisa tu conexión.", "error");
  } finally {
    panel.classList.remove("admin__recargando");
  }
}

function prepararResumen() {
  // Si cambia el ancho (por ejemplo, al girar el celular) se vuelve a dibujar el gráfico
  let espera;
  window.addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      if (!document.querySelector('[data-panel="resumen"]').hidden) mostrarResumen();
    }, 150);
  });
  // Tocar fuera del gráfico cierra el recuadro con el detalle
  document.addEventListener("click", (e) => {
    if (e.target.closest(".grafico")) return;
    document.querySelectorAll(".grafico__tooltip").forEach((tooltip) => {
      tooltip.hidden = true;
    });
    document.querySelectorAll(".grafico__barra.activa").forEach((columna) => columna.classList.remove("activa"));
  });
}
