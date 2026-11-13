// Pestaña Página: trabajos realizados, preguntas frecuentes y opiniones que se muestran en la página.
// Los tres funcionan igual (lista, formulario y ordenar con ↑ ↓); lo propio de cada uno está en TIPOS_CONTENIDO.
const contenido = { trabajos: [], preguntas: [], opiniones: [] };
let contenidoEditando = { tipo: null, item: null };
let fotoTrabajo; // undefined = sin cambios; Blob = foto nueva elegida

function nombreProducto(id) {
  return datos.productos.find((p) => p.id === id)?.nombre ?? "";
}

function mostrarFotoTrabajo(src) {
  const caja = document.querySelector("[data-foto-trabajo]");
  const imagen = caja.querySelector("img");
  imagen.hidden = !src;
  if (src) imagen.src = src;
  else imagen.removeAttribute("src");
  caja.querySelector(".admin-foto__vacia").hidden = Boolean(src);
}

const TIPOS_CONTENIDO = {
  trabajos: {
    nuevo: "Nuevo trabajo",
    editar: "Editar trabajo",
    resumen: (t) => ({ titulo: t.titulo, detalle: [t.comuna, nombreProducto(t.producto_id)].filter(Boolean).join(" · "), foto: t.foto }),
    llenar(form, t) {
      form.titulo.value = t?.titulo ?? "";
      form.comuna.value = t?.comuna ?? "";
      form.producto_id.innerHTML =
        `<option value="">Sin indicar</option>` +
        datos.productos.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join("");
      form.producto_id.value = t?.producto_id ?? "";
      fotoTrabajo = undefined;
      mostrarFotoTrabajo(rutaFoto(t?.foto));
    },
    leer: (form) => ({
      titulo: form.titulo.value.trim(),
      comuna: form.comuna.value.trim() || null,
      producto_id: form.producto_id.value || null,
      visible: form.visible.checked,
    }),
    revisar(v, item) {
      if (!item?.foto && !fotoTrabajo) return "Elige la foto del trabajo.";
      if (!v.titulo) return "Escribe un título, por ejemplo: Baño con PVC Calacatta Bronce.";
      return "";
    },
  },

  preguntas: {
    nuevo: "Nueva pregunta",
    editar: "Editar pregunta",
    resumen: (p) => ({ titulo: p.pregunta, detalle: p.respuesta }),
    llenar(form, p) {
      form.pregunta.value = p?.pregunta ?? "";
      form.respuesta.value = p?.respuesta ?? "";
    },
    leer: (form) => ({
      pregunta: form.pregunta.value.trim(),
      respuesta: form.respuesta.value.trim(),
      visible: form.visible.checked,
    }),
    revisar(v) {
      if (!v.pregunta) return "Escribe la pregunta.";
      if (!v.respuesta) return "Escribe la respuesta.";
      if (v.visible && /\[[^\]]*\]/.test(v.respuesta)) return "La respuesta todavía tiene partes entre [corchetes] por completar.";
      return "";
    },
  },

  opiniones: {
    nuevo: "Nueva opinión",
    editar: "Editar opinión",
    resumen: (o) => ({
      titulo: [o.nombre, o.comuna, o.estrellas && "★".repeat(o.estrellas)].filter(Boolean).join(" · "),
      detalle: o.texto,
    }),
    llenar(form, o) {
      form.nombre.value = o?.nombre ?? "";
      form.comuna.value = o?.comuna ?? "";
      form.texto.value = o?.texto ?? "";
      form.estrellas.value = o?.estrellas ?? "";
      form.permiso.checked = Boolean(o); // si ya estaba guardada, el permiso se dio antes
    },
    leer: (form) => ({
      nombre: form.nombre.value.trim(),
      comuna: form.comuna.value.trim() || null,
      texto: form.texto.value.trim(),
      estrellas: form.estrellas.value ? Number(form.estrellas.value) : null,
      visible: form.visible.checked,
    }),
    revisar(v, item, form) {
      if (!v.nombre) return "Escribe el nombre del cliente (puede ser solo el nombre de pila).";
      if (!v.texto) return "Escribe lo que dijo el cliente.";
      if (v.visible && !form.permiso.checked) return "Para mostrarla en la página, marca que el cliente te dio permiso.";
      return "";
    },
  },
};

