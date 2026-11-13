// Categorías del catálogo (PVC tipo mármol, Piso vinílico… y las que agregue el dueño, como Cerámica).
// En la página aparecen como filtros y como botones en la portada cuando tienen productos.

function productosDeCategoria(id) {
  return datos.productos.filter((p) => p.categoria_id === id).length;
}

function filaCategoria(c, posicion, total) {
  const cantidad = productosDeCategoria(c.id);
  return `
    <div class="categoria" data-categoria="${esc(c.id)}">
      <input value="${esc(c.nombre)}" maxlength="40" aria-label="Nombre de la categoría" data-nombre-categoria>
      <small>${cantidad} ${cantidad === 1 ? "producto" : "productos"}</small>
      <span class="categoria__acciones">
        <button type="button" data-mover-categoria="-1" aria-label="Subir"${posicion === 0 ? " disabled" : ""}>↑</button>
        <button type="button" data-mover-categoria="1" aria-label="Bajar"${posicion === total - 1 ? " disabled" : ""}>↓</button>
        <button type="button" class="categoria__borrar" data-borrar-categoria aria-label="Eliminar ${esc(c.nombre)}"
          title="${cantidad ? "Primero mueve o elimina sus productos" : "Eliminar"}"${cantidad ? " disabled" : ""}>×</button>
      </span>
    </div>`;
}

function mostrarCategorias() {
  const lista = document.querySelector("[data-lista-categorias]");
  lista.innerHTML = datos.categorias.length
    ? datos.categorias.map((c, i) => filaCategoria(c, i, datos.categorias.length)).join("")
    : `<p class="admin__vacio">Todavía no hay categorías.</p>`;
}

// Después de cualquier cambio: se recarga el catálogo y se actualiza todo lo que muestra categorías
async function categoriasCambiaron() {
  await recargarProductos();
  mostrarCategorias();
  // Si el editor de producto está abierto, su lista de categorías se actualiza sin perder lo elegido
  const select = document.querySelector('[data-form-producto] [name="categoria_id"]');
  const elegida = select.value;
  select.innerHTML = datos.categorias.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join("");
  select.value = datos.categorias.some((c) => c.id === elegida) ? elegida : datos.categorias.at(-1)?.id ?? "";
}

function idCategoria(nombre) {
  const base = sinTildes(nombre).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "categoria";
  let id = base === "todos" ? "todos-1" : base; // "todos" lo usa el filtro de la página
  for (let n = 2; datos.categorias.some((c) => c.id === id); n++) id = `${base}-${n}`;
  return id;
}

async function crearCategoria(e) {
  e.preventDefault();
  const form = e.target;
  const nombre = form.nombre.value.trim();
  if (!nombre) return mostrarError("[data-error-categoria]", "Escribe el nombre de la categoría, por ejemplo Cerámica.");
  if (datos.categorias.some((c) => sinTildes(c.nombre) === sinTildes(nombre))) {
    return mostrarError("[data-error-categoria]", "Ya existe una categoría con ese nombre.");
  }
  const { error } = await db.from("categorias").insert({
    id: idCategoria(nombre),
    nombre,
    descripcion: form.descripcion.value.trim() || null,
    orden: Math.max(0, ...datos.categorias.map((c) => c.orden ?? 0)) + 1,
  });
  if (error) {
    console.error(error);
    return mostrarError("[data-error-categoria]", "No se pudo crear la categoría. Revisa tu conexión.");
  }
  form.reset();
  mostrarError("[data-error-categoria]", "");
  avisar(`Categoría "${nombre}" creada`);
  await categoriasCambiaron();
}

async function renombrarCategoria(id, nombre) {
  const categoria = datos.categorias.find((c) => c.id === id);
  if (!categoria || !nombre || nombre === categoria.nombre) return mostrarCategorias();
  const { error } = await db.from("categorias").update({ nombre }).eq("id", id);
  if (error) {
    console.error(error);
    mostrarError("[data-error-categoria]", "No se pudo cambiar el nombre.");
    return mostrarCategorias();
  }
  mostrarError("[data-error-categoria]", "");
  avisar("Nombre actualizado");
  await categoriasCambiaron();
}

// ↑ ↓: intercambia su número de orden con el de al lado
async function moverCategoria(id, direccion) {
  const posicion = datos.categorias.findIndex((c) => c.id === id);
  const actual = datos.categorias[posicion];
  const vecina = datos.categorias[posicion + direccion];
  if (!actual || !vecina) return;
  let ordenActual = vecina.orden;
  const ordenVecina = actual.orden;
  if (ordenActual === ordenVecina) ordenActual += direccion;
  const [uno, otro] = await Promise.all([
    db.from("categorias").update({ orden: ordenActual }).eq("id", actual.id),
    db.from("categorias").update({ orden: ordenVecina }).eq("id", vecina.id),
  ]);
  if (uno.error || otro.error) {
    console.error(uno.error ?? otro.error);
    mostrarError("[data-error-categoria]", "No se pudo cambiar el orden.");
  }
  await categoriasCambiaron();
}

async function eliminarCategoria(id) {
  const categoria = datos.categorias.find((c) => c.id === id);
  if (!categoria || productosDeCategoria(id)) return;
  const confirma = await confirmar(`¿Eliminar la categoría "${categoria.nombre}"?`);
  if (!confirma) return;
  const { data, error } = await db.from("categorias").delete().eq("id", id).select("id");
  if (error || !data.length) {
    console.error(error);
    return mostrarError("[data-error-categoria]", "No se pudo eliminar. Si tiene productos, muévelos a otra categoría primero.");
  }
  avisar("Categoría eliminada");
  await categoriasCambiaron();
}

function prepararCategorias() {
  const dialogo = document.querySelector("[data-dialogo-categorias]");
  document.querySelectorAll("[data-abrir-categorias]").forEach((boton) =>
    boton.addEventListener("click", () => {
      mostrarError("[data-error-categoria]", "");
      mostrarCategorias();
      dialogo.showModal();
    })
  );
  dialogo.querySelector("[data-form-categoria]").addEventListener("submit", crearCategoria);

  const lista = dialogo.querySelector("[data-lista-categorias]");
  // El nombre se guarda al salir del campo (o al apretar Enter)
  lista.addEventListener("change", (e) => {
    const campo = e.target.closest("[data-nombre-categoria]");
    if (campo) renombrarCategoria(campo.closest("[data-categoria]").dataset.categoria, campo.value.trim());
  });
  lista.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.closest("[data-nombre-categoria]")) {
      e.preventDefault();
      e.target.blur();
    }
  });
  lista.addEventListener("click", (e) => {
    const fila = e.target.closest("[data-categoria]");
    if (!fila) return;
    const mover = e.target.closest("[data-mover-categoria]");
    if (mover) moverCategoria(fila.dataset.categoria, Number(mover.dataset.moverCategoria));
    if (e.target.closest("[data-borrar-categoria]")) eliminarCategoria(fila.dataset.categoria);
  });
}
