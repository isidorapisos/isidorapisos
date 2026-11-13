// Datos del negocio. Todo lo marcado con PENDIENTE hay que confirmarlo con el cliente.
const NEGOCIO = {
  nombre: "Isidora",
  subtitulo: "Venta de Materiales",
  eslogan: "Materiales de remodelación para transformar tus espacios",
  direccion: "Tucapel 75, San Pedro de la Paz",
  referencia: "Mercado San Pedro",
  // Formato 569XXXXXXXX, sin + ni espacios. Confirmados en la reunión (el mismo número de Instagram)
  whatsapp: "56971438253",
  telefonoVisible: "+56 9 7143 8253",
  correo: "ventasisidorapisos@gmail.com",
  // Horas sacadas del reel de Instagram del 13/10. PENDIENTE: confirmar qué días atiende
  horario: [
    { dias: "Lunes a sábado", horas: "10:00 – 14:00 y 14:45 – 19:30" },
  ],
  instagram: "isidora_pisos",
  // Link completo. Si queda vacío, el botón de Facebook no se muestra
  facebook: "https://www.facebook.com/people/Isidora-Pisos/61589477560521/",
  despacho: "Despacho gratis en San Pedro de la Paz",
  mapa: "https://www.google.com/maps?q=Tucapel+75,+San+Pedro+de+la+Paz,+Chile&output=embed",
  comoLlegar: "https://www.google.com/maps/dir/?api=1&destination=Tucapel+75,+San+Pedro+de+la+Paz,+Chile",
};

// Base de datos (Supabase). La clave es la pública: puede ir en la página,
// lo que protege los datos son los permisos (RLS) configurados en la base.
const SUPABASE = {
  url: "https://bocsghxjztchyogpvcyj.supabase.co",
  clave: "sb_publishable_t9tVPeqjT1Lpy6G8kVcw8A_phxldgYv",
};