// Lista de cada tipo
function filaContenido(tipo, item, posicion, total) {
  const { titulo, detalle, foto } = TIPOS_CONTENIDO[tipo].resumen(item);
  return `
    <div class="admin-contenido${item.visible ? "" : " admin-contenido--oculto"}">
      ${foto ? `<img src="${esc(rutaFoto(foto))}" alt="" loading="lazy">` : ""}
      <button type="button" class="admin-contenido__texto" data-editar="${item.id}">
        <strong>${esc(titulo)}</strong>
        <small>${item.visible ? "" : "<em>Oculta</em> · "}${esc(detalle)}</small>
      </button>
      <span class="admin-contenido__orden">
        <button type="button" data-mover="-1" data-mover-id="${item.id}" aria-label="Subir"${posicion === 0 ? " disabled" : ""}>↑</button>
        <button type="button" data-mover="1" data-mover-id="${item.id}" aria-label="Bajar"${posicion === total - 1 ? " disabled" : ""}>↓</button>
      </span>
    </div>`;
}

function mostrarContenido(tipo) {
  const lista = document.querySelector(`[data-contenido="${tipo}"] [data-lista-contenido]`);
  const items = contenido[tipo];
  lista.innerHTML = items.length
    ? items.map((item, i) => filaContenido(tipo, item, i, items.length)).join("")
    : `<p class="admin__vacio">Todavía no hay nada aquí.</p>`;
}

async function cargarContenido() {
  const tipos = Object.keys(TIPOS_CONTENIDO);
  const respuestas = await Promise.all(tipos.map((tipo) => db.from(tipo).select("*").order("orden").order("id")));
  tipos.forEach((tipo, i) => {
    if (respuestas[i].error) {
      console.error(respuestas[i].error);
      document.querySelector(`[data-contenido="${tipo}"] [data-lista-contenido]`).innerHTML =
        `<p class="admin__vacio">No se pudo cargar. Revisa tu conexión.</p>`;
      return;
    }
    contenido[tipo] = respuestas[i].data;
    mostrarContenido(tipo);
  });
}

// Formulario
function mostrarErrorContenido(dialogo, mensaje) {
  const error = dialogo.querySelector("[data-error-contenido]");
  error.textContent = mensaje;
  error.hidden = !mensaje;
}

function abrirContenido(tipo, id) {
  const item = contenido[tipo].find((x) => x.id === id) ?? null;
  contenidoEditando = { tipo, item };
  const dialogo = document.querySelector(`[data-dialogo-contenido="${tipo}"]`);
  const form = dialogo.querySelector("form");
  form.reset();
  TIPOS_CONTENIDO[tipo].llenar(form, item);
  form.visible.checked = item ? item.visible : true;
  dialogo.querySelector("[data-titulo-contenido]").textContent = item ? TIPOS_CONTENIDO[tipo].editar : TIPOS_CONTENIDO[tipo].nuevo;
  dialogo.querySelector("[data-eliminar-contenido]").hidden = !item;
  mostrarErrorContenido(dialogo, "");
  dialogo.showModal();
}

