// Panel de administración: login, menú y arranque.
// Solo entran las cuentas que están en la tabla "admins" (la base lo revisa con RLS).
function mostrarVista(nombre) {
  document.querySelector("[data-cargando]").hidden = true;
  document.querySelectorAll("[data-vista]").forEach((vista) => {
    vista.hidden = vista.dataset.vista !== nombre;
  });
}

// Secciones del menú
function abrirPestana(nombre) {
  document.querySelectorAll("[data-pestana]").forEach((boton) => {
    boton.setAttribute("aria-selected", boton.dataset.pestana === nombre);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== nombre;
  });
  window.scrollTo(0, 0);
  if (nombre === "ventas") cargarVentas();
  if (nombre === "cotizaciones") cargarCotizaciones();
  if (nombre === "resumen") cargarResumen();
  if (nombre === "pagina") cargarContenido();
  if (nombre === "productos" && !document.querySelector('[data-subvista="stock"]').hidden) cargarRegistroStock();
}

function pestanaAbierta() {
  return document.querySelector('[data-pestana][aria-selected="true"]').dataset.pestana;
}

function prepararPestanas() {
  document.querySelector(".app__nav").addEventListener("click", (e) => {
    const boton = e.target.closest("[data-pestana]");
    if (boton) abrirPestana(boton.dataset.pestana);
  });
  // Cambiar el mes en Inicio o Ventas recarga la sección abierta
  document.querySelectorAll("[data-mes]").forEach((campo) => {
    campo.addEventListener("change", () => {
      usarMes(campo.value);
      abrirPestana(pestanaAbierta());
    });
  });
  // Enlaces a otra sección ("Ver todas") y accesos rápidos del Inicio
  document.addEventListener("click", (e) => {
    const ir = e.target.closest("[data-ir-pestana]");
    if (ir) abrirPestana(ir.dataset.irPestana);
    // "Ver en Ventas" desde la caja del día: abre Ventas en el día de hoy
    if (e.target.closest("[data-ver-ventas-hoy]")) verVentasDelDia(fechaHoy());
    // Marcar un despacho como entregado (o devolverlo a pendiente), en Inicio o en Ventas
    const despacho = e.target.closest("[data-despacho-venta]");
    if (despacho) {
      despacho.disabled = true;
      cambiarEstadoDespacho(Number(despacho.dataset.despachoVenta), despacho.dataset.estado).then((listo) => {
        if (!listo) despacho.disabled = false;
        else if (pestanaAbierta() === "resumen") cargarResumen();
        else cargarVentas();
      });
    }
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "nueva-venta") abrirRegistroVenta();
    if (accion === "nuevo-producto") abrirEditor(null);
  });
}

// Login
async function mostrarPanel(usuario) {
  const { data: admin } = await db.from("admins").select("nombre, rol").eq("user_id", usuario.id).maybeSingle();
  if (!admin) {
    mostrarVista("sin-acceso");
    return;
  }
  document.querySelector("[data-nombre]").textContent = admin.nombre;
  document.querySelector("[data-rol]").textContent = admin.rol === "dueno" ? "Dueño" : "Vendedor";
  document.querySelector("[data-inicial]").textContent = admin.nombre.trim().charAt(0).toUpperCase() || "?";
  document.querySelector("[data-saludo]").textContent = `Hola, ${admin.nombre}`;
  mostrarVista("panel");
  document.querySelector("[data-lista-productos]").innerHTML = `<p class="admin__vacio">Cargando productos…</p>`;
  contarPendientes();
  // El Inicio usa los productos (stock bajo), por eso se cargan primero
  await recargarProductos();
  abrirPestana("resumen");
}

function prepararLogin() {
  const form = document.querySelector("[data-form-login]");
  const error = document.querySelector("[data-error-login]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    const boton = form.querySelector("button");
    boton.disabled = true;
    boton.textContent = "Entrando…";
    const { data, error: fallo } = await db.auth.signInWithPassword({
      email: form.correo.value.trim(),
      password: form.clave.value,
    });
    boton.disabled = false;
    boton.textContent = "Entrar";
    if (fallo) {
      error.textContent = "Correo o clave incorrectos.";
      error.hidden = false;
      return;
    }
    form.reset();
    mostrarPanel(data.user);
  });

  // Hay botón de salir en el menú, en la barra del celular y en "Sin acceso"
  document.querySelectorAll("[data-salir]").forEach((boton) =>
    boton.addEventListener("click", async () => {
      await db.auth.signOut();
      mostrarVista("login");
    })
  );
}

async function iniciar() {
  usarMes(mesActual());
  prepararLogin();
  prepararPestanas();
  prepararProductos();
  prepararCategorias();
  prepararVentas();
  prepararRegistroStock();
  prepararCotizaciones();
  prepararResumen();
  prepararPagina();
  const { data } = await db.auth.getSession();
  if (data.session) mostrarPanel(data.session.user);
  else mostrarVista("login");
}

iniciar();
