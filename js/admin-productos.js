// Pestaña Productos: lista, avisos de stock bajo y editor con fotos.
const ESTADOS = {
  disponible: { texto: "Disponible", clase: "estado estado--ok" },
  pocas: { texto: "Pocas unidades", clase: "estado" },
  agotado: { texto: "Agotado", clase: "estado estado--agotado" },
};

// Textura de relleno mientras un producto nuevo no tiene foto (las define estilos.css)
const TEXTURA_POR_CATEGORIA = {
  "pvc-marmol": "marmol-carrara",
  vinilico: "madera-clara",
  flotante: "madera-miel",
  accesorios: "accesorio",
};

// Las fotos subidas desde el panel quedan en el bucket "productos" de Supabase
const CARPETA_FOTOS = "/storage/v1/object/public/productos/";

let productoEditando = null; // null = producto nuevo
// Por cada foto: undefined = sin cambios, null = quitarla, Blob = foto nueva
const fotosNuevas = { imagen: undefined, ambiente: undefined };

const sinTildes = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Avisos de stock bajo (arriba de la lista y en la pestaña)
function mostrarAvisosStock() {
  const conStock = datos.productos.filter((p) => p.stock != null);
  const agotados = conStock.filter((p) => p.disponibilidad === "agotado");
  const pocas = conStock.filter((p) => p.disponibilidad === "pocas");
  const botones = (lista) =>
    lista.map((p) => `<button type="button" data-id="${esc(p.id)}">${esc(p.nombre)} <strong>(${p.stock})</strong></button>`).join("");

  document.querySelector("[data-alertas-stock]").innerHTML = [
    agotados.length ? `<div class="admin__alerta admin__alerta--roja"><p>Agotados</p>${botones(agotados)}</div>` : "",
    pocas.length ? `<div class="admin__alerta"><p>Quedan pocas unidades</p>${botones(pocas)}</div>` : "",
  ].join("");

  const contador = document.querySelector("[data-contador-stock]");
  contador.textContent = agotados.length + pocas.length;
  contador.hidden = agotados.length + pocas.length === 0;
}