async function guardarContenido(e) {
  e.preventDefault();
  const { tipo, item } = contenidoEditando;
  const form = e.target;
  const dialogo = form.closest("dialog");
  const valores = TIPOS_CONTENIDO[tipo].leer(form);
  const problema = TIPOS_CONTENIDO[tipo].revisar(valores, item, form);
  if (problema) return mostrarErrorContenido(dialogo, problema);

  const boton = form.querySelector('[type="submit"]');
  boton.disabled = true;
  boton.textContent = "Guardando…";
  let fotoSubida = null;
  try {
    if (tipo === "trabajos" && fotoTrabajo) {
      fotoSubida = await subirFoto(fotoTrabajo, "trabajos", "trabajo");
      valores.foto = fotoSubida;
    }
    const consulta = item
      ? db.from(tipo).update(valores).eq("id", item.id)
      : db.from(tipo).insert({ ...valores, orden: Math.max(0, ...contenido[tipo].map((x) => x.orden)) + 1 });
    const { error } = await consulta.select().single();
    if (error) throw error;
    if (fotoSubida && item?.foto) borrarFotos([item.foto]).catch((fallo) => console.warn("No se pudo borrar la foto vieja", fallo));
    dialogo.close();
    avisar(item ? "Cambios guardados" : "Agregado a la página");
    await cargarContenido();
  } catch (error) {
    console.error(error);
    if (fotoSubida) borrarFotos([fotoSubida]).catch(() => {});
    mostrarErrorContenido(dialogo, "No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar";
  }
}

async function eliminarContenido(e) {
  const { tipo, item } = contenidoEditando;
  if (!item) return;
  const dialogo = e.target.closest("dialog");
  const confirma = await confirmar("¿Eliminar esto de la página?");
  if (!confirma) return;
  const { data, error } = await db.from(tipo).delete().eq("id", item.id).select("id");
  if (error || !data.length) {
    console.error(error);
    return mostrarErrorContenido(dialogo, "No se pudo eliminar. Intenta de nuevo.");
  }
  if (tipo === "trabajos") borrarFotos([item.foto]).catch((fallo) => console.warn("No se pudo borrar la foto", fallo));
  dialogo.close();
  avisar("Eliminado de la página");
  await cargarContenido();
}

// ↑ ↓: intercambia su número de orden con el de al lado
async function moverContenido(tipo, id, direccion) {
  const items = contenido[tipo];
  const posicion = items.findIndex((x) => x.id === id);
  const actual = items[posicion];
  const vecino = items[posicion + direccion];
  if (!actual || !vecino) return;
  let ordenActual = vecino.orden;
  const ordenVecino = actual.orden;
  if (ordenActual === ordenVecino) ordenActual += direccion; // tenían el mismo número
  const [uno, otro] = await Promise.all([
    db.from(tipo).update({ orden: ordenActual }).eq("id", actual.id),
    db.from(tipo).update({ orden: ordenVecino }).eq("id", vecino.id),
  ]);
  if (uno.error || otro.error) {
    console.error(uno.error ?? otro.error);
    avisar("No se pudo cambiar el orden.", "error");
  }
  await cargarContenido();
}

function prepararPagina() {
  document.querySelectorAll("[data-contenido]").forEach((seccion) => {
    const tipo = seccion.dataset.contenido;
    seccion.querySelector("[data-nuevo-contenido]").addEventListener("click", () => abrirContenido(tipo, null));
    seccion.querySelector("[data-lista-contenido]").addEventListener("click", (e) => {
      const editar = e.target.closest("[data-editar]");
      if (editar) abrirContenido(tipo, Number(editar.dataset.editar));
      const mover = e.target.closest("[data-mover]");
      if (mover) moverContenido(tipo, Number(mover.dataset.moverId), Number(mover.dataset.mover));
    });
  });
  document.querySelectorAll("[data-dialogo-contenido]").forEach((dialogo) => {
    dialogo.querySelector("form").addEventListener("submit", guardarContenido);
    dialogo.querySelector("[data-eliminar-contenido]").addEventListener("click", eliminarContenido);
  });

  // Foto del trabajo: se achica igual que las de los productos
  const campo = document.querySelector('[data-foto-trabajo] input[type="file"]');
  campo.addEventListener("change", async () => {
    const archivo = campo.files[0];
    campo.value = "";
    if (!archivo) return;
    const dialogo = campo.closest("dialog");
    try {
      fotoTrabajo = await prepararFoto(archivo);
      mostrarFotoTrabajo(URL.createObjectURL(fotoTrabajo));
      mostrarErrorContenido(dialogo, "");
    } catch (error) {
      console.error(error);
      mostrarErrorContenido(dialogo, "No se pudo leer esa foto. Prueba con una foto JPG o PNG.");
    }
  });
}
