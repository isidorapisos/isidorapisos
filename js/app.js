const formatoPeso = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const EXTRA_CORTES = 1.1;

function linkWhatsapp(mensaje) {
  return `https://wa.me/${NEGOCIO.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}

function linkCorreo(asunto, mensaje) {
  return `mailto:${NEGOCIO.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;
}

function nombreCategoria(id) {
  return CATEGORIAS.find((c) => c.id === id)?.nombre ?? "";
}

function textoPrecio(producto) {
  if (producto.precio == null) return "Consultar precio";
  // En oferta se muestra el precio anterior tachado (se carga en el panel)
  const antes = producto.oferta && producto.precioAnterior > producto.precio
    ? `<s class="precio-tachado">${formatoPeso.format(producto.precioAnterior)}</s> `
    : "";
  return `${antes}${formatoPeso.format(producto.precio)} <small>/ ${producto.unidad}</small>`;
}

// Datos del negocio en la página
function cargarDatosNegocio() {
  const mensajeGeneral = "Hola, vengo de la página web y quiero cotizar.";
  document.querySelectorAll("[data-whatsapp]").forEach((a) => {
    a.href = linkWhatsapp(mensajeGeneral);
    a.target = "_blank";
    a.rel = "noopener";
  });
  document.querySelectorAll("[data-instagram]").forEach((a) => {
    a.href = `https://www.instagram.com/${NEGOCIO.instagram}/`;
  });
  document.querySelectorAll("[data-facebook]").forEach((a) => {
    if (NEGOCIO.facebook) a.href = NEGOCIO.facebook;
    else a.hidden = true;
  });
  document.querySelector(".contacto__direccion").textContent = `${NEGOCIO.direccion} (${NEGOCIO.referencia})`;
  document.querySelector(".contacto__horario").innerHTML = NEGOCIO.horario
    .map((h) => `<p><strong>${h.dias}:</strong> ${h.horas}</p>`)
    .join("");
  document.querySelector(".contacto__despacho").textContent = NEGOCIO.despacho;
  const telefono = document.querySelector("[data-telefono]");
  telefono.href = `tel:+${NEGOCIO.whatsapp}`;
  telefono.textContent = NEGOCIO.telefonoVisible;
  const correo = document.querySelector("[data-correo]");
  correo.href = `mailto:${NEGOCIO.correo}`;
  correo.textContent = NEGOCIO.correo;
  document.querySelector("[data-boton-correo]").href = linkCorreo(
    "Consulta desde la página web",
    `Hola,\n\nQuiero hacer una consulta sobre:\n\n\nMi nombre:\nMi teléfono:\nComuna:\n`
  );
  document.querySelectorAll("[data-como-llegar]").forEach((a) => {
    a.href = NEGOCIO.comoLlegar;
  });
  cargarMapa();
  document.querySelector("[data-anio]").textContent = new Date().getFullYear();
}

// El link de vista previa de Claude bloquea mapas externos: ahí se muestra una tarjeta que abre Google Maps.
// En el hosting real se carga el mapa interactivo.
function cargarMapa() {
  const mapa = document.querySelector(".contacto__mapa iframe");
  const respaldo = document.querySelector(".mapa-respaldo");
  if (/claude/i.test(location.hostname)) {
    mapa.remove();
    respaldo.hidden = false;
    return;
  }
  mapa.src = NEGOCIO.mapa;
}

// Base de datos: catálogo y cotizaciones. keepalive hace que la cotización se termine de guardar
// aunque el celular se vaya a WhatsApp justo después de tocar el botón.
const db = window.supabase
  ? supabase.createClient(SUPABASE.url, SUPABASE.clave, {
      global: { fetch: (url, opciones) => fetch(url, { ...opciones, keepalive: true }) },
    })
  : null;

// Catálogo desde Supabase. Si la base no responde, se queda con la lista de respaldo de productos.js
const COLUMNAS_PUBLICAS =
  "id, categoria_id, nombre, textura, precio, precio_anterior, unidad, m2, imagen, ambiente, detalles, destacado, oferta, disponibilidad, orden, codigo_color";

function desdeBase(p) {
  return {
    id: p.id,
    categoria: p.categoria_id,
    nombre: p.nombre,
    textura: p.textura,
    precio: p.precio,
    precioAnterior: p.precio_anterior,
    unidad: p.unidad,
    m2: p.m2 == null ? null : Number(p.m2),
    imagen: p.imagen,
    ambiente: p.ambiente,
    detalles: p.detalles ?? [],
    destacado: p.destacado,
    oferta: p.oferta,
    disponibilidad: p.disponibilidad,
    codigoColor: p.codigo_color,
  };
}

// Código de color (se carga en el panel) y una muestra redonda recortada de la foto del producto
function muestraColor(p) {
  if (!p.imagen && !p.codigoColor) return "";
  const punto = p.imagen ? `<span class="muestra-color__punto" style="background-image: url('${p.imagen}')"></span>` : "";
  const codigo = p.codigoColor ? `<span>Cód. ${p.codigoColor}</span>` : "";
  return `<span class="muestra-color">${punto}${codigo}</span>`;
}

async function cargarCatalogo() {
  if (!db) return;
  try {
    const [categorias, productos] = await Promise.all([
      db.from("categorias").select("id, nombre, descripcion").order("orden"),
      // Solo los visibles: si el dueño tiene la sesión del panel abierta, igual no ve los ocultos aquí
      db.from("productos").select(COLUMNAS_PUBLICAS).eq("activo", true).order("orden"),
    ]);
    if (categorias.error || productos.error || !productos.data.length) throw categorias.error ?? productos.error;
    // Por categoría y después por "orden": así un producto nuevo del panel queda junto a los de su tipo
    const posicion = (p) => categorias.data.findIndex((c) => c.id === p.categoria_id);
    productos.data.sort((a, b) => posicion(a) - posicion(b) || a.orden - b.orden);
    CATEGORIAS.splice(0, CATEGORIAS.length, ...categorias.data);
    PRODUCTOS.splice(0, PRODUCTOS.length, ...productos.data.map(desdeBase));
  } catch (error) {
    console.warn("No se pudo cargar el catálogo desde la base de datos, se usa el de respaldo.", error);
  }
}

// Cotizaciones: todo lo que se cotiza desde la página queda guardado en el panel (pestaña Cotizaciones).
// La referencia va en el mensaje de WhatsApp o correo, para encontrar la cotización en el panel.
const cotizacionesGuardadas = new Set();

function nuevaReferencia() {
  return `C-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// La base revisa los productos y pone los precios reales: aquí solo se mandan el id y la cantidad
function guardarCotizacion(referencia, items, cliente = {}) {
  if (!db || cotizacionesGuardadas.has(referencia)) return;
  cotizacionesGuardadas.add(referencia);
  db.from("cotizaciones")
    .insert({
      referencia,
      items: items.map((i) => ({ producto_id: i.id, cantidad: i.cantidad })),
      cliente_nombre: cliente.nombre || null,
      cliente_telefono: cliente.telefono || null,
      comuna: cliente.comuna || null,
    })
    .then(({ error }) => error && console.warn("No se pudo guardar la cotización", error));
}

function nombreUnidad(unidad, cantidad) {
  const plurales = { plancha: "planchas", caja: "cajas", unidad: "unidades" };
  return cantidad === 1 ? unidad : plurales[unidad] ?? unidad;
}

function etiquetaDisponibilidad(p) {
  if (p.disponibilidad === "agotado") return '<span class="estado estado--agotado">Agotado</span>';
  if (p.disponibilidad === "pocas") return '<span class="estado">Últimas unidades</span>';
  return "";
}

// La tarjeta muestra la foto instalada y, al pasar el mouse, la plancha
function fotosTarjeta(p) {
  if (!p.imagen) return "";
  const principal = `<img src="${p.ambiente ?? p.imagen}" alt="${p.nombre}" loading="lazy">`;
  const plancha = p.ambiente ? `<img class="producto__plancha" src="${p.imagen}" alt="" loading="lazy">` : "";
  return principal + plancha;
}

function tarjetaProducto(p) {
  return `
    <button class="producto" data-id="${p.id}">
      <div class="producto__imagen textura ${p.textura}">
        ${fotosTarjeta(p)}
        ${p.oferta ? '<span class="etiqueta etiqueta--oscura producto__oferta">Oferta</span>' : ""}
        ${etiquetaDisponibilidad(p)}
      </div>
      <div class="producto__info">
        <span class="producto__categoria">${nombreCategoria(p.categoria)}</span>
        <h3 class="producto__nombre">${p.nombre}</h3>
        ${muestraColor(p)}
        <p class="producto__precio">${textoPrecio(p)}</p>
      </div>
    </button>`;
}

function mostrarProductos(categoria) {
  const lista = categoria === "todos" ? PRODUCTOS : PRODUCTOS.filter((p) => p.categoria === categoria);
  document.querySelector(".grilla-productos").innerHTML = lista.map(tarjetaProducto).join("");
}

// Portada: un botón por categoría que lleva directo a esa parte del catálogo
function mostrarCategoriasPortada() {
  const contenedor = document.querySelector("[data-hero-categorias]");
  contenedor.innerHTML = CATEGORIAS.map((c) => {
    const productos = PRODUCTOS.filter((p) => p.categoria === c.id);
    if (!productos.length) return "";
    const conFoto = productos.find((p) => p.imagen);
    const foto = conFoto
      ? `<span class="hero-categoria__foto" style="background-image: url('${conFoto.imagen}')"></span>`
      : `<span class="hero-categoria__foto textura ${productos[0].textura}"></span>`;
    return `
      <button type="button" class="hero-categoria" data-ir-categoria="${c.id}">
        ${foto}
        <span class="hero-categoria__texto">
          <strong>${c.nombre}</strong>
          <small>${productos.length} ${productos.length === 1 ? "producto" : "productos"}</small>
        </span>
        <span class="hero-categoria__flecha" aria-hidden="true">→</span>
      </button>`;
  }).join("");
  contenedor.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-ir-categoria]");
    if (!boton) return;
    document.querySelector(`.filtro[data-categoria="${boton.dataset.irCategoria}"]`)?.click();
    document.querySelector("#catalogo").scrollIntoView({ behavior: "smooth" });
  });
}

function cargarFiltros() {
  const contenedor = document.querySelector(".filtros");
  const opciones = [{ id: "todos", nombre: "Todos" }, ...CATEGORIAS];
  contenedor.innerHTML = opciones
    .map((c, i) => `<button class="filtro" role="tab" data-categoria="${c.id}" aria-selected="${i === 0}">${c.nombre}</button>`)
    .join("");

  contenedor.addEventListener("click", (e) => {
    const boton = e.target.closest(".filtro");
    if (!boton) return;
    contenedor.querySelectorAll(".filtro").forEach((b) => b.setAttribute("aria-selected", b === boton));
    mostrarProductos(boton.dataset.categoria);
  });
}

// Ficha de producto
function galeriaFicha(p) {
  if (!p.imagen) return `<div class="ficha__imagen textura ${p.textura}"></div>`;
  const fotos = [
    p.ambiente && { src: p.ambiente, texto: "Instalado" },
    { src: p.imagen, texto: "Plancha" },
  ].filter(Boolean);
  const miniaturas = fotos.length > 1
    ? `<div class="ficha__miniaturas">${fotos
        .map((f, i) => `<button type="button" data-foto="${f.src}" aria-pressed="${i === 0}"><img src="${f.src}" alt=""><span>${f.texto}</span></button>`)
        .join("")}</div>`
    : "";
  return `
    <div class="ficha__imagen ficha__galeria">
      <img class="ficha__foto" src="${fotos[0].src}" alt="${p.nombre}">
      ${miniaturas}
    </div>`;
}

// En los pisos se agrega cuánto rinde cada caja
function detallesFicha(p) {
  if (p.unidad !== "caja" || !p.m2) return p.detalles;
  return [...p.detalles, `Cada caja rinde ${formatoM2.format(p.m2)} m²`];
}

// Producto abierto en la ficha, con la referencia de su cotización
let fichaActual = null;

function mensajesFicha(p, cantidad, referencia) {
  const pedido = `${cantidad} ${nombreUnidad(p.unidad, cantidad)} de ${p.nombre}`;
  return {
    whatsapp: linkWhatsapp(`Hola, me interesa: ${pedido}. ¿Me pueden cotizar? (Ref. ${referencia})`),
    correo: linkCorreo(
      `Cotización ${referencia}: ${p.nombre}`,
      `Hola,\n\nMe interesa cotizar: ${pedido}.\n\nMi nombre:\nMi teléfono:\nComuna:\n\nRef. ${referencia}\n`
    ),
  };
}

function abrirFicha(id) {
  const p = PRODUCTOS.find((x) => x.id === id);
  if (!p) return;
  const referencia = nuevaReferencia();
  fichaActual = { producto: p, referencia };
  const enlaces = mensajesFicha(p, 1, referencia);
  const ficha = document.querySelector(".ficha");
  ficha.querySelector(".ficha__contenido").innerHTML = `
    ${galeriaFicha(p)}
    <div class="ficha__info">
      <span class="producto__categoria">${nombreCategoria(p.categoria)}</span>
      <h3>${p.nombre}</h3>
      ${muestraColor(p)}
      <p class="producto__precio">${textoPrecio(p)}</p>
      ${etiquetaDisponibilidad(p)}
      <ul>${detallesFicha(p).map((d) => `<li>${d}</li>`).join("")}</ul>
      <div class="ficha__acciones">
        <div class="ficha__agregar">
          <label>Cantidad
            <input type="number" min="1" max="9999" value="1" inputmode="numeric" data-ficha-cantidad>
          </label>
          <button type="button" class="boton boton--borde" data-agregar-lista>Agregar a mi lista</button>
        </div>
        <button type="button" class="ficha__ver-lista" data-ver-lista hidden></button>
        <a class="boton" href="${enlaces.whatsapp}" target="_blank" rel="noopener" data-cotizar="whatsapp">Cotizar por WhatsApp</a>
        <a class="boton boton--borde" href="${enlaces.correo}" data-cotizar="correo">Cotizar por correo</a>
      </div>
    </div>`;
  ficha.showModal();
}

function cantidadFicha() {
  const valor = parseInt(document.querySelector("[data-ficha-cantidad]")?.value, 10);
  return valor > 0 ? Math.min(valor, 9999) : 1;
}

function prepararFicha() {
  const ficha = document.querySelector(".ficha");
  document.querySelector(".grilla-productos").addEventListener("click", (e) => {
    const tarjeta = e.target.closest(".producto");
    if (tarjeta) abrirFicha(tarjeta.dataset.id);
  });
  ficha.querySelector(".ficha__cerrar").addEventListener("click", () => ficha.close());
  ficha.addEventListener("click", (e) => {
    if (!fichaActual) return;
    const { producto, referencia } = fichaActual;
    // Cotizar un producto: el mensaje lleva la cantidad elegida y la cotización se guarda en el panel
    const cotizar = e.target.closest("[data-cotizar]");
    if (cotizar) {
      cotizar.href = mensajesFicha(producto, cantidadFicha(), referencia)[cotizar.dataset.cotizar];
      guardarCotizacion(referencia, [{ id: producto.id, cantidad: cantidadFicha() }]);
    }
    if (e.target.closest("[data-agregar-lista]")) {
      agregarALista(producto.id, cantidadFicha());
      e.target.closest("[data-agregar-lista]").textContent = "Agregado a tu lista ✓";
      const ver = ficha.querySelector("[data-ver-lista]");
      ver.textContent = `Ver mi lista (${itemsLista().length})`;
      ver.hidden = false;
    }
    if (e.target.closest("[data-ver-lista]")) {
      ficha.close();
      abrirLista();
    }
  });
  // Cambiar entre la foto instalada y la plancha
  ficha.addEventListener("click", (e) => {
    const miniatura = e.target.closest("[data-foto]");
    if (!miniatura) return;
    ficha.querySelector(".ficha__foto").src = miniatura.dataset.foto;
    ficha.querySelectorAll("[data-foto]").forEach((b) => b.setAttribute("aria-pressed", b === miniatura));
  });
  // Cerrar al hacer clic fuera del contenido
  ficha.addEventListener("click", (e) => {
    if (e.target === ficha) ficha.close();
  });
}

// Calculadora: solo pisos, que se venden por caja (lo pidió el cliente en la reunión)
const CATEGORIAS_CALCULADORA = ["vinilico", "flotante"];
const formatoM2 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

function prepararCalculadora() {
  const form = document.querySelector(".calculadora__form");
  const select = form.producto;
  const rinde = form.querySelector("[data-rinde]");
  const resultado = form.querySelector(".calculadora__resultado");
  const botonCotizar = form.querySelector("[data-whatsapp-calculo]");
  const botonAgregar = form.querySelector("[data-agregar-calculo]");
  const calculables = PRODUCTOS.filter((p) => p.m2 && CATEGORIAS_CALCULADORA.includes(p.categoria));
  let ultimoCalculo = null; // { producto, cantidad, referencia }

  select.innerHTML = CATEGORIAS.map((c) => {
    const opciones = calculables.filter((p) => p.categoria === c.id);
    if (!opciones.length) return "";
    return `<optgroup label="${c.nombre}">${opciones.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("")}</optgroup>`;
  }).join("");

  // Se usan las medidas de la pieza o los m² totales, lo último que haya escrito la persona
  function superficieIngresada() {
    const metros = parseFloat(form.metros.value);
    if (metros > 0) return metros;
    const largo = parseFloat(form.largo.value);
    const ancho = parseFloat(form.ancho.value);
    return largo > 0 && ancho > 0 ? largo * ancho : null;
  }

  function calcular() {
    const p = calculables.find((x) => x.id === select.value);
    rinde.innerHTML = p ? `Cada ${p.unidad} rinde <strong>${formatoM2.format(p.m2)} m²</strong>` : "";
    const superficie = superficieIngresada();
    if (!p || !superficie) {
      resultado.textContent = "Ingresa las medidas o los m² para calcular.";
      botonCotizar.hidden = true;
      botonAgregar.hidden = true;
      ultimoCalculo = null;
      return;
    }
    const conCortes = superficie * EXTRA_CORTES;
    const cantidad = Math.ceil(conCortes / p.m2);
    const plural = nombreUnidad(p.unidad, cantidad);
    const total = p.precio ? `<span class="calculadora__precio">Aprox. ${formatoPeso.format(cantidad * p.precio)}</span>` : "";
    ultimoCalculo = { producto: p, cantidad, referencia: nuevaReferencia() };

    resultado.innerHTML = `
      <strong>${cantidad} ${plural}</strong>
      <span>Tu superficie: ${formatoM2.format(superficie)} m² + 10% por cortes = ${formatoM2.format(conCortes)} m²</span>
      <span>${cantidad} ${plural} × ${formatoM2.format(p.m2)} m² = cubren ${formatoM2.format(cantidad * p.m2)} m²</span>
      ${total}`;

    const mensaje = `Hola, quiero cotizar ${cantidad} ${plural} de ${p.nombre} (rinden ${formatoM2.format(cantidad * p.m2)} m²) para ${formatoM2.format(superficie)} m². (Ref. ${ultimoCalculo.referencia})`;
    botonCotizar.href = linkWhatsapp(mensaje);
    botonCotizar.target = "_blank";
    botonCotizar.rel = "noopener";
    botonCotizar.hidden = false;
    botonAgregar.hidden = false;
    botonAgregar.textContent = "Agregar a mi lista";
  }

  // Cotizar desde la calculadora también queda guardado en el panel
  botonCotizar.addEventListener("click", () => {
    if (ultimoCalculo) guardarCotizacion(ultimoCalculo.referencia, [{ id: ultimoCalculo.producto.id, cantidad: ultimoCalculo.cantidad }]);
  });
  botonAgregar.addEventListener("click", () => {
    if (!ultimoCalculo) return;
    agregarALista(ultimoCalculo.producto.id, ultimoCalculo.cantidad);
    botonAgregar.textContent = "Agregado a tu lista ✓";
  });

  // Si escribe los m², se borran las medidas (y al revés) para que no se confunda qué se está calculando
  form.addEventListener("input", (e) => {
    if (e.target.name === "metros") form.largo.value = form.ancho.value = "";
    if (e.target.name === "largo" || e.target.name === "ancho") form.metros.value = "";
    calcular();
  });
  form.addEventListener("submit", (e) => e.preventDefault());
  calcular();
}

// Lista de cotización: el cliente junta varios productos y los manda en un solo mensaje.
// Se guarda en el navegador para que no se pierda si recarga la página.
const CLAVE_LISTA = "isidora-lista";
let lista = leerLista();
let envioLista = { firma: "", referencia: "" };

function leerLista() {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_LISTA) ?? "[]");
    return Array.isArray(guardada) ? guardada.filter((i) => typeof i.id === "string" && i.cantidad > 0) : [];
  } catch {
    return [];
  }
}

function guardarLista() {
  try {
    localStorage.setItem(CLAVE_LISTA, JSON.stringify(lista));
  } catch {
    // Sin almacenamiento (modo incógnito, por ejemplo): la lista dura mientras la página esté abierta
  }
  actualizarBotonLista();
}

// Los productos de la lista con sus datos; si alguno ya no está en el catálogo, se ignora
function itemsLista() {
  return lista.map((i) => ({ ...i, producto: PRODUCTOS.find((p) => p.id === i.id) })).filter((i) => i.producto);
}

function agregarALista(id, cantidad) {
  const item = lista.find((i) => i.id === id);
  if (item) item.cantidad = Math.min(9999, item.cantidad + cantidad);
  else lista.push({ id, cantidad });
  guardarLista();
}

function actualizarBotonLista() {
  const cantidad = itemsLista().length;
  document.querySelector("[data-abrir-lista]").hidden = cantidad === 0;
  document.querySelector("[data-lista-cantidad]").textContent = cantidad;
}

function mostrarLista() {
  const items = itemsLista();
  const dialogo = document.querySelector("[data-lista]");
  dialogo.querySelector("[data-lista-vacia]").hidden = items.length > 0;
  dialogo.querySelector("[data-lista-form]").hidden = items.length === 0;
  dialogo.querySelector("[data-lista-items]").innerHTML = items
    .map(({ producto: p, cantidad }) => `
      <div class="lista__item" data-item-lista="${p.id}">
        <span class="lista__foto textura ${p.textura}">${p.imagen ? `<img src="${p.imagen}" alt="">` : ""}</span>
        <div class="lista__info">
          <strong>${p.nombre}</strong>
          <small>${p.precio != null ? `${formatoPeso.format(p.precio)} / ${p.unidad}` : "Precio a consultar"}</small>
        </div>
        <div class="lista__cantidad">
          <button type="button" data-restar aria-label="Uno menos">−</button>
          <input type="number" min="1" max="9999" value="${cantidad}" inputmode="numeric" aria-label="Cantidad de ${p.nombre}" data-cantidad-lista>
          <button type="button" data-sumar aria-label="Uno más">+</button>
        </div>
        <button type="button" class="lista__quitar" data-quitar aria-label="Sacar ${p.nombre} de la lista">×</button>
      </div>`)
    .join("");

  const conPrecio = items.filter((i) => i.producto.precio != null);
  const total = conPrecio.reduce((suma, i) => suma + i.producto.precio * i.cantidad, 0);
  const faltan = conPrecio.length < items.length;
  dialogo.querySelector("[data-lista-total]").innerHTML = !items.length
    ? ""
    : conPrecio.length
      ? `Total estimado <strong>${formatoPeso.format(total)}</strong>${faltan ? "<small>más los productos con precio a consultar</small>" : ""}`
      : "<small>Te respondemos con los precios.</small>";
}

function abrirLista() {
  const dialogo = document.querySelector("[data-lista]");
  dialogo.querySelector("[data-lista-error]").hidden = true;
  dialogo.querySelector("[data-lista-ok]").hidden = true;
  mostrarLista();
  dialogo.showModal();
}

function mensajeLista(items, cliente, referencia) {
  const lineas = items.map(({ producto: p, cantidad }) => {
    const precio = p.precio != null ? ` (${formatoPeso.format(p.precio * cantidad)})` : "";
    return `• ${cantidad} ${nombreUnidad(p.unidad, cantidad)} de ${p.nombre}${precio}`;
  });
  const conPrecio = items.filter((i) => i.producto.precio != null);
  const total = conPrecio.reduce((suma, i) => suma + i.producto.precio * i.cantidad, 0);
  const partes = ["Hola, quiero cotizar:", ...lineas];
  if (conPrecio.length) {
    const faltan = conPrecio.length < items.length ? " (más los productos a consultar)" : "";
    partes.push(`Total estimado: ${formatoPeso.format(total)}${faltan}`);
  }
  partes.push("", `Nombre: ${cliente.nombre}`);
  if (cliente.telefono) partes.push(`Teléfono: ${cliente.telefono}`);
  if (cliente.comuna) partes.push(`Comuna: ${cliente.comuna}`);
  partes.push(`Ref. ${referencia}`);
  return partes.join("\n");
}

function prepararLista() {
  const dialogo = document.querySelector("[data-lista]");
  const form = dialogo.querySelector("[data-lista-form]");
  const error = dialogo.querySelector("[data-lista-error]");
  const ok = dialogo.querySelector("[data-lista-ok]");

  document.querySelector("[data-abrir-lista]").addEventListener("click", abrirLista);
  dialogo.querySelector("[data-cerrar-lista]").addEventListener("click", () => dialogo.close());
  dialogo.addEventListener("click", (e) => {
    if (e.target === dialogo) dialogo.close();
  });

  // Cambiar cantidades o sacar productos
  const items = dialogo.querySelector("[data-lista-items]");
  items.addEventListener("click", (e) => {
    const fila = e.target.closest("[data-item-lista]");
    if (!fila) return;
    const item = lista.find((i) => i.id === fila.dataset.itemLista);
    if (e.target.closest("[data-sumar]")) item.cantidad = Math.min(9999, item.cantidad + 1);
    else if (e.target.closest("[data-restar]")) item.cantidad = Math.max(1, item.cantidad - 1);
    else if (e.target.closest("[data-quitar]")) lista = lista.filter((i) => i !== item);
    else return;
    guardarLista();
    mostrarLista();
  });
  items.addEventListener("change", (e) => {
    const campo = e.target.closest("[data-cantidad-lista]");
    if (!campo) return;
    const item = lista.find((i) => i.id === campo.closest("[data-item-lista]").dataset.itemLista);
    const valor = parseInt(campo.value, 10);
    item.cantidad = valor > 0 ? Math.min(valor, 9999) : 1;
    guardarLista();
    mostrarLista();
  });

  // Enviar: arma el mensaje con la referencia, guarda la cotización y deja que se abra WhatsApp o el correo
  form.addEventListener("click", (e) => {
    const enviar = e.target.closest("[data-enviar-lista]");
    if (!enviar) return;
    const cliente = { nombre: form.nombre.value.trim(), telefono: form.telefono.value.trim(), comuna: form.comuna.value.trim() };
    if (!cliente.nombre) {
      e.preventDefault();
      error.textContent = "Escribe tu nombre para enviar la cotización.";
      error.hidden = false;
      form.nombre.focus();
      return;
    }
    error.hidden = true;
    // Si se vuelve a tocar sin cambiar nada, se usa la misma referencia y no se guarda dos veces
    const firma = JSON.stringify([lista, cliente]);
    if (envioLista.firma !== firma) envioLista = { firma, referencia: nuevaReferencia() };
    const productos = itemsLista();
    const mensaje = mensajeLista(productos, cliente, envioLista.referencia);
    const porWhatsapp = enviar.dataset.enviarLista === "whatsapp";
    enviar.href = porWhatsapp ? linkWhatsapp(mensaje) : linkCorreo(`Cotización ${envioLista.referencia}`, mensaje);
    // Campo trampa: si viene lleno, lo llenó un robot y no se guarda
    if (!form.sitio.value) guardarCotizacion(envioLista.referencia, productos, cliente);
    ok.textContent = `Listo: tu cotización (Ref. ${envioLista.referencia}) se abrió en ${porWhatsapp ? "WhatsApp" : "tu correo"}. Si no se abrió, vuelve a tocar el botón.`;
    ok.hidden = false;
  });

  form.querySelector("[data-vaciar-lista]").addEventListener("click", () => {
    lista = [];
    guardarLista();
    mostrarLista();
  });

  actualizarBotonLista();
}

// Trabajos realizados, opiniones y preguntas frecuentes (se cargan desde el panel, pestaña Página).
// Cada sección se muestra solo si tiene algo publicado.
function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function mostrarSeccion(nombre, items, html) {
  document.querySelector(`[data-seccion="${nombre}"]`).hidden = items.length === 0;
  return items.map(html).join("");
}

async function cargarContenidoPagina() {
  if (!db) return;
  const [trabajos, opiniones, preguntas] = await Promise.all([
    db.from("trabajos").select("foto, titulo, comuna").eq("visible", true).order("orden").order("id"),
    db.from("opiniones").select("nombre, comuna, texto, estrellas").eq("visible", true).order("orden").order("id"),
    db.from("preguntas").select("pregunta, respuesta").eq("visible", true).order("orden").order("id"),
  ]);

  document.querySelector("[data-galeria]").innerHTML = mostrarSeccion("trabajos", trabajos.data ?? [], (t) => {
    const texto = [t.titulo, t.comuna].filter(Boolean).join(" · ");
    return `
      <button type="button" class="galeria__item" data-ver-foto="${esc(t.foto)}" data-texto="${esc(texto)}">
        <img src="${esc(t.foto)}" alt="${esc(t.titulo)}" loading="lazy">
        <span>${esc(texto)}</span>
      </button>`;
  });

  mostrarClientes(opiniones.data ?? [], preguntas.data ?? []);
}

// Opiniones y preguntas comparten sección: aparece si hay al menos una de las dos,
// y cada parte se esconde sola si no tiene nada publicado.
function mostrarClientes(opiniones, preguntas) {
  document.querySelector('[data-seccion="clientes"]').hidden = !opiniones.length && !preguntas.length;
  document.querySelector('[data-parte="opiniones"]').hidden = !opiniones.length;
  document.querySelector('[data-parte="preguntas"]').hidden = !preguntas.length;

  document.querySelector("[data-opiniones]").innerHTML = opiniones
    .map((o) => `
      <figure class="opinion">
        ${o.estrellas ? `<span class="opinion__estrellas" aria-label="${o.estrellas} de 5 estrellas">${"★".repeat(o.estrellas)}${"☆".repeat(5 - o.estrellas)}</span>` : ""}
        <blockquote>${esc(o.texto)}</blockquote>
        <figcaption><strong>${esc(o.nombre)}</strong>${o.comuna ? ` · ${esc(o.comuna)}` : ""}</figcaption>
      </figure>`)
    .join("");

  document.querySelector("[data-cantidad-preguntas]").textContent =
    preguntas.length === 1 ? "la respuesta" : `las ${preguntas.length} respuestas`;
  document.querySelector("[data-preguntas]").innerHTML = preguntas
    .map((p) => `
      <details class="pregunta">
        <summary>${esc(p.pregunta)}</summary>
        <p>${esc(p.respuesta)}</p>
      </details>`)
    .join("");
}

function prepararVisor() {
  const visor = document.querySelector("[data-visor]");
  document.querySelector("[data-galeria]").addEventListener("click", (e) => {
    const item = e.target.closest("[data-ver-foto]");
    if (!item) return;
    visor.querySelector("[data-visor-foto]").src = item.dataset.verFoto;
    visor.querySelector("[data-visor-texto]").textContent = item.dataset.texto;
    visor.showModal();
  });
  visor.querySelector("[data-cerrar-visor]").addEventListener("click", () => visor.close());
  visor.addEventListener("click", (e) => {
    if (e.target === visor) visor.close();
  });
}

// Menú en celular
function prepararMenu() {
  const boton = document.querySelector(".menu-boton");
  const nav = document.querySelector(".nav");
  boton.addEventListener("click", () => {
    const abierto = nav.classList.toggle("abierto");
    boton.setAttribute("aria-expanded", abierto);
  });
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      nav.classList.remove("abierto");
      boton.setAttribute("aria-expanded", false);
    }
  });
}

async function iniciar() {
  cargarDatosNegocio();
  prepararMenu();
  prepararFicha();
  await cargarCatalogo();
  cargarFiltros();
  mostrarCategoriasPortada();
  mostrarProductos("todos");
  prepararCalculadora();
  prepararLista();
  prepararVisor();
  cargarContenidoPagina().catch((error) => console.warn("No se pudo cargar el contenido de la página", error));
}

iniciar();