function filaProducto(p) {
  const estado = ESTADOS[p.disponibilidad] ?? ESTADOS.disponible;
  const foto = rutaFoto(p.imagen || p.ambiente);
  const precio = p.precio == null ? "Consultar" : `${formatoPeso.format(p.precio)} <small>/ ${esc(p.unidad)}</small>`;
  const etiquetas = [
    nombreCategoria(p.categoria_id),
    p.codigo_color && `Cód. ${p.codigo_color}`,
    p.oferta && "Oferta",
    !p.activo && "Oculto en la página",
  ]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
  return `
    <button type="button" class="admin-producto${p.activo ? "" : " admin-producto--oculto"}" data-id="${esc(p.id)}">
      <span class="admin-producto__foto textura ${esc(p.textura)}">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy">` : ""}</span>
      <span class="admin-producto__info">
        <strong>${esc(p.nombre)}</strong>
        <small>${etiquetas}</small>
      </span>
      <span class="admin-producto__precio">${precio}</span>
      <span class="admin-producto__stock">
        ${p.stock == null ? "<small>Sin controlar</small>" : `<span class="${estado.clase}">${p.stock} · ${estado.texto}</span>`}
      </span>
      <svg class="icono admin-producto__flecha" aria-hidden="true"><use href="#i-flecha"></use></svg>
    </button>`;
}

// Filtro por categoría (chips arriba de la lista)
let categoriaFiltro = "todas";

function mostrarFiltroCategorias() {
  if (categoriaFiltro !== "todas" && !datos.categorias.some((c) => c.id === categoriaFiltro)) categoriaFiltro = "todas";
  const opciones = [
    { id: "todas", nombre: "Todas", cantidad: datos.productos.length },
    ...datos.categorias.map((c) => ({ ...c, cantidad: datos.productos.filter((p) => p.categoria_id === c.id).length })),
  ];
  document.querySelector("[data-filtro-categorias]").innerHTML = opciones
    .map((c) => `<button type="button" class="chip" data-chip="${esc(c.id)}" aria-pressed="${c.id === categoriaFiltro}">${esc(c.nombre)}<small>${c.cantidad}</small></button>`)
    .join("");
}

function mostrarListaProductos() {
  const buscado = sinTildes(document.querySelector("[data-buscar]").value.trim());
  const lista = datos.productos.filter(
    (p) =>
      (categoriaFiltro === "todas" || p.categoria_id === categoriaFiltro) &&
      sinTildes(`${p.nombre} ${nombreCategoria(p.categoria_id)} ${p.codigo_color ?? ""}`).includes(buscado)
  );
  document.querySelector("[data-lista-productos]").innerHTML = lista.length
    ? lista.map(filaProducto).join("")
    : `<p class="admin__vacio">${datos.productos.length ? "Ningún producto coincide con la búsqueda." : "Todavía no hay productos."}</p>`;
}

function refrescarProductos() {
  mostrarAvisosStock();
  mostrarFiltroCategorias();
  mostrarListaProductos();
  const bajos = datos.productos.filter((p) => p.stock != null && (p.disponibilidad === "pocas" || p.disponibilidad === "agotado")).length;
  const ocultos = datos.productos.filter((p) => !p.activo).length;
  document.querySelector("[data-bajada-productos]").textContent = [
    `${datos.productos.length} productos en ${datos.categorias.length} categorías`,
    bajos && `${bajos} con stock bajo`,
    ocultos && `${ocultos} ${ocultos === 1 ? "oculto" : "ocultos"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

async function recargarProductos() {
  try {
    await cargarCatalogoAdmin();
    refrescarProductos();
  } catch (error) {
    console.error(error);
    document.querySelector("[data-lista-productos]").innerHTML =
      `<p class="admin__vacio">No se pudieron cargar los productos. Revisa tu conexión.</p>`;
  }
}

// Editor
function mostrarFoto(tipo, src) {
  const caja = document.querySelector(`[data-foto="${tipo}"]`);
  const imagen = caja.querySelector("img");
  imagen.hidden = !src;
  if (src) imagen.src = src;
  else imagen.removeAttribute("src");
  caja.querySelector(".admin-foto__vacia").hidden = Boolean(src);
  caja.querySelector(".admin-foto__quitar").hidden = !src;
}

function abrirEditor(id) {
  const form = document.querySelector("[data-form-producto]");
  const p = datos.productos.find((x) => x.id === id) ?? null;
  productoEditando = p;
  fotosNuevas.imagen = undefined;
  fotosNuevas.ambiente = undefined;

  form.reset();
  form.categoria_id.innerHTML = datos.categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join("");
  form.nombre.value = p?.nombre ?? "";
  form.categoria_id.value = p?.categoria_id ?? datos.categorias[0]?.id ?? "";
  form.unidad.value = p?.unidad ?? "plancha";
  form.precio.value = numeroParaCampo(p?.precio);
  form.precio_anterior.value = numeroParaCampo(p?.precio_anterior);
  form.m2.value = p?.m2 == null ? "" : String(Number(p.m2)).replace(".", ",");
  form.codigo_color.value = p?.codigo_color ?? "";
  form.stock.value = p?.stock ?? "";
  form.stock_minimo.value = p?.stock_minimo ? p.stock_minimo : "";
  form.detalles.value = (p?.detalles ?? []).join("\n");
  form.activo.checked = p ? p.activo : true;
  form.oferta.checked = p?.oferta ?? false;
  mostrarFoto("imagen", rutaFoto(p?.imagen));
  mostrarFoto("ambiente", rutaFoto(p?.ambiente));

  document.querySelector("[data-titulo-producto]").textContent = p ? "Editar producto" : "Nuevo producto";
  document.querySelector("[data-eliminar-producto]").hidden = !p;
  // Las compras se registran sobre un producto que ya existe
  document.querySelector("[data-compra]").hidden = !p;
  document.querySelector("[data-ok-producto]").hidden = true;
  mostrarError("[data-error-producto]", "");
  document.querySelector("[data-dialogo-producto]").showModal();
}

function leerFormularioProducto(form) {
  return {
    nombre: form.nombre.value.trim(),
    categoria_id: form.categoria_id.value,
    unidad: form.unidad.value,
    precio: leerEntero(form.precio.value),
    precio_anterior: leerEntero(form.precio_anterior.value),
    m2: leerDecimal(form.m2.value),
    codigo_color: form.codigo_color.value.trim() || null,
    stock: leerEntero(form.stock.value),
    stock_minimo: leerEntero(form.stock_minimo.value) ?? 0,
    detalles: form.detalles.value.split("\n").map((linea) => linea.trim()).filter(Boolean),
    activo: form.activo.checked,
    oferta: form.oferta.checked,
  };
}

// Devuelve el problema a corregir, o "" si está todo bien
function revisarProducto(v) {
  if (!v.nombre) return "Escribe el nombre del producto.";
  if (!v.categoria_id) return "Elige una categoría.";
  if (Number.isNaN(v.precio) || v.precio < 0) return "Escribe el precio solo con números, por ejemplo 19.990.";
  if (Number.isNaN(v.precio_anterior) || v.precio_anterior < 0) return "Escribe el precio antes de la oferta solo con números.";
  if (v.precio_anterior != null && v.precio != null && v.precio_anterior <= v.precio) {
    return "El precio antes de la oferta tiene que ser mayor que el precio actual.";
  }
  if (Number.isNaN(v.m2) || (v.m2 != null && (v.m2 <= 0 || v.m2 >= 10000))) {
    return "Los m² tienen que ser un número mayor que 0, por ejemplo 2,98.";
  }
  if (Number.isNaN(v.stock)) return "Escribe el stock solo con números.";
  if (Number.isNaN(v.stock_minimo) || v.stock_minimo < 0) return "El aviso de stock tiene que ser un número, por ejemplo 3.";
  return "";
}

// "PVC Mármol Blanco" → "pvc-marmol-blanco" (si ya existe, "pvc-marmol-blanco-2")
function crearId(nombre) {
  const base = sinTildes(nombre).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "producto";
  let id = base;
  for (let n = 2; datos.productos.some((p) => p.id === id); n++) id = `${base}-${n}`;
  return id;
}

// Fotos
async function leerImagen(archivo) {
  try {
    return await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    // Navegadores antiguos no conocen esa opción
    return createImageBitmap(archivo);
  }
}

// Achica la foto a 1600 px como máximo y la pasa a JPG: las del celular pesan varios MB
async function prepararFoto(archivo) {
  const imagen = await leerImagen(archivo);
  const escala = Math.min(1, 1600 / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  const contexto = lienzo.getContext("2d");
  contexto.fillStyle = "#fff"; // fondo blanco para los PNG con transparencia
  contexto.fillRect(0, 0, lienzo.width, lienzo.height);
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close?.();
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error("No se pudo preparar la foto"))), "image/jpeg", 0.85);
  });
}

