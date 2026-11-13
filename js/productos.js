// Catálogo de respaldo: la página carga los productos desde Supabase (app.js) y usa esta lista
// solo si la base de datos no responde. Los cambios de productos se hacen en el panel.
// Catálogo armado con lo que se ve en Instagram.
// PENDIENTE: confirmar nombres de los modelos PVC (en Instagram no aparecen) y precios de vinílico,
// flotante y accesorios. precio: null muestra "Consultar".
// "unidad" define cómo se vende y cómo calcula la calculadora:
//   plancha -> m2 = m² que cubre una plancha
//   caja    -> m2 = m² que trae una caja
// imagen = foto de la plancha, ambiente = foto instalada. Sin fotos se usa la textura de muestra.
const CATEGORIAS = [
  { id: "pvc-marmol", nombre: "PVC tipo mármol", descripcion: "Planchas para muros de baños, cocinas y livings. 100% impermeables." },
  { id: "vinilico", nombre: "Piso vinílico", descripcion: "Resistente al agua, ideal para cocinas y baños." },
  { id: "flotante", nombre: "Piso flotante", descripcion: "Calidez de madera, fácil de instalar." },
  { id: "accesorios", nombre: "Accesorios", descripcion: "Adhesivos, molduras y terminaciones." },
];

const PRODUCTOS = [
  {
    id: "pvc-calacatta-bronce", categoria: "pvc-marmol", nombre: "PVC Mármol Calacatta Bronce",
    textura: "marmol-calacatta", precio: 19990, unidad: "plancha", m2: 2.98,
    imagen: "img/productos/calacatta-bronce.webp", ambiente: "img/productos/calacatta-bronce-ambiente.webp",
    detalles: ["Blanco con veta gris y bronce", "Plancha 1,22 x 2,44 m", "Espesor 3 mm", "Impermeable", "Adhesivo de regalo"],
    destacado: true, oferta: true,
  },
  {
    id: "pvc-panda-oro", categoria: "pvc-marmol", nombre: "PVC Mármol Panda Oro",
    textura: "marmol-arabescato", precio: 19990, unidad: "plancha", m2: 2.98,
    imagen: "img/productos/panda-oro.webp", ambiente: "img/productos/panda-oro-ambiente.webp",
    detalles: ["Blanco con vetas negras y doradas", "Plancha 1,22 x 2,44 m", "Espesor 3 mm", "Impermeable", "Adhesivo de regalo"],
    destacado: true, oferta: true,
  },
  {
    id: "pvc-negro-marquina", categoria: "pvc-marmol", nombre: "PVC Mármol Negro Marquina",
    textura: "marmol-negro", precio: 19990, unidad: "plancha", m2: 2.98,
    imagen: "img/productos/negro-marquina.webp", ambiente: "img/productos/negro-marquina-ambiente.webp",
    detalles: ["Negro con vetas blancas", "Plancha 1,22 x 2,44 m", "Espesor 3 mm", "Impermeable", "Adhesivo de regalo"],
    destacado: true,
  },
  {
    id: "pvc-emperador", categoria: "pvc-marmol", nombre: "PVC Mármol Emperador",
    textura: "marmol-emperador", precio: 19990, unidad: "plancha", m2: 2.98,
    imagen: "img/productos/emperador.webp", ambiente: "img/productos/emperador-ambiente.webp",
    detalles: ["Café con vetas crema", "Plancha 1,22 x 2,44 m", "Espesor 3 mm", "Impermeable", "Adhesivo de regalo"],
  },
  {
    id: "pvc-statuario", categoria: "pvc-marmol", nombre: "PVC Mármol Blanco Statuario",
    textura: "marmol-carrara", precio: 19990, unidad: "plancha", m2: 2.98,
    imagen: "img/productos/statuario.webp", ambiente: "img/productos/statuario-ambiente.webp",
    detalles: ["Blanco con vetas grises marcadas", "Plancha 1,22 x 2,44 m", "Espesor 3 mm", "Impermeable", "Adhesivo de regalo"],
  },
  {
    id: "pvc-carrara", categoria: "pvc-marmol", nombre: "PVC Mármol Blanco Carrara",
    textura: "marmol-carrara", precio: 19990, unidad: "plancha", m2: 2.98,
    imagen: "img/productos/carrara.webp", ambiente: "img/productos/carrara-ambiente.webp",
    detalles: ["Blanco con vetas grises suaves", "Plancha 1,22 x 2,44 m", "Espesor 3 mm", "Impermeable", "Adhesivo de regalo"],
  },
  {
    id: "pvc-arabescato", categoria: "pvc-marmol", nombre: "PVC Mármol Arabescato",
    textura: "marmol-arabescato", precio: 19990, unidad: "plancha", m2: 2.98,
    imagen: "img/productos/arabescato.webp", ambiente: "img/productos/arabescato-ambiente.webp",
    detalles: ["Blanco con vetas beige en diagonal", "Plancha 1,22 x 2,44 m", "Espesor 3 mm", "Impermeable", "Adhesivo de regalo"],
  },
  {
    id: "pvc-gris-piedra", categoria: "pvc-marmol", nombre: "PVC Gris Piedra",
    textura: "marmol-gris", precio: 19990, unidad: "plancha", m2: 2.98,
    imagen: "img/productos/gris-piedra.webp", ambiente: "img/productos/gris-piedra-ambiente.webp",
    detalles: ["Gris con textura de piedra", "Plancha 1,22 x 2,44 m", "Espesor 3 mm", "Impermeable", "Adhesivo de regalo"],
  },
  // Rendimiento confirmado en la reunión: vinílico 2,22 m² por caja y flotante 1,9 m² por caja.
  // PENDIENTE: son 5 flotantes y 5 vinílicos; falta saber cuáles fotos son de cada tipo
  {
    id: "vinilico-roble-claro", categoria: "vinilico", nombre: "Piso Vinílico Roble Claro",
    textura: "madera-clara", precio: null, unidad: "caja", m2: 2.22,
    imagen: "img/productos/vinilico-roble-claro.jpg",
    detalles: ["Roble claro natural", "Espesor 5 y 5,5 mm", "Resistente al agua"],
    destacado: true, oferta: true,
  },
  {
    id: "flotante-roble-moca", categoria: "flotante", nombre: "Piso Flotante Roble Moca 8 mm",
    textura: "madera-oscura", precio: null, unidad: "caja", m2: 1.9,
    imagen: "img/productos/flotante-roble-moca.jpg",
    detalles: ["Café grisáceo", "Espesor 8 mm", "Espuma de regalo", "Sistema click"],
    destacado: true, oferta: true,
  },
  {
    id: "flotante-rustico-miel", categoria: "flotante", nombre: "Piso Flotante Rústico Miel 8 mm",
    textura: "madera-miel", precio: null, unidad: "caja", m2: 1.9,
    imagen: "img/productos/flotante-rustico-miel.jpg",
    detalles: ["Miel con nudos y vetas marcadas", "Espesor 8 mm", "Espuma de regalo", "Sistema click"],
    oferta: true,
  },
  {
    id: "flotante-roble-caramelo", categoria: "flotante", nombre: "Piso Flotante Roble Caramelo 8 mm",
    textura: "madera-miel", precio: null, unidad: "caja", m2: 1.9,
    imagen: "img/productos/flotante-roble-caramelo.jpg",
    detalles: ["Café cálido", "Espesor 8 mm", "Espuma de regalo", "Sistema click"],
  },
  {
    id: "flotante-gris-humo", categoria: "flotante", nombre: "Piso Flotante Gris Humo 8 mm",
    textura: "madera-gris", precio: null, unidad: "caja", m2: 1.9,
    imagen: "img/productos/flotante-gris-humo.jpg",
    detalles: ["Gris oscuro", "Espesor 8 mm", "Espuma de regalo", "Sistema click"],
  },
  {
    id: "flotante-gris-arena", categoria: "flotante", nombre: "Piso Flotante Gris Arena 8 mm",
    textura: "madera-gris", precio: null, unidad: "caja", m2: 1.9,
    imagen: "img/productos/flotante-gris-arena.jpg",
    detalles: ["Gris con tono beige", "Espesor 8 mm", "Espuma de regalo", "Sistema click"],
  },
  {
    id: "flotante-gris-perla", categoria: "flotante", nombre: "Piso Flotante Gris Perla 8 mm",
    textura: "madera-gris", precio: null, unidad: "caja", m2: 1.9,
    imagen: "img/productos/flotante-gris-perla.jpg",
    detalles: ["Gris claro", "Espesor 8 mm", "Espuma de regalo", "Sistema click"],
  },
  {
    id: "adhesivo-montaje", categoria: "accesorios", nombre: "Adhesivo de montaje",
    textura: "accesorio", precio: null, unidad: "unidad",
    detalles: ["Para planchas PVC", "Cartucho"],
  },
  {
    id: "moldura-pvc", categoria: "accesorios", nombre: "Moldura de terminación",
    textura: "accesorio", precio: null, unidad: "unidad",
    detalles: ["Para esquinas y bordes", "Varios colores"],
  },
];