async function subirFoto(blob, idProducto, tipo) {
  const ruta = `${idProducto}/${tipo}-${Date.now()}.jpg`;
  const { error } = await db.storage.from("productos").upload(ruta, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return db.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
}

// Solo se borran fotos subidas desde el panel; las de la carpeta img/ no se tocan
async function borrarFotos(urls) {
  const rutas = urls
    .filter((url) => url?.includes(CARPETA_FOTOS))
    .map((url) => decodeURIComponent(url.split(CARPETA_FOTOS)[1]));
  if (rutas.length) await db.storage.from("productos").remove(rutas);
}

// Guardar y eliminar
async function guardarProducto(e) {
  e.preventDefault();
  const form = e.target;
  const valores = leerFormularioProducto(form);
  const problema = revisarProducto(valores);
  if (problema) return mostrarError("[data-error-producto]", problema);

  const esNuevo = !productoEditando;
  const id = productoEditando?.id ?? crearId(valores.nombre);
  const boton = form.querySelector('[type="submit"]');
  const subidas = [];
  const fotosViejas = [];
  boton.disabled = true;
  boton.textContent = "Guardando…";
  mostrarError("[data-error-producto]", "");
  try {
    for (const tipo of ["imagen", "ambiente"]) {
      const nueva = fotosNuevas[tipo];
      if (nueva === undefined) continue;
      if (productoEditando?.[tipo]) fotosViejas.push(productoEditando[tipo]);
      valores[tipo] = nueva ? await subirFoto(nueva, id, tipo === "imagen" ? "plancha" : "ambiente") : null;
      if (nueva) subidas.push(valores[tipo]);
    }

    const consulta = esNuevo
      ? db.from("productos").insert({
          ...valores,
          id,
          orden: Math.max(0, ...datos.productos.map((p) => p.orden)) + 1,
          textura: TEXTURA_POR_CATEGORIA[valores.categoria_id] ?? "accesorio",
        })
      : db.from("productos").update(valores).eq("id", id);
    const { data: guardado, error } = await consulta.select().single();
    if (error) throw error;

    borrarFotos(fotosViejas).catch((fallo) => console.warn("No se pudo borrar una foto vieja", fallo));
    datos.productos = ordenarProductos([...datos.productos.filter((p) => p.id !== id), guardado]);
    refrescarProductos();
    document.querySelector("[data-dialogo-producto]").close();
    avisar(esNuevo ? "Producto creado" : "Cambios guardados");
  } catch (error) {
    console.error(error);
    borrarFotos(subidas).catch(() => {});
    mostrarError("[data-error-producto]", "No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar";
  }
}

// Llegó mercadería: se suma al stock y queda registrada como compra para el Excel del mes
async function sumarCompra() {
  const form = document.querySelector("[data-form-producto]");
  const ok = document.querySelector("[data-ok-producto]");
  const unidades = leerEntero(form.compra.value);
  ok.hidden = true;
  if (!(unidades > 0)) return mostrarError("[data-error-producto]", "Escribe cuántas unidades llegaron, por ejemplo 20.");

  const boton = document.querySelector("[data-sumar-compra]");
  boton.disabled = true;
  boton.textContent = "Sumando…";
  const id = productoEditando.id;
  const { data: nuevoStock, error } = await db.rpc("registrar_compra", { producto: id, unidades });
  boton.disabled = false;
  boton.textContent = "Sumar al stock";
  if (error) {
    console.error(error);
    return mostrarError("[data-error-producto]", "No se pudo sumar al stock. Revisa tu conexión e intenta de nuevo.");
  }

  mostrarError("[data-error-producto]", "");
  form.stock.value = nuevoStock;
  form.compra.value = "";
  ok.textContent = `Listo: se sumaron ${unidades}. Ahora hay ${nuevoStock} en stock.`;
  ok.hidden = false;
  await recargarProductos();
  productoEditando = datos.productos.find((p) => p.id === id) ?? productoEditando;
}

async function eliminarProducto() {
  const p = productoEditando;
  if (!p) return;
  const confirma = await confirmar(
    `¿Eliminar "${p.nombre}"? Si solo quieres sacarlo de la página por un tiempo, mejor desmarca "Visible en la página".`
  );
  if (!confirma) return;
  const { data, error } = await db.from("productos").delete().eq("id", p.id).select("id");
  if (error || !data.length) {
    console.error(error);
    return mostrarError("[data-error-producto]", "No se pudo eliminar. Intenta de nuevo.");
  }
  borrarFotos([p.imagen, p.ambiente]).catch((fallo) => console.warn("No se pudieron borrar las fotos", fallo));
  datos.productos = datos.productos.filter((x) => x.id !== p.id);
  refrescarProductos();
  document.querySelector("[data-dialogo-producto]").close();
  avisar("Producto eliminado");
}

function prepararProductos() {
  const abrirDesdeLista = (e) => {
    const fila = e.target.closest("[data-id]");
    if (fila) abrirEditor(fila.dataset.id);
  };
  document.querySelector("[data-lista-productos]").addEventListener("click", abrirDesdeLista);
  document.querySelector("[data-alertas-stock]").addEventListener("click", abrirDesdeLista);
  document.querySelector("[data-buscar]").addEventListener("input", mostrarListaProductos);
  document.querySelector("[data-filtro-categorias]").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-chip]");
    if (!chip) return;
    categoriaFiltro = chip.dataset.chip;
    mostrarFiltroCategorias();
    mostrarListaProductos();
  });
  document.querySelector("[data-nuevo-producto]").addEventListener("click", () => abrirEditor(null));
  document.querySelector("[data-form-producto]").addEventListener("submit", guardarProducto);
  document.querySelector("[data-eliminar-producto]").addEventListener("click", eliminarProducto);
  document.querySelector("[data-sumar-compra]").addEventListener("click", sumarCompra);

  document.querySelectorAll("[data-foto]").forEach((caja) => {
    const tipo = caja.dataset.foto;
    const campo = caja.querySelector('input[type="file"]');
    campo.addEventListener("change", async () => {
      const archivo = campo.files[0];
      campo.value = "";
      if (!archivo) return;
      try {
        const foto = await prepararFoto(archivo);
        fotosNuevas[tipo] = foto;
        mostrarFoto(tipo, URL.createObjectURL(foto));
        mostrarError("[data-error-producto]", "");
      } catch (error) {
        console.error(error);
        mostrarError("[data-error-producto]", "No se pudo leer esa foto. Prueba con una foto JPG o PNG.");
      }
    });
    caja.querySelector(".admin-foto__quitar").addEventListener("click", () => {
      fotosNuevas[tipo] = null;
      mostrarFoto(tipo, "");
    });
  });
}
