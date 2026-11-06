/* ==================================================================
   CUADRO BROS
   Juego de plataformas hecho con Phaser 3: personajes y escenarios
   son cuadrados de colores. 5 niveles + jefe final.
   ================================================================== */
'use strict';

/* ------------------------------------------------------------------
   CONSTANTES GENERALES
   ------------------------------------------------------------------ */
const TAM = 32;                       // tamaño de cada casilla en píxeles
const FILAS = 14;                     // filas visibles del mapa
const ANCHO_PANTALLA = 800;           // ancho lógico del juego
const ALTO_PANTALLA = FILAS * TAM;    // alto lógico del juego (448)
const VEL_MAX = 190;                  // velocidad máxima horizontal
const SALTO = 600;                    // fuerza del salto
const GRAVEDAD = 1250;                // gravedad del mundo
const CLAVE_GUARDADO = 'cuadroBros.v1';
const ORDEN_TEMAS = ['clasico', 'oscuro', 'contraste'];
const FUENTE = '"Courier New", Courier, monospace';

/* ------------------------------------------------------------------
   ESTADO GLOBAL
   ------------------------------------------------------------------ */
// Datos que se guardan en localStorage
let guardado = { nivelMax: 0, mejor: 0, tema: 'clasico', silencio: false };
let almacenamientoOk = true;

// Zoom de la cámara del nivel (botones 🔍+ y 🔍− de la barra superior)
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_PASO = 0.25;
let zoomJuego = 1;

// Datos de la partida en curso
let partida = { puntos: 0, monedas: 0, vidas: 3, grande: false };

// Entrada táctil compartida entre la interfaz y el juego
const ENTRADA = { x: 0, salto: false };

let juego = null;                     // instancia de Phaser.Game

/* ------------------------------------------------------------------
   TEMAS DE COLOR (mejor lectura): clásico, oscuro y alto contraste
   ------------------------------------------------------------------ */
const TEMAS = {
  clasico: {
    nombre: 'Clásico',
    jugador: 0xe52521, enemigo: 0x8b4513, cauteloso: 0xff8c00,
    volador: 0xff5fa2, espinoso: 0x8e24aa, moneda: 0xffd700,
    pregunta: 0xf8b800, preguntaMarca: 0x7a4a00, usado: 0x8d7b68,
    poder: 0xd62828, tubo: 0x1faa3c, pinchos: 0xe0e0e0,
    jefe: 0x5e1a9a, fuego: 0xff5722, lava: 0xff4500, bandera: 0x2ecc71
  },
  oscuro: {
    nombre: 'Oscuro',
    jugador: 0xff6f61, enemigo: 0xb07a4a, cauteloso: 0xffa94d,
    volador: 0xff8ec0, espinoso: 0xb26bd6, moneda: 0xffe066,
    pregunta: 0xe0a800, preguntaMarca: 0x5a3a00, usado: 0x6e6256,
    poder: 0xff5c5c, tubo: 0x2fbf55, pinchos: 0xcfd8dc,
    jefe: 0x7b3fb5, fuego: 0xff7043, lava: 0xff5722, bandera: 0x4cd98a
  },
  contraste: {
    nombre: 'Alto contraste',
    jugador: 0xffeb3b, enemigo: 0xff1744, cauteloso: 0xff9100,
    volador: 0xff40ff, espinoso: 0xb388ff, moneda: 0x76ff03,
    pregunta: 0xffab00, preguntaMarca: 0x000000, usado: 0x9e9e9e,
    poder: 0xff1744, tubo: 0x00ff00, pinchos: 0xffffff,
    jefe: 0xd500f9, fuego: 0xff6d00, lava: 0xff1744, bandera: 0x00e676
  }
};

/* ------------------------------------------------------------------
   UTILIDADES
   ------------------------------------------------------------------ */
// Oscurece / aclara un color entero (porcentaje 0-100)
const tono = (c, p) => Phaser.Display.Color.IntegerToColor(c).darken(p).color;
const aclarar = (c, p) => Phaser.Display.Color.IntegerToColor(c).lighten(p).color;

// Estilo de texto del juego (fuente monoespaciada con contorno negro)
function estiloTexto(tam, extra) {
  return Object.assign({
    fontFamily: FUENTE, fontSize: tam + 'px', fontStyle: 'bold',
    color: '#ffffff', stroke: '#000000', strokeThickness: Math.max(4, Math.round(tam / 8))
  }, extra);
}

// Texto de atajo de teclado: en pantallas táctiles no tiene sentido mostrarlo
function atajo(tecla) {
  return esDispositivoTactil() ? '' : '  (' + tecla + ')';
}

// Borde de las figuras: blanco en alto contraste, más oscuro en el resto
const borde = (c) => (guardado.tema === 'contraste' ? 0xffffff : tono(c, 35));

// Adapta los colores del nivel (cielo, suelo, ladrillo) al tema elegido
function ajustar(tema, tipo, base) {
  if (tema === 'clasico') return base;
  if (tema === 'oscuro') {
    const f = { cielo: 55, suelo: 20, ladrillo: 20 }[tipo];
    return tono(base, f);
  }
  return { cielo: 0x000000, suelo: 0xffffff, ladrillo: 0x00e5ff }[tipo];
}

// Mueve un valor hacia un objetivo sin pasarse
function aproximar(valor, objetivo, paso) {
  return valor < objetivo ? Math.min(valor + paso, objetivo) : Math.max(valor - paso, objetivo);
}

// Aviso breve en la parte inferior de la página
let temporizadorAviso = null;
function mostrarAviso(texto) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = texto;
  el.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visible'), 2200);
}

/* ------------------------------------------------------------------
   SONIDOS (WebAudio, sin archivos externos)
   ------------------------------------------------------------------ */
const SONIDOS = {
  salto:  { tipo: 'square',   f1: 300, f2: 700,  dur: 0.15 },
  moneda: { tipo: 'square',   f1: 900, f2: 1400, dur: 0.12 },
  pisar:  { tipo: 'square',   f1: 400, f2: 120,  dur: 0.12 },
  poder:  { tipo: 'square',   f1: 300, f2: 1200, dur: 0.35 },
  herir:  { tipo: 'sawtooth', f1: 400, f2: 80,   dur: 0.4 },
  bloque: { tipo: 'square',   f1: 150, f2: 100,  dur: 0.08 },
  romper: { tipo: 'sawtooth', f1: 200, f2: 60,   dur: 0.15 },
  meta:   { tipo: 'triangle', f1: 500, f2: 1500, dur: 0.6 },
  golpe:  { tipo: 'sawtooth', f1: 250, f2: 60,   dur: 0.25 },
  vida:   { tipo: 'square',   f1: 600, f2: 1800, dur: 0.4 }
};
let audioCtx = null;

// Crea (o reanuda) el contexto de audio. iOS y Chrome solo lo permiten
// dentro de un gesto del usuario, por eso también se llama en el primer toque.
function prepararAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { audioCtx = null; }
  return audioCtx;
}

function sfx(nombre) {
  if (guardado.silencio) return;
  try {
    if (!prepararAudio()) return;
    const cfg = SONIDOS[nombre];
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = cfg.tipo;
    osc.frequency.setValueAtTime(cfg.f1, t);
    osc.frequency.exponentialRampToValueAtTime(cfg.f2, t + cfg.dur);
    vol.gain.setValueAtTime(0.07, t);
    vol.gain.exponentialRampToValueAtTime(0.001, t + cfg.dur);
    osc.connect(vol);
    vol.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + cfg.dur);
  } catch (e) { /* si el audio falla, el juego sigue sin sonido */ }
}

/* ------------------------------------------------------------------
   GUARDADO EN LOCALSTORAGE (si no se puede, se pregunta qué hacer)
   ------------------------------------------------------------------ */
function preguntarSinGuardar() {
  return window.confirm(
    'No se puede guardar el progreso en este navegador (almacenamiento local bloqueado).\n\n' +
    'Aceptar: jugar sin guardar.\nCancelar: reintentar guardar.'
  );
}

function probarAlmacenamiento() {
  try {
    localStorage.setItem('__prueba__', '1');
    localStorage.removeItem('__prueba__');
    return true;
  } catch (e) {
    return false;
  }
}

// Comprueba al iniciar; si falla pregunta al jugador (máximo 2 reintentos)
function comprobarAlmacenamiento() {
  almacenamientoOk = probarAlmacenamiento();
  let intentos = 0;
  while (!almacenamientoOk && intentos < 2) {
    if (preguntarSinGuardar()) break;
    almacenamientoOk = probarAlmacenamiento();
    intentos++;
  }
}

function cargar() {
  if (!almacenamientoOk) return;
  try {
    const texto = localStorage.getItem(CLAVE_GUARDADO);
    if (texto) guardado = Object.assign(guardado, JSON.parse(texto));
  } catch (e) { /* datos dañados: se usan los valores por defecto */ }
  if (!TEMAS[guardado.tema]) guardado.tema = 'clasico';
}

function guardar() {
  if (!almacenamientoOk) return;
  try {
    localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(guardado));
  } catch (e) {
    almacenamientoOk = false;
    // Falló a mitad de partida: se pregunta si reintentar o seguir sin guardar
    if (!preguntarSinGuardar()) {
      almacenamientoOk = probarAlmacenamiento();
      if (almacenamientoOk) guardar();
    }
  }
}

// Guarda el mejor puntaje y el nivel más avanzado alcanzado
function registrarPuntaje() {
  if (partida.puntos > guardado.mejor) guardado.mejor = partida.puntos;
  guardar();
}

function guardarProgreso(nivel) {
  if (nivel > guardado.nivelMax) guardado.nivelMax = nivel;
  registrarPuntaje();
}

function reiniciarPartida() {
  partida = { puntos: 0, monedas: 0, vidas: 3, grande: false };
}

/* ------------------------------------------------------------------
   PÁGINA: tema, compartir y bloqueo de selección
   ------------------------------------------------------------------ */
function aplicarTemaPagina() {
  document.documentElement.setAttribute('data-tema', guardado.tema);
}

// Cambia al siguiente tema (solo fuera de una partida en curso)
function siguienteTema() {
  if (juego && (juego.scene.isActive('Juego') || juego.scene.isPaused('Juego'))) {
    mostrarAviso('Cambia el tema desde el menú principal');
    return;
  }
  const i = ORDEN_TEMAS.indexOf(guardado.tema);
  guardado.tema = ORDEN_TEMAS[(i + 1) % ORDEN_TEMAS.length];
  guardar();
  aplicarTemaPagina();
  mostrarAviso('Tema: ' + TEMAS[guardado.tema].nombre);
  // Si estamos en el menú, se reinicia para regenerar los colores
  if (juego && juego.scene.isActive('Menu')) juego.scene.getScene('Menu').scene.restart();
}

// Compartir: usa el menú nativo del celular/PC; si no existe, copia el enlace
async function compartir() {
  const datos = {
    title: 'Cuadro Bros',
    text: '¡Juega Cuadro Bros! Plataformas con cuadrados de colores, 5 niveles y un jefe final.',
    url: window.location.href
  };
  if (navigator.share) {
    try {
      await navigator.share(datos);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // el usuario canceló
    }
  }
  try {
    await navigator.clipboard.writeText(datos.url);
    mostrarAviso('Enlace copiado al portapapeles');
  } catch (e) {
    window.prompt('Copia este enlace para compartir:', datos.url);
  }
}

// Bloquea seleccionar, copiar, pegar, arrastrar y menú contextual
function bloquearSeleccion() {
  ['selectstart', 'copy', 'cut', 'paste', 'contextmenu', 'dragstart'].forEach((ev) => {
    document.addEventListener(ev, (e) => e.preventDefault());
  });
}

// Evita que el navegador agrande (zoom) la página.
// El meta viewport con "user-scalable=no" y el CSS "touch-action: none" lo
// bloquean en la mayoría de navegadores, pero iOS Safari y algunos Android
// lo ignoran, y en computador existen la rueda con Ctrl y los atajos de
// teclado. Por eso también se bloquea por código en cada caso.
function bloquearZoom() {
  const opciones = { passive: false };
  const cancelar = (e) => e.preventDefault();

  // Pellizcar con dos dedos en iOS (Safari lanza eventos "gesture")
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => {
    document.addEventListener(ev, cancelar, opciones);
  });

  // Pellizcar con dos dedos en el resto de navegadores. Solo se cancela el
  // gesto del navegador: el joystick y el botón de salto usan "pointer
  // events", así que se pueden usar a la vez con dos dedos.
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, opciones);

  // Doble toque rápido en cualquier parte de la página. Los botones se
  // excluyen para no perder toques seguidos (por ejemplo, SALTAR o los
  // botones de zoom de la cámara); ellos ya están cubiertos por el CSS.
  let ultimoToque = 0;
  document.addEventListener('touchend', (e) => {
    const ahora = Date.now();
    const enBoton = e.target instanceof Element && e.target.closest('button');
    if (!enBoton && ahora - ultimoToque < 350) e.preventDefault();
    ultimoToque = ahora;
  }, opciones);
  document.addEventListener('dblclick', cancelar, opciones);

  // Computador: Ctrl + rueda del ratón (o pellizco en el touchpad)
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }, opciones);

  // Computador: Ctrl/Cmd con + - = 0 (acercar, alejar y restablecer)
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (['+', '-', '=', '_', '0', 'Add', 'Subtract'].includes(e.key)) e.preventDefault();
  }, opciones);
}

// Acerca (paso > 0) o aleja (paso < 0) la cámara del nivel.
// El valor se recuerda para los niveles siguientes.
function cambiarZoom(paso) {
  const nuevo = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomJuego + paso)) * 100) / 100;
  if (nuevo === zoomJuego) {
    mostrarAviso(paso > 0 ? 'Zoom máximo' : 'Zoom mínimo');
    return;
  }
  zoomJuego = nuevo;
  if (juego && juego.scene) {
    const escena = juego.scene.getScene('Juego');
    if (escena && escena.sys.isActive() && escena.cameras && escena.cameras.main) {
      escena.cameras.main.setZoom(zoomJuego);
    }
  }
  mostrarAviso('Zoom: ' + Math.round(zoomJuego * 100) + '%');
}

/* ------------------------------------------------------------------
   BOTONES MENÚ Y REINICIAR (HTML, flotantes en celular)
   ------------------------------------------------------------------ */
// Indica en qué pantalla está el juego ('menu', 'juego' o 'fin'), activa o
// desactiva el botón Menú y cambia el botón Jugar / Reintentar
function marcarEscena(estado) {
  const btnMenu = document.getElementById('btn-menu');
  const btnJugar = document.getElementById('btn-jugar');
  if (btnMenu) btnMenu.disabled = estado === 'menu';
  if (!btnJugar) return;
  const reintentar = estado !== 'menu';
  const texto = reintentar ? 'Reintentar' : 'Jugar';
  document.getElementById('jugar-icono').textContent = reintentar ? '↻' : '▶';
  document.getElementById('jugar-texto').textContent = ' ' + texto;
  btnJugar.setAttribute('aria-label', texto);
  btnJugar.title = texto;
}

// Cierra lo que esté en marcha y vuelve al menú principal
function irAlMenuPrincipal() {
  if (!juego) return;
  ['Interfaz', 'Juego', 'Fin'].forEach((clave) => {
    if (juego.scene.isActive(clave) || juego.scene.isPaused(clave)) juego.scene.stop(clave);
  });
  juego.scene.start('Menu');
}

// Botón Jugar / Reintentar: en el menú empieza una partida; durante el juego
// o en la pantalla final vuelve a empezar el nivel con una partida nueva
function jugarOReintentar() {
  if (!juego) return;
  const sc = juego.scene;
  const enJuego = sc.getScene('Juego');
  const enFin = sc.getScene('Fin');
  if (enJuego && (enJuego.sys.isActive() || enJuego.sys.isPaused())) {
    reiniciarPartida();
    sc.start('Juego', { nivel: enJuego.indice });
  } else if (enFin && enFin.sys.isActive()) {
    enFin.reintentar();
  } else {
    reiniciarPartida();
    sc.start('Juego', { nivel: 0 });
  }
}

// Atajos de mando: avisa al conectar y desconectar un joystick
function vigilarMandos() {
  window.addEventListener('gamepadconnected', () => mostrarAviso('🎮 Mando conectado'));
  window.addEventListener('gamepaddisconnected', () => mostrarAviso('🎮 Mando desconectado'));
}

// Recalcula el tamaño del juego cuando cambia el espacio disponible:
// al girar el celular o cuando la barra del navegador aparece o se oculta.
function vigilarTamano() {
  let pendiente = null;
  const refrescar = () => {
    clearTimeout(pendiente);
    // Se espera un instante porque, al girar, el navegador tarda en
    // actualizar sus medidas y Phaser leería valores viejos.
    pendiente = setTimeout(() => {
      if (juego && juego.scale) juego.scale.refresh();
    }, 150);
  };
  window.addEventListener('resize', refrescar);
  window.addEventListener('orientationchange', refrescar);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', refrescar);
  }
}

/* ------------------------------------------------------------------
   TEXTURAS (todo se dibuja con rectángulos, sin imágenes externas)
   ------------------------------------------------------------------ */
// Crea (o reemplaza) una textura dibujando con Graphics
function crearTextura(escena, clave, w, h, dibujar) {
  if (escena.textures.exists(clave)) escena.textures.remove(clave);
  const g = escena.make.graphics({ x: 0, y: 0, add: false });
  dibujar(g);
  g.generateTexture(clave, w, h);
  g.destroy();
}

// Rectángulo relleno con un color
function rect(g, color, x, y, w, h) {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, h);
}

// Dibujo de la interrogación de los bloques (cuadrícula 5x7)
const PATRON_INTERROGACION = ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'];

// Texturas que dependen solo del tema (personajes, objetos, enemigos)
function crearTexturasBase(escena) {
  const t = TEMAS[guardado.tema];

  // Jugador pequeño y grande (el ojo indica hacia dónde mira)
  crearTextura(escena, 'jugador', 28, 28, (g) => {
    rect(g, borde(t.jugador), 0, 0, 28, 28);
    rect(g, t.jugador, 2, 2, 24, 24);
    rect(g, borde(t.jugador), 2, 2, 24, 6);
    rect(g, 0xffffff, 16, 10, 7, 8);
    rect(g, 0x000000, 19, 12, 4, 5);
  });
  crearTextura(escena, 'jugadorG', 28, 48, (g) => {
    rect(g, borde(t.jugador), 0, 0, 28, 48);
    rect(g, t.jugador, 2, 2, 24, 44);
    rect(g, borde(t.jugador), 2, 2, 24, 8);
    rect(g, 0xffffff, 16, 14, 7, 9);
    rect(g, 0x000000, 19, 16, 4, 5);
  });

  // Enemigo caminante y enemigo cauteloso (no se cae de los bordes)
  const cara = (g, color) => {
    rect(g, borde(color), 0, 0, 28, 28);
    rect(g, color, 2, 2, 24, 24);
    rect(g, 0xffffff, 5, 9, 7, 8);
    rect(g, 0xffffff, 16, 9, 7, 8);
    rect(g, 0x000000, 8, 12, 4, 5);
    rect(g, 0x000000, 16, 12, 4, 5);
    rect(g, 0x000000, 4, 6, 9, 3);
    rect(g, 0x000000, 15, 6, 9, 3);
  };
  crearTextura(escena, 'enemigo', 28, 28, (g) => cara(g, t.enemigo));
  crearTextura(escena, 'cauteloso', 28, 28, (g) => cara(g, t.cauteloso));

  // Enemigo volador (alas blancas en las esquinas)
  crearTextura(escena, 'volador', 28, 28, (g) => {
    cara(g, t.volador);
    rect(g, 0xffffff, 0, 0, 5, 8);
    rect(g, 0xffffff, 23, 0, 5, 8);
  });

  // Enemigo espinoso (no se puede pisar)
  crearTextura(escena, 'espinoso', 28, 28, (g) => {
    rect(g, borde(t.espinoso), 0, 10, 28, 18);
    rect(g, t.espinoso, 2, 12, 24, 14);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(0, 11, 7, 0, 14, 11);
    g.fillTriangle(14, 11, 21, 0, 28, 11);
    rect(g, 0xffffff, 6, 15, 6, 6);
    rect(g, 0xffffff, 16, 15, 6, 6);
    rect(g, 0x000000, 8, 17, 3, 4);
    rect(g, 0x000000, 17, 17, 3, 4);
  });

  // Moneda
  crearTextura(escena, 'moneda', 16, 20, (g) => {
    rect(g, tono(t.moneda, 40), 0, 0, 16, 20);
    rect(g, t.moneda, 2, 2, 12, 16);
    rect(g, aclarar(t.moneda, 40), 5, 4, 3, 12);
  });

  // Potenciador (hace crecer al jugador)
  crearTextura(escena, 'poder', 26, 26, (g) => {
    rect(g, borde(t.poder), 0, 0, 26, 18);
    rect(g, t.poder, 2, 2, 22, 14);
    rect(g, 0xffffff, 4, 4, 6, 6);
    rect(g, 0xffffff, 16, 4, 6, 6);
    rect(g, 0xfff3c4, 6, 18, 14, 8);
    rect(g, 0x000000, 9, 20, 2, 3);
    rect(g, 0x000000, 15, 20, 2, 3);
  });

  // Bloque con interrogación y bloque usado
  crearTextura(escena, 'pregunta', 32, 32, (g) => {
    rect(g, borde(t.pregunta), 0, 0, 32, 32);
    rect(g, t.pregunta, 2, 2, 28, 28);
    PATRON_INTERROGACION.forEach((fila, j) => {
      [...fila].forEach((c, i) => {
        if (c === '#') rect(g, t.preguntaMarca, 8 + i * 3, 5 + j * 3, 3, 3);
      });
    });
  });
  crearTextura(escena, 'usado', 32, 32, (g) => {
    rect(g, borde(t.usado), 0, 0, 32, 32);
    rect(g, t.usado, 2, 2, 28, 28);
    rect(g, borde(t.usado), 6, 6, 4, 4);
    rect(g, borde(t.usado), 22, 6, 4, 4);
    rect(g, borde(t.usado), 6, 22, 4, 4);
    rect(g, borde(t.usado), 22, 22, 4, 4);
  });

  // Tuberías (cuerpo y borde superior)
  crearTextura(escena, 'tubo', 32, 32, (g) => {
    rect(g, borde(t.tubo), 0, 0, 32, 32);
    rect(g, t.tubo, 3, 0, 26, 32);
    rect(g, aclarar(t.tubo, 35), 6, 0, 5, 32);
  });
  crearTextura(escena, 'tuboTop', 32, 32, (g) => {
    rect(g, borde(t.tubo), 0, 0, 32, 32);
    rect(g, t.tubo, 2, 2, 28, 28);
    rect(g, aclarar(t.tubo, 35), 5, 2, 5, 28);
  });

  // Pinchos y lava
  crearTextura(escena, 'pinchos', 32, 16, (g) => {
    g.fillStyle(t.pinchos, 1);
    for (let i = 0; i < 3; i++) g.fillTriangle(i * 10.67, 16, i * 10.67 + 5.33, 0, i * 10.67 + 10.67, 16);
  });
  crearTextura(escena, 'lava', 32, 32, (g) => {
    rect(g, t.lava, 0, 0, 32, 32);
    rect(g, aclarar(t.lava, 30), 0, 0, 32, 6);
    rect(g, aclarar(t.lava, 30), 8, 14, 6, 4);
    rect(g, aclarar(t.lava, 30), 20, 22, 6, 4);
  });

  // Bola de fuego del jefe
  crearTextura(escena, 'fuego', 14, 14, (g) => {
    rect(g, t.fuego, 0, 0, 14, 14);
    rect(g, 0xffeb3b, 4, 4, 6, 6);
  });

  // Jefe final (cuadrado grande con corona)
  crearTextura(escena, 'jefe', 80, 80, (g) => {
    rect(g, 0xffd700, 6, 0, 14, 14);
    rect(g, 0xffd700, 33, 0, 14, 14);
    rect(g, 0xffd700, 60, 0, 14, 14);
    rect(g, 0xffd700, 6, 10, 68, 6);
    rect(g, borde(t.jefe), 0, 16, 80, 64);
    rect(g, t.jefe, 3, 19, 74, 58);
    rect(g, 0xffffff, 14, 34, 16, 14);
    rect(g, 0xffffff, 50, 34, 16, 14);
    rect(g, 0xff1744, 20, 38, 8, 8);
    rect(g, 0xff1744, 52, 38, 8, 8);
    rect(g, 0x000000, 12, 30, 22, 5);
    rect(g, 0x000000, 46, 30, 22, 5);
    rect(g, 0x000000, 20, 58, 40, 10);
    rect(g, 0xffffff, 24, 58, 6, 5);
    rect(g, 0xffffff, 37, 58, 6, 5);
    rect(g, 0xffffff, 50, 58, 6, 5);
  });

  // Meta: poste y bandera
  crearTextura(escena, 'poste', 12, 288, (g) => {
    rect(g, 0xffd700, 0, 0, 12, 12);
    rect(g, 0xffffff, 2, 12, 8, 276);
  });
  crearTextura(escena, 'bandera', 32, 22, (g) => {
    g.fillStyle(t.bandera, 1);
    g.fillTriangle(0, 0, 32, 11, 0, 22);
  });

  // Decoración de fondo
  crearTextura(escena, 'nube', 64, 24, (g) => {
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(0, 10, 64, 14);
    g.fillRect(12, 2, 24, 10);
    g.fillRect(32, 5, 22, 8);
  });
  crearTextura(escena, 'estrella', 4, 4, (g) => rect(g, 0xffffff, 0, 0, 4, 4));
}

// Texturas que dependen del nivel y del tema (suelo, ladrillo)
function crearTexturasNivel(escena, def) {
  const tema = guardado.tema;
  const cSuelo = ajustar(tema, 'suelo', def.suelo);
  const cLad = ajustar(tema, 'ladrillo', def.ladrillo);

  // Bloque sólido con relieve
  crearTextura(escena, 'suelo', 32, 32, (g) => {
    rect(g, tono(cSuelo, 40), 0, 0, 32, 32);
    rect(g, cSuelo, 2, 2, 28, 28);
    rect(g, aclarar(cSuelo, 25), 2, 2, 28, 3);
    rect(g, aclarar(cSuelo, 25), 2, 2, 3, 28);
  });

  // Ladrillo con juntas
  crearTextura(escena, 'ladrillo', 32, 32, (g) => {
    const junta = tono(cLad, 45);
    rect(g, cLad, 0, 0, 32, 32);
    rect(g, junta, 0, 0, 32, 2);
    rect(g, junta, 0, 15, 32, 2);
    rect(g, junta, 0, 30, 32, 2);
    rect(g, junta, 15, 0, 2, 15);
    rect(g, junta, 7, 17, 2, 13);
    rect(g, junta, 23, 17, 2, 13);
  });

  // Trozos al romper un ladrillo
  crearTextura(escena, 'trozo', 8, 8, (g) => rect(g, cLad, 0, 0, 8, 8));
}

/* ------------------------------------------------------------------
   DEFINICIÓN DE NIVELES
   Coordenadas en casillas: x (columna), y (fila 0 arriba, el suelo
   está en las filas 12 y 13).
   huecos:      [x, ancho]            -> sin suelo
   tuberias:    [x, alto]             -> tubería de 2 casillas de ancho
   bloques:     [x, y, tipo]          -> '?' monedas, 'U' potenciador, 'B' ladrillo
   plataformas: [x, y, largo, tipo]   -> 'B' ladrillo, '#' sólido
   monedas:     [x, y, cantidad]      -> fila de monedas
   enemigos:    [tipo, x, y?]         -> g caminante, r cauteloso, f volador, s espinoso
   pinchos:     [x, cantidad]         -> pinchos sobre el suelo
   ------------------------------------------------------------------ */
const NIVELES = [
  // ----- Nivel 1: Llanura -----
  {
    nombre: 'Llanura', cielo: 0x5c94fc, suelo: 0xc84c0c, ladrillo: 0xd8742c,
    deco: 'nubes', tiempo: 300, ancho: 120,
    huecos: [[32, 2], [62, 3], [88, 3]],
    tuberias: [[40, 2], [48, 3], [56, 2], [78, 2]],
    bloques: [
      [14, 8, '?'], [18, 8, 'B'], [19, 8, 'U'], [20, 8, 'B'], [21, 8, '?'], [22, 8, 'B'],
      [68, 8, '?'], [69, 8, 'B'], [70, 8, '?'], [100, 8, '?'], [101, 8, 'B'], [102, 8, '?']
    ],
    plataformas: [[92, 7, 4, 'B']],
    monedas: [[10, 10, 3], [15, 6, 3], [34, 9, 2], [44, 6, 2], [50, 7, 3], [60, 8, 3], [90, 8, 2], [93, 5, 2]],
    enemigos: [
      ['g', 16], ['g', 24], ['g', 28], ['g', 44], ['g', 52],
      ['g', 66], ['g', 72], ['g', 82], ['g', 96], ['g', 100]
    ]
  },
  // ----- Nivel 2: Cueva -----
  {
    nombre: 'Cueva', cielo: 0x000000, suelo: 0x0058f8, ladrillo: 0x3c8cfc,
    deco: null, techo: true, tiempo: 300, ancho: 130,
    huecos: [[28, 2], [44, 3], [70, 4], [96, 3]],
    tuberias: [[20, 3], [36, 2], [52, 3], [58, 2], [84, 3], [110, 2]],
    bloques: [
      [12, 8, '?'], [13, 8, 'U'], [14, 8, '?'], [48, 8, '?'], [49, 8, '?'], [50, 8, '?'],
      [90, 8, 'U'], [91, 8, 'B'], [92, 8, '?'], [104, 8, '?']
    ],
    plataformas: [[24, 8, 3, 'B'], [40, 7, 4, 'B'], [64, 8, 3, 'B'], [74, 7, 3, 'B'], [100, 8, 4, 'B']],
    monedas: [[8, 10, 4], [25, 6, 3], [41, 5, 4], [65, 6, 3], [75, 5, 3], [101, 6, 4]],
    enemigos: [
      ['g', 16], ['g', 24], ['r', 32], ['g', 40], ['r', 47], ['g', 55], ['g', 62],
      ['r', 67], ['g', 80], ['s', 88], ['g', 93], ['r', 101], ['g', 106], ['g', 108]
    ]
  },
  // ----- Nivel 3: Desierto (pinchos) -----
  {
    nombre: 'Desierto', cielo: 0xf08848, suelo: 0xd8a85c, ladrillo: 0xb87838,
    deco: 'nubes', tiempo: 300, ancho: 140,
    huecos: [[26, 3], [50, 4], [78, 3], [104, 4]],
    tuberias: [[18, 2], [34, 3], [44, 2], [66, 3], [90, 2], [120, 3]],
    pinchos: [[38, 3], [56, 2], [72, 3], [96, 3], [112, 2]],
    bloques: [
      [10, 8, '?'], [11, 8, 'U'], [12, 8, '?'], [36, 8, '?'], [37, 8, 'B'], [38, 8, '?'],
      [70, 8, 'U'], [100, 8, '?'], [101, 8, 'B'], [102, 8, '?'], [116, 8, 'U']
    ],
    plataformas: [[28, 8, 2, 'B'], [46, 7, 3, 'B'], [58, 8, 3, 'B'], [82, 7, 4, 'B'], [108, 8, 3, 'B']],
    monedas: [[7, 10, 3], [29, 6, 2], [47, 5, 3], [59, 6, 3], [83, 5, 4], [109, 6, 3]],
    enemigos: [
      ['g', 14], ['r', 22], ['g', 30], ['s', 41], ['r', 48], ['g', 60], ['r', 62],
      ['s', 70], ['g', 76], ['r', 86], ['g', 94], ['s', 100], ['g', 110], ['g', 116], ['g', 122]
    ]
  },
  // ----- Nivel 4: Islas de lava -----
  {
    nombre: 'Islas de lava', cielo: 0x2a1040, suelo: 0x555566, ladrillo: 0x8a4a4a,
    deco: 'estrellas', lava: true, tiempo: 300, ancho: 150,
    huecos: [[20, 3], [34, 4], [48, 4], [64, 3], [78, 4], [94, 3], [108, 4]],
    tuberias: [[28, 3], [42, 2], [86, 3], [118, 2]],
    bloques: [
      [10, 8, '?'], [11, 8, 'U'], [12, 8, '?'], [40, 8, '?'],
      [88, 8, '?'], [89, 8, 'B'], [90, 8, 'U'], [130, 8, '?']
    ],
    plataformas: [
      [35, 8, 2, 'B'], [49, 7, 2, 'B'], [79, 8, 2, 'B'], [110, 8, 2, 'B'],
      [56, 8, 4, 'B'], [70, 7, 4, 'B'], [100, 8, 3, 'B'], [124, 8, 4, 'B']
    ],
    monedas: [
      [14, 10, 3], [21, 8, 2], [35, 6, 2], [49, 5, 2], [57, 6, 4],
      [71, 5, 4], [80, 6, 2], [101, 6, 3], [111, 6, 2], [125, 6, 4]
    ],
    enemigos: [
      ['g', 16], ['f', 24, 8], ['r', 30], ['f', 38, 7], ['g', 44], ['f', 52, 8], ['g', 58],
      ['s', 68], ['f', 74, 8], ['r', 82], ['g', 90], ['f', 96, 8], ['s', 102],
      ['f', 106, 8], ['g', 114], ['r', 122], ['g', 128]
    ]
  },
  // ----- Nivel 5: Montaña helada (suelo resbaladizo) -----
  {
    nombre: 'Montaña helada', cielo: 0x9ad4ff, suelo: 0xe8f4ff, ladrillo: 0x7fb7e6,
    deco: 'nubes', hielo: true, tiempo: 300, ancho: 150,
    huecos: [[24, 3], [40, 4], [58, 3], [74, 4], [92, 3], [110, 4]],
    tuberias: [[16, 3], [32, 3], [48, 2], [66, 3], [84, 2], [100, 3], [120, 3]],
    pinchos: [[28, 2], [52, 3], [70, 2], [88, 2], [104, 3], [116, 2]],
    bloques: [
      [8, 8, '?'], [9, 8, 'U'], [10, 8, '?'], [30, 8, '?'], [56, 8, 'U'],
      [90, 8, '?'], [108, 8, '?']
    ],
    plataformas: [
      [20, 8, 2, 'B'], [36, 7, 3, 'B'], [44, 8, 2, 'B'], [60, 8, 3, 'B'],
      [78, 7, 3, 'B'], [96, 8, 3, 'B'], [112, 7, 3, 'B'], [126, 8, 4, 'B']
    ],
    monedas: [
      [12, 10, 3], [21, 6, 2], [37, 5, 3], [61, 6, 3],
      [79, 5, 3], [97, 6, 3], [113, 5, 3], [127, 6, 4]
    ],
    enemigos: [
      ['g', 12], ['r', 19], ['s', 30], ['g', 36], ['f', 44, 8], ['r', 46], ['s', 56],
      ['g', 62], ['f', 64, 8], ['r', 68], ['r', 72], ['g', 82], ['f', 86, 7], ['s', 96],
      ['r', 98], ['f', 108, 8], ['g', 114], ['s', 118], ['r', 124], ['g', 130]
    ]
  },
  // ----- Nivel 6: Castillo del jefe -----
  {
    nombre: 'Castillo del jefe', cielo: 0x1a0505, suelo: 0x5a5a5a, ladrillo: 0x8a3030,
    deco: null, techo: true, jefe: true, tiempo: 180, ancho: 25,
    plataformas: [[3, 8, 4, '#'], [18, 8, 4, '#']]
  }
];

/* ------------------------------------------------------------------
   CONSTRUCCIÓN DEL MAPA (matriz de caracteres)
   ' ' vacío, '#' sólido, 'B' ladrillo, '?' / 'U' bloque sorpresa,
   'T' cuerpo de tubería, 'Y' borde superior de tubería
   ------------------------------------------------------------------ */
function construirMapa(def) {
  const filas = [];
  for (let y = 0; y < FILAS; y++) filas.push(new Array(def.ancho).fill(' '));
  const poner = (x, y, c) => {
    if (x >= 0 && x < def.ancho && y >= 0 && y < FILAS) filas[y][x] = c;
  };

  // Suelo (con huecos)
  const huecos = new Set();
  (def.huecos || []).forEach(([x, n]) => { for (let i = 0; i < n; i++) huecos.add(x + i); });
  for (let x = 0; x < def.ancho; x++) {
    if (!huecos.has(x)) { poner(x, 12, '#'); poner(x, 13, '#'); }
  }

  // Techo de cueva / castillo
  if (def.techo) {
    for (let x = 0; x < def.ancho; x++) { poner(x, 0, '#'); poner(x, 1, '#'); }
  }

  // Plataformas, bloques y tuberías
  (def.plataformas || []).forEach(([x, y, n, c]) => { for (let i = 0; i < n; i++) poner(x + i, y, c || 'B'); });
  (def.bloques || []).forEach(([x, y, c]) => poner(x, y, c));
  (def.tuberias || []).forEach(([x, h]) => {
    for (let j = 0; j < h; j++) {
      const c = j === 0 ? 'Y' : 'T';
      poner(x, 12 - h + j, c);
      poner(x + 1, 12 - h + j, c);
    }
  });

  // Escalera final antes de la meta
  if (!def.jefe) {
    const ex = def.ancho - 16;
    for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) poner(ex + i, 11 - j, '#');
  }

  return { filas, huecos };
}

// Botón de texto centrado, usado en el menú y en la pantalla final.
// translucido: fondo negro semitransparente que se resalta al pasar el puntero;
// si no, fondo rojo sólido.
function crearBotonTexto(escena, y, texto, accion, translucido) {
  const b = escena.add.text(400, y, texto, {
    fontFamily: FUENTE, fontSize: translucido ? '24px' : '22px', fontStyle: 'bold',
    color: '#ffffff', backgroundColor: translucido ? '#000000aa' : '#e52521',
    padding: { x: 16, y: 8 }
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  if (translucido) {
    b.on('pointerover', () => b.setColor('#ffd54a'));
    b.on('pointerout', () => b.setColor('#ffffff'));
  }
  b.on('pointerdown', accion);
  return b;
}

/* ==================================================================
   ESCENA: ARRANQUE
   ================================================================== */
class Arranque extends Phaser.Scene {
  constructor() { super('Arranque'); }

  create() {
    crearTexturasBase(this);
    this.scene.start('Menu');
  }
}

/* ==================================================================
   ESCENA: MENÚ PRINCIPAL
   ================================================================== */
class Menu extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    marcarEscena('menu');
    // Los colores dependen del tema, así que se regeneran aquí
    crearTexturasBase(this);
    crearTexturasNivel(this, NIVELES[0]);

    const tema = guardado.tema;
    this.cameras.main.setBackgroundColor(ajustar(tema, 'cielo', NIVELES[0].cielo));
    this.add.tileSprite(0, ALTO_PANTALLA - 64, ANCHO_PANTALLA, 64, 'suelo').setOrigin(0, 0);

    // Personajes decorativos sobre el suelo
    const y0 = ALTO_PANTALLA - 64;
    const jugadorDeco = this.add.image(90, y0, 'jugador').setOrigin(0.5, 1);
    this.tweens.add({ targets: jugadorDeco, y: y0 - 40, duration: 450, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
    this.add.image(150, y0, 'poder').setOrigin(0.5, 1);
    this.add.image(650, y0, 'enemigo').setOrigin(0.5, 1);
    this.add.image(700, y0, 'cauteloso').setOrigin(0.5, 1);
    this.add.image(750, y0, 'espinoso').setOrigin(0.5, 1);
    this.add.image(60, y0 - 160, 'moneda');
    this.add.image(740, y0 - 130, 'volador');

    // Título
    this.add.text(400, 70, 'CUADRO BROS', estiloTexto(60, { strokeThickness: 8 })).setOrigin(0.5);
    this.add.text(400, 124, '5 niveles + jefe final', estiloTexto(20, { strokeThickness: 5 })).setOrigin(0.5);
    this.add.text(400, 154, 'Mejor puntaje: ' + String(guardado.mejor).padStart(6, '0'),
      estiloTexto(16, { color: '#ffe066' })).setOrigin(0.5);

    // Botones
    let y = 205;
    crearBotonTexto(this, y, '▶ JUGAR' + atajo('Enter'), () => this.nuevaPartida(0), true);
    y += 50;
    if (guardado.nivelMax > 0) {
      const etiqueta = guardado.nivelMax >= NIVELES.length - 1 ? 'JEFE FINAL' : 'NIVEL ' + (guardado.nivelMax + 1);
      crearBotonTexto(this, y, '⏩ CONTINUAR: ' + etiqueta + atajo('C'), () => this.nuevaPartida(guardado.nivelMax), true);
      y += 50;
    }
    crearBotonTexto(this, y, '🎨 TEMA: ' + TEMAS[tema].nombre + atajo('T'), () => siguienteTema(), true);

    // Ayuda de controles (solo con teclado)
    if (!esDispositivoTactil()) {
      this.add.text(400, ALTO_PANTALLA - 30,
        'Mover: ← → / A D   Saltar: ↑ / W / Espacio   Pausa: P', estiloTexto(14)).setOrigin(0.5);
    }

    // Teclado
    this.input.keyboard.on('keydown-ENTER', () => this.nuevaPartida(0));
    this.input.keyboard.on('keydown-SPACE', () => this.nuevaPartida(0));
    this.input.keyboard.on('keydown-C', () => { if (guardado.nivelMax > 0) this.nuevaPartida(guardado.nivelMax); });
    this.input.keyboard.on('keydown-T', () => siguienteTema());
  }

  nuevaPartida(nivel) {
    reiniciarPartida();
    this.scene.start('Juego', { nivel });
  }

  // El botón A del mando también inicia la partida
  update() {
    const pad = this.input.gamepad && this.input.gamepad.total > 0 ? this.input.gamepad.getPad(0) : null;
    if (pad && pad.buttons[0] && pad.buttons[0].pressed) this.nuevaPartida(0);
  }
}

/* ==================================================================
   ESCENA: JUEGO (un nivel)
   ================================================================== */
class Juego extends Phaser.Scene {
  constructor() { super('Juego'); }

  init(datos) {
    this.indice = (datos && datos.nivel) || 0;
  }

  create() {
    const def = this.def = NIVELES[this.indice];
    this.esJefe = !!def.jefe;
    this.anchoPx = def.ancho * TAM;
    this.tiempo = def.tiempo;
    this.muriendo = false;
    this.fin = false;
    this.invul = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.saltoPrev = false;
    this.saltando = false;
    this.jefe = null;

    crearTexturasNivel(this, def);
    this.cameras.main.setBackgroundColor(ajustar(guardado.tema, 'cielo', def.cielo));
    this.crearDecoracion();

    // Límites del mundo: se puede caer por abajo y salir por arriba
    this.physics.world.setBounds(0, 0, this.anchoPx, ALTO_PANTALLA + 300);
    this.physics.world.setBoundsCollision(true, true, false, false);

    // Grupos de objetos
    this.solidos = this.physics.add.staticGroup();
    this.monedas = this.physics.add.staticGroup();
    this.pinchos = this.physics.add.staticGroup();
    this.lavas = this.physics.add.staticGroup();
    this.enemigos = this.physics.add.group();
    this.poderes = this.physics.add.group();
    this.fuegos = this.physics.add.group({ allowGravity: false });

    this.construirNivel();
    this.crearJugador();
    if (this.esJefe) this.crearJefe(); else this.crearMeta();

    // Colisiones y superposiciones
    this.physics.add.collider(this.jugador, this.solidos, this.alChocarSolido, null, this);
    this.physics.add.collider(this.enemigos, this.solidos, null, (e) => e.tipo !== 'f', this);
    this.physics.add.collider(this.poderes, this.solidos);
    this.physics.add.overlap(this.jugador, this.monedas, this.alTomarMoneda, null, this);
    this.physics.add.overlap(this.jugador, this.enemigos, this.alTocarEnemigo, null, this);
    this.physics.add.overlap(this.jugador, this.poderes, this.alTomarPoder, null, this);
    this.physics.add.overlap(this.jugador, this.pinchos, () => {
      this.herir();
      if (!this.muriendo) this.jugador.setVelocityY(-380);
    });
    this.physics.add.overlap(this.jugador, this.lavas, () => this.morir());
    this.physics.add.overlap(this.jugador, this.fuegos, (j, f) => { f.destroy(); this.herir(); });

    // Cámara
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.anchoPx, ALTO_PANTALLA);
    cam.startFollow(this.jugador, true, 0.1, 0.1);
    cam.setZoom(zoomJuego);

    // Controles de teclado (flechas y W, A, S, D)
    this.cursores = this.input.keyboard.createCursorKeys();
    this.teclas = this.input.keyboard.addKeys('W,A,S,D,SPACE');

    // Interfaz (puntos, vidas, pausa) en una escena paralela
    marcarEscena('juego');
    if (!this.scene.isActive('Interfaz')) this.scene.launch('Interfaz');
    else this.scene.get('Interfaz').ocultarPausa();   // por si se reinició desde la pausa

    // Cartel de inicio del nivel
    const cartel = this.add.text(400, 160,
      this.esJefe ? '¡JEFE FINAL!' : 'NIVEL ' + (this.indice + 1) + '\n' + def.nombre,
      estiloTexto(40, { align: 'center', strokeThickness: 7 })).setOrigin(0.5).setScrollFactor(0).setDepth(50);
    this.tweens.add({ targets: cartel, alpha: 0, delay: 1300, duration: 600, onComplete: () => cartel.destroy() });
  }

  /* ---------- Construcción ---------- */

  // Nubes o estrellas de fondo con parallax
  crearDecoracion() {
    const def = this.def;
    if (!def.deco || guardado.tema === 'contraste') return;
    const n = Math.max(6, Math.floor(def.ancho / 8));
    for (let i = 0; i < n; i++) {
      const x = (i / n) * def.ancho * TAM * 0.6 + Math.random() * 200;
      if (def.deco === 'nubes') {
        this.add.image(x, Phaser.Math.Between(20, 170), 'nube').setScrollFactor(0.4).setDepth(-10);
      } else {
        for (let k = 0; k < 4; k++) {
          this.add.image(x + k * 40, Phaser.Math.Between(10, 250), 'estrella').setScrollFactor(0.2).setDepth(-10);
        }
      }
    }
  }

  // ¿Hay algo sólido en la casilla (tx, ty)?
  haySolido(tx, ty) {
    const fila = this.filas[ty];
    return !!fila && fila[tx] !== undefined && fila[tx] !== ' ';
  }

  construirNivel() {
    const def = this.def;
    const { filas, huecos } = construirMapa(def);
    this.filas = filas;

    // Casillas sólidas
    filas.forEach((fila, y) => fila.forEach((c, x) => {
      if (c === ' ') return;
      const px = x * TAM + TAM / 2;
      const py = y * TAM + TAM / 2;
      let b;
      if (c === '#') b = this.solidos.create(px, py, 'suelo');
      else if (c === 'B') { b = this.solidos.create(px, py, 'ladrillo'); b.tipo = 'ladrillo'; }
      else if (c === '?' || c === 'U') {
        b = this.solidos.create(px, py, 'pregunta');
        b.tipo = 'pregunta';
        b.contenido = c === 'U' ? 'poder' : 'moneda';
      } else if (c === 'T') b = this.solidos.create(px, py, 'tubo');
      else if (c === 'Y') b = this.solidos.create(px, py, 'tuboTop');
      if (b) { b.tx = x; b.ty = y; }
    }));

    // Lava en el fondo de los huecos
    if (def.lava) {
      huecos.forEach((x) => this.lavas.create(x * TAM + TAM / 2, 13 * TAM + TAM / 2, 'lava'));
    }

    // Pinchos sobre el suelo
    (def.pinchos || []).forEach(([x, n]) => {
      for (let i = 0; i < n; i++) this.pinchos.create((x + i) * TAM + TAM / 2, 12 * TAM - 8, 'pinchos');
    });

    // Monedas
    (def.monedas || []).forEach(([x, y, n]) => {
      for (let i = 0; i < n; i++) {
        const m = this.monedas.create((x + i) * TAM + TAM / 2, y * TAM + TAM / 2, 'moneda');
        this.tweens.add({ targets: m, scaleX: 0.25, duration: 350, yoyo: true, repeat: -1 });
      }
    });

    // Enemigos
    (def.enemigos || []).forEach(([tipo, x, y]) => this.crearEnemigo(tipo, x, y === undefined ? 11 : y));
  }

  crearEnemigo(tipo, tx, ty) {
    const clave = { g: 'enemigo', r: 'cauteloso', f: 'volador', s: 'espinoso' }[tipo];
    const e = this.enemigos.create(tx * TAM + TAM / 2, (ty + 1) * TAM, clave).setOrigin(0.5, 1).setDepth(3);
    e.body.setSize(24, 24).setOffset(2, 4);
    e.tipo = tipo;
    e.dir = -1;
    e.muerto = false;
    if (tipo === 'f') {
      // El volador flota arriba y abajo y patrulla en horizontal
      e.body.allowGravity = false;
      e.fase = Math.random() * 6;
      e.minX = e.x - 96;
      e.maxX = e.x + 96;
    }
    return e;
  }

  crearJugador() {
    const j = this.jugador = this.physics.add.sprite(2 * TAM + TAM / 2, 12 * TAM - 4,
      partida.grande ? 'jugadorG' : 'jugador');
    j.setOrigin(0.5, 1).setDepth(5);
    this.aplicarTamano(partida.grande);
  }

  // Cambia entre jugador pequeño y grande (textura + cuerpo físico)
  aplicarTamano(grande) {
    const j = this.jugador;
    if (grande) {
      j.setTexture('jugadorG');
      j.body.setSize(24, 46).setOffset(2, 2);
    } else {
      j.setTexture('jugador');
      j.body.setSize(24, 26).setOffset(2, 2);
    }
  }

  // Poste y bandera al final del nivel
  crearMeta() {
    const px = (this.def.ancho - 9) * TAM + TAM / 2;
    this.poleX = px;
    this.add.image(px, 12 * TAM, 'poste').setOrigin(0.5, 1);
    this.bandera = this.add.image(px - 4, 12 * TAM - 276, 'bandera').setOrigin(1, 0);
    const zona = this.add.zone(px, 12 * TAM - 144, 24, 288);
    this.physics.add.existing(zona, true);
    this.physics.add.overlap(this.jugador, zona, () => this.completar());
  }

  crearJefe() {
    const j = this.jefe = this.physics.add.sprite(21 * TAM, 12 * TAM, 'jefe').setOrigin(0.5, 1).setDepth(3);
    j.body.setSize(76, 76).setOffset(2, 4);
    j.setCollideWorldBounds(true);
    j.vida = 5;
    j.vidaMax = 5;
    j.invul = 0;
    j.muerto = false;
    j.tSalto = 2.5;
    j.tFuego = 2.0;
    this.physics.add.collider(j, this.solidos);
    this.physics.add.overlap(this.jugador, j, this.alTocarJefe, null, this);
  }

  /* ---------- Entrada ---------- */

  // Combina teclado, pantalla táctil y mando en una sola lectura
  leerEntrada() {
    let x = 0;
    let salto = false;
    let abajo = false;
    if (this.cursores.left.isDown || this.teclas.A.isDown) x -= 1;
    if (this.cursores.right.isDown || this.teclas.D.isDown) x += 1;
    if (this.cursores.up.isDown || this.teclas.W.isDown || this.teclas.SPACE.isDown) salto = true;
    if (this.cursores.down.isDown || this.teclas.S.isDown) abajo = true;

    // Joystick virtual y botón de salto táctiles
    x += ENTRADA.x;
    if (ENTRADA.salto) salto = true;

    // Mando (si hay uno conectado)
    const pad = this.input.gamepad && this.input.gamepad.total > 0 ? this.input.gamepad.getPad(0) : null;
    if (pad) {
      const ax = pad.leftStick.x;
      if (Math.abs(ax) > 0.3) x += ax;
      else {
        if (pad.buttons[14] && pad.buttons[14].pressed) x -= 1;
        if (pad.buttons[15] && pad.buttons[15].pressed) x += 1;
      }
      if ((pad.buttons[0] && pad.buttons[0].pressed) || (pad.buttons[12] && pad.buttons[12].pressed)) salto = true;
      if ((pad.buttons[13] && pad.buttons[13].pressed) || pad.leftStick.y > 0.7) abajo = true;
    }
    return { x: Phaser.Math.Clamp(x, -1, 1), salto, abajo };
  }

  /* ---------- Bucle principal ---------- */

  update(tiempoTotal, delta) {
    if (this.muriendo || this.fin) return;
    const dt = Math.min(delta, 50) / 1000;

    // Cuenta regresiva
    this.tiempo -= dt;
    if (this.tiempo <= 0) { this.tiempo = 0; this.morir(); return; }

    this.moverJugador(dt);
    this.actualizarEnemigos(tiempoTotal);
    this.actualizarPoderes();
    if (this.jefe) this.actualizarJefe(dt);
    this.actualizarFuegos();

    // Caída al vacío
    if (this.jugador.y > ALTO_PANTALLA + 120) this.morir();
  }

  // Movimiento con aceleración, salto variable, coyote y buffer de salto
  moverJugador(dt) {
    const j = this.jugador;
    const b = j.body;
    const ent = this.leerEntrada();
    const suelo = b.blocked.down || b.touching.down;
    const hielo = !!this.def.hielo;

    // Horizontal
    let vx = b.velocity.x;
    if (ent.x !== 0) {
      const acel = (suelo ? (hielo ? 500 : 2600) : 1600) * dt;
      vx = aproximar(vx, ent.x * VEL_MAX, acel);
      j.setFlipX(ent.x < 0);
    } else {
      const freno = (suelo ? (hielo ? 160 : 2800) : 500) * dt;
      vx = aproximar(vx, 0, freno);
    }
    j.setVelocityX(vx);

    // Salto
    if (suelo) { this.coyote = 0.1; this.saltando = false; } else this.coyote -= dt;
    if (ent.salto && !this.saltoPrev) this.buffer = 0.12; else this.buffer -= dt;
    if (this.buffer > 0 && this.coyote > 0) {
      j.setVelocityY(-SALTO);
      this.buffer = 0;
      this.coyote = 0;
      this.saltando = true;
      sfx('salto');
    }
    // Soltar el botón corta el salto (salto más corto)
    if (!ent.salto && this.saltando && b.velocity.y < -150) {
      j.setVelocityY(b.velocity.y * 0.5);
      this.saltando = false;
    }
    this.saltoPrev = ent.salto;

    // Caída rápida con abajo / S
    if (ent.abajo && !suelo && b.velocity.y > 0) j.setVelocityY(Math.max(b.velocity.y, 420));

    // Parpadeo mientras es invulnerable
    if (this.invul > 0) {
      this.invul -= dt;
      j.setAlpha(Math.floor(this.invul * 12) % 2 ? 0.3 : 1);
      if (this.invul <= 0) j.setAlpha(1);
    }
  }

  // Patrullaje de enemigos
  actualizarEnemigos(t) {
    [...this.enemigos.getChildren()].forEach((e) => {
      if (!e.active || e.muerto) {
        if (e.y > ALTO_PANTALLA + 300) e.destroy();
        return;
      }
      if (e.y > ALTO_PANTALLA + 200) { e.destroy(); return; }

      if (e.tipo === 'f') {
        // Volador: ondulación vertical y vaivén horizontal
        e.setVelocityY(Math.cos(t / 1000 * 2 + e.fase) * 70);
        if (e.x < e.minX) e.dir = 1;
        else if (e.x > e.maxX) e.dir = -1;
        e.setVelocityX(e.dir * 45);
        return;
      }

      // Rebote contra paredes
      if (e.body.blocked.left) e.dir = 1;
      else if (e.body.blocked.right) e.dir = -1;

      // El cauteloso da la vuelta antes de caerse
      if (e.tipo === 'r' && e.body.blocked.down) {
        const adelante = Math.floor((e.x + e.dir * 18) / TAM);
        const fila = Math.floor((e.body.bottom + 4) / TAM);
        if (!this.haySolido(adelante, fila)) e.dir *= -1;
      }
      e.setVelocityX(e.dir * 50);
    });
  }

  // Los potenciadores avanzan y rebotan en las paredes
  actualizarPoderes() {
    [...this.poderes.getChildren()].forEach((p) => {
      if (!p.active || !p.body.enable) return;
      if (p.y > ALTO_PANTALLA + 100) { p.destroy(); return; }
      if (p.body.blocked.left) p.setVelocityX(80);
      else if (p.body.blocked.right) p.setVelocityX(-80);
    });
  }

  // Elimina las bolas de fuego que salen del mundo
  actualizarFuegos() {
    [...this.fuegos.getChildren()].forEach((f) => {
      if (f.x < -20 || f.x > this.anchoPx + 20) f.destroy();
    });
  }

  /* ---------- Bloques ---------- */

  // Se llama al chocar con cualquier sólido; detecta golpes desde abajo
  alChocarSolido(jug, bloque) {
    if (!bloque.tipo || !jug.body.touching.up) return;
    if (bloque.body.bottom > jug.body.top + 8) return;
    if (Math.abs(jug.x - bloque.x) > 22) return;
    this.golpearBloque(bloque);
  }

  golpearBloque(b) {
    if (b.ocupado) return;
    b.ocupado = true;

    if (b.tipo === 'pregunta') {
      if (b.usado) { sfx('bloque'); b.ocupado = false; return; }
      b.usado = true;
      b.setTexture('usado');
      this.rebotarBloque(b);
      if (b.contenido === 'moneda') {
        this.sumarMoneda(b.x, b.y - 40);
      } else {
        // Sale un potenciador desde el bloque
        sfx('poder');
        const p = this.poderes.create(b.x, b.y, 'poder').setDepth(0.5);
        p.body.allowGravity = false;
        p.body.enable = false;
        this.tweens.add({
          targets: p, y: b.y - TAM, duration: 250,
          onComplete: () => {
            if (!p.active) return;
            p.body.enable = true;
            p.body.reset(p.x, p.y);
            p.body.allowGravity = true;
            p.setVelocityX(80);
          }
        });
      }
    } else if (b.tipo === 'ladrillo') {
      if (partida.grande) {
        // Grande: rompe el ladrillo en trozos
        sfx('romper');
        this.sumarPuntos(50, b.x, b.y - 20);
        for (let i = 0; i < 4; i++) {
          const f = this.add.image(b.x + (i % 2 ? 8 : -8), b.y + (i < 2 ? -8 : 8), 'trozo');
          this.physics.add.existing(f);
          f.body.setVelocity(Phaser.Math.Between(-140, 140), Phaser.Math.Between(-440, -260));
          this.time.delayedCall(900, () => f.destroy());
        }
        if (this.filas[b.ty]) this.filas[b.ty][b.tx] = ' ';
        this.matarSobre(b);
        b.destroy();
      } else {
        sfx('bloque');
        this.rebotarBloque(b);
      }
    }
  }

  // Animación de rebote del bloque y golpe a enemigos que estén encima
  rebotarBloque(b) {
    this.matarSobre(b);
    this.tweens.add({
      targets: b, y: b.y - 8, duration: 70, yoyo: true,
      onComplete: () => { b.ocupado = false; }
    });
  }

  matarSobre(b) {
    this.enemigos.getChildren().forEach((e) => {
      if (!e.muerto && Math.abs(e.x - b.x) < 24 && Math.abs(e.body.bottom - (b.y - TAM / 2)) < 10) {
        this.matarEnemigo(e, true);
      }
    });
  }

  /* ---------- Puntos, monedas y potenciadores ---------- */

  sumarPuntos(n, x, y) {
    partida.puntos += n;
    const tx = this.add.text(x, y, '+' + n, estiloTexto(16)).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: tx, y: y - 40, alpha: 0, duration: 700, onComplete: () => tx.destroy() });
  }

  sumarMoneda(x, y) {
    sfx('moneda');
    partida.monedas++;
    // Cada 100 monedas: una vida extra
    if (partida.monedas >= 100) {
      partida.monedas -= 100;
      partida.vidas++;
      sfx('vida');
      this.sumarPuntos(0, x, y - 20);
    }
    this.sumarPuntos(100, x, y);
  }

  alTomarMoneda(jug, m) {
    this.sumarMoneda(m.x, m.y - 10);
    m.destroy();
  }

  alTomarPoder(jug, p) {
    if (!p.active || !p.body.enable) return;
    p.destroy();
    sfx('poder');
    if (!partida.grande) {
      partida.grande = true;
      this.aplicarTamano(true);
    }
    this.sumarPuntos(1000, jug.x, jug.y - 60);
  }

  /* ---------- Enemigos ---------- */

  alTocarEnemigo(jug, e) {
    if (this.muriendo || this.fin || !e.active || e.muerto) return;
    // Pisotón: el jugador cae y sus pies están por encima del enemigo
    const desde = jug.body.bottom - e.body.top;
    if (jug.body.velocity.y > 0 && desde < 24 && e.tipo !== 's') {
      this.matarEnemigo(e, false);
      const saltando = this.leerEntrada().salto;
      jug.setVelocityY(saltando ? -520 : -360);
    } else {
      this.herir();
    }
  }

  matarEnemigo(e, volcar) {
    if (e.muerto) return;
    e.muerto = true;
    sfx('pisar');
    this.sumarPuntos(200, e.x, e.y - 30);
    if (volcar) {
      // Golpeado desde abajo: sale volando
      e.body.checkCollision.none = true;
      e.body.allowGravity = true;
      e.setFlipY(true);
      e.setVelocity(0, -300);
      this.time.delayedCall(1200, () => e.destroy());
    } else {
      // Aplastado
      e.body.enable = false;
      this.tweens.add({ targets: e, scaleY: 0.2, duration: 120 });
      this.time.delayedCall(350, () => e.destroy());
    }
  }

  /* ---------- Jefe final ---------- */

  actualizarJefe(dt) {
    const j = this.jefe;
    if (!j || j.muerto) return;
    const fase = j.vidaMax - j.vida;                 // cuanto más herido, más agresivo
    const dir = Math.sign(this.jugador.x - j.x) || 1;
    const suelo = j.body.blocked.down;

    j.tSalto -= dt;
    j.tFuego -= dt;

    if (suelo) {
      j.setVelocityX(dir * (70 + fase * 18));
      if (j.tSalto <= 0) {
        j.setVelocityY(-620);
        j.tSalto = Phaser.Math.FloatBetween(1.6, 2.8) - fase * 0.15;
        sfx('golpe');
      }
    }
    if (j.tFuego <= 0) {
      this.dispararFuego(j, dir);
      j.tFuego = Phaser.Math.FloatBetween(1.8, 3.0) - fase * 0.2;
    }

    // Parpadeo mientras es invulnerable
    if (j.invul > 0) {
      j.invul -= dt;
      j.setAlpha(Math.floor(j.invul * 14) % 2 ? 0.4 : 1);
      if (j.invul <= 0) j.setAlpha(1);
    }
  }

  // Dispara una bola de fuego baja o alta según dónde esté el jugador
  dispararFuego(j, dir) {
    const alto = this.jugador.y < 300;
    const y = alto ? 8 * TAM - 14 : 12 * TAM - 14;
    const f = this.fuegos.create(j.x + dir * 44, y, 'fuego').setDepth(4);
    f.body.allowGravity = false;
    f.setVelocityX(dir * 240);
    sfx('golpe');
    this.time.delayedCall(4000, () => { if (f.active) f.destroy(); });
  }

  alTocarJefe(jug, j) {
    if (j.muerto || this.muriendo || this.fin) return;
    const cae = jug.body.velocity.y > 0 && (jug.body.bottom - j.body.top) < 26;
    if (cae) {
      jug.setVelocityY(-520);
      if (j.invul <= 0) {
        j.vida--;
        j.invul = 1.4;
        partida.puntos += 500;
        sfx('golpe');
        this.cameras.main.shake(150, 0.006);
        if (j.vida <= 0) this.vencerJefe();
      }
    } else {
      this.herir();
    }
  }

  vencerJefe() {
    const j = this.jefe;
    j.muerto = true;
    this.fin = true;
    j.body.enable = false;
    this.jugador.setVelocityX(0);
    this.fuegos.clear(true, true);
    sfx('meta');
    this.cameras.main.shake(500, 0.01);

    // Explosión de cuadraditos de colores
    const colores = [0xffd700, 0xff5722, 0xffffff, 0xd500f9, 0xff1744];
    for (let i = 0; i < 30; i++) {
      const c = this.add.rectangle(j.x, j.y - 40, 10, 10, Phaser.Utils.Array.GetRandom(colores)).setDepth(10);
      this.physics.add.existing(c);
      c.body.setVelocity(Phaser.Math.Between(-300, 300), Phaser.Math.Between(-520, -120));
    }
    this.tweens.add({ targets: j, scale: 0, angle: 360, alpha: 0, duration: 900 });

    partida.puntos += 5000 + Math.floor(this.tiempo) * 10;
    registrarPuntaje();
    this.time.delayedCall(2600, () => {
      this.scene.stop('Interfaz');
      this.scene.start('Fin', { ganado: true });
    });
  }

  /* ---------- Daño, muerte y meta ---------- */

  herir() {
    if (this.invul > 0 || this.muriendo || this.fin) return;
    if (partida.grande) {
      // Grande: pierde el tamaño y queda invulnerable un momento
      partida.grande = false;
      this.aplicarTamano(false);
      this.invul = 1.6;
      sfx('herir');
      this.cameras.main.shake(120, 0.004);
    } else {
      this.morir();
    }
  }

  morir() {
    if (this.muriendo || this.fin) return;
    this.muriendo = true;
    partida.grande = false;
    sfx('herir');
    const j = this.jugador;
    const cayo = j.y > ALTO_PANTALLA + 20;
    j.body.enable = false;
    j.setAlpha(1);
    if (cayo) {
      j.setVisible(false);
    } else {
      // Animación clásica: salta hacia arriba y cae
      this.tweens.add({
        targets: j, y: j.y - 90, duration: 320, ease: 'Quad.easeOut',
        onComplete: () => this.tweens.add({ targets: j, y: j.y + 600, duration: 800, ease: 'Quad.easeIn' })
      });
    }
    this.time.delayedCall(1700, () => this.perderVida());
  }

  perderVida() {
    partida.vidas--;
    registrarPuntaje();
    if (partida.vidas <= 0) {
      this.scene.stop('Interfaz');
      this.scene.start('Fin', { ganado: false, nivel: this.indice });
    } else {
      this.scene.restart({ nivel: this.indice });
    }
  }

  // El jugador toca el poste: nivel completado
  completar() {
    if (this.fin || this.muriendo) return;
    this.fin = true;
    sfx('meta');
    const j = this.jugador;
    j.body.enable = false;

    const bonus = Math.floor(this.tiempo) * 10;
    this.sumarPuntos(500 + bonus, j.x, j.y - 70);

    // Desliza al jugador y la bandera por el poste
    this.tweens.add({ targets: j, x: this.poleX - 14, y: 12 * TAM, duration: 700 });
    this.tweens.add({ targets: this.bandera, y: 12 * TAM - 22, duration: 700 });

    this.add.text(400, 150, '¡NIVEL COMPLETADO!', estiloTexto(36, { strokeThickness: 7 }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(50);

    guardarProgreso(Math.min(this.indice + 1, NIVELES.length - 1));
    this.time.delayedCall(2600, () => this.scene.start('Juego', { nivel: this.indice + 1 }));
  }
}

/* ==================================================================
   ESCENA: INTERFAZ (HUD, joystick virtual, pausa y sonido)
   ================================================================== */
class Interfaz extends Phaser.Scene {
  constructor() { super('Interfaz'); }

  create() {
    const estilo = estiloTexto(16);

    // Marcadores
    this.tPuntos = this.add.text(12, 8, '', estilo);
    this.tMonedas = this.add.text(160, 8, '', estilo);
    this.tNivel = this.add.text(290, 8, '', estilo);
    this.tTiempo = this.add.text(400, 8, '', estilo);
    this.tVidas = this.add.text(540, 8, '', estilo);

    // Barra de vida del jefe
    this.barraJefe = this.add.graphics();
    this.tJefe = this.add.text(400, 52, 'JEFE', estilo).setOrigin(0.5).setVisible(false);

    // Botones de pausa y sonido
    this.crearBotonSuperior(768, 22, 'II', () => this.alternarPausa());
    this.btnSonido = this.crearBotonSuperior(726, 22, '♪', () => {
      guardado.silencio = !guardado.silencio;
      guardar();
      this.actualizarSonido();
    });
    this.actualizarSonido();

    // Panel de pausa
    this.crearPanelPausa();

    // Teclas de pausa y menú
    this.input.keyboard.on('keydown-P', () => this.alternarPausa());
    this.input.keyboard.on('keydown-ESC', () => this.alternarPausa());
    this.input.keyboard.on('keydown-M', () => { if (this.scene.isPaused('Juego')) irAlMenuPrincipal(); });

    // Mando: el botón Start pausa (se lee en update)
    this.startPrev = false;

    // Pausa automática si la pestaña pasa a segundo plano
    this.alOcultar = () => {
      if (this.scene.isActive('Juego')) this.alternarPausa();
    };
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.alOcultar);
    this.events.once('shutdown', () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.alOcultar);
      ENTRADA.x = 0;
      ENTRADA.salto = false;
    });
  }

  // Botón cuadrado en la esquina superior
  crearBotonSuperior(x, y, texto, accion) {
    const fondo = this.add.rectangle(x, y, 34, 34, 0x000000, 0.5).setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    const t = this.add.text(x, y, texto, {
      fontFamily: FUENTE, fontSize: '18px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5);
    fondo.on('pointerdown', accion);
    fondo.texto = t;
    return fondo;
  }

  actualizarSonido() {
    this.btnSonido.texto.setText(guardado.silencio ? '×' : '♪');
    this.btnSonido.setAlpha(guardado.silencio ? 0.6 : 1);
  }

  /* ---------- Pausa ---------- */

  crearPanelPausa() {
    const fondo = this.add.rectangle(400, 224, 800, 448, 0x000000, 0.65);
    const titulo = this.add.text(400, 150, 'PAUSA', estiloTexto(48, { strokeThickness: 7 })).setOrigin(0.5);
    const estiloBoton = {
      fontFamily: FUENTE, fontSize: '24px', fontStyle: 'bold', color: '#ffffff',
      backgroundColor: '#e52521', padding: { x: 16, y: 8 }
    };
    const seguir = this.add.text(400, 235, 'CONTINUAR' + atajo('P'), estiloBoton).setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const menu = this.add.text(400, 295, 'MENÚ' + atajo('M'), estiloBoton).setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    seguir.on('pointerdown', () => this.alternarPausa());
    menu.on('pointerdown', () => irAlMenuPrincipal());

    this.panel = this.add.container(0, 0, [fondo, titulo, seguir, menu]).setDepth(100).setVisible(false);
  }

  // Oculta el panel de pausa (se usa al reiniciar el nivel desde la pausa)
  ocultarPausa() {
    if (this.panel) this.panel.setVisible(false);
  }

  alternarPausa() {
    if (this.scene.isPaused('Juego')) {
      this.scene.resume('Juego');
      this.panel.setVisible(false);
    } else if (this.scene.isActive('Juego')) {
      this.scene.pause('Juego');
      this.panel.setVisible(true);
    }
  }

  /* ---------- Actualización del HUD ---------- */

  update() {
    const juegoEsc = this.scene.get('Juego');
    const def = juegoEsc && juegoEsc.def;

    this.tPuntos.setText('PUNTOS ' + String(partida.puntos).padStart(6, '0'));
    this.tMonedas.setText('MONEDAS x' + String(partida.monedas).padStart(2, '0'));
    this.tNivel.setText(def && def.jefe ? 'JEFE' : 'NIVEL ' + ((juegoEsc && juegoEsc.indice || 0) + 1));
    this.tTiempo.setText('TIEMPO ' + Math.max(0, Math.ceil(juegoEsc && juegoEsc.tiempo || 0)));
    this.tVidas.setText('VIDAS x' + partida.vidas);

    // Barra de vida del jefe
    const jefe = juegoEsc && juegoEsc.jefe;
    this.barraJefe.clear();
    this.tJefe.setVisible(!!jefe);
    if (jefe) {
      this.barraJefe.fillStyle(0x000000, 0.7);
      this.barraJefe.fillRect(248, 38, 304, 18);
      this.barraJefe.fillStyle(0xff1744, 1);
      this.barraJefe.fillRect(250, 40, 300 * Math.max(0, jefe.vida) / jefe.vidaMax, 14);
      this.tJefe.setPosition(400, 69);
    }

    // Botón Start del mando para pausar
    const pad = this.input.gamepad && this.input.gamepad.total > 0 ? this.input.gamepad.getPad(0) : null;
    const start = !!(pad && pad.buttons[9] && pad.buttons[9].pressed);
    if (start && !this.startPrev) this.alternarPausa();
    this.startPrev = start;
  }
}

/* ==================================================================
   ESCENA: FIN (victoria o fin del juego)
   ================================================================== */
class Fin extends Phaser.Scene {
  constructor() { super('Fin'); }

  init(datos) {
    this.ganado = !!(datos && datos.ganado);
    this.nivelPerdido = (datos && datos.nivel) || 0;
  }

  create() {
    marcarEscena('fin');
    const tema = guardado.tema;
    this.cameras.main.setBackgroundColor(
      this.ganado ? ajustar(tema, 'cielo', NIVELES[0].cielo) : 0x000000);

    const grande = estiloTexto(48, { align: 'center', strokeThickness: 8 });
    const medio = estiloTexto(22, { color: '#ffe066', strokeThickness: 5 });

    if (this.ganado) {
      // Lluvia de confeti de cuadrados
      const colores = [0xe52521, 0xffd700, 0x2ecc71, 0x3498db, 0xff5fa2, 0xffffff];
      for (let i = 0; i < 60; i++) {
        const c = this.add.rectangle(Phaser.Math.Between(0, 800), Phaser.Math.Between(-450, 0), 12, 12,
          Phaser.Utils.Array.GetRandom(colores));
        this.tweens.add({
          targets: c, y: 480, angle: 360, duration: Phaser.Math.Between(2500, 5000),
          repeat: -1, delay: Phaser.Math.Between(0, 2500)
        });
      }
      this.add.text(400, 100, '¡VICTORIA!', grande).setOrigin(0.5);
      this.add.text(400, 160, 'Derrotaste al jefe final', medio).setOrigin(0.5);
    } else {
      this.add.text(400, 100, 'FIN DEL JUEGO', grande).setOrigin(0.5);
    }

    this.add.text(400, 215, 'Puntos: ' + String(partida.puntos).padStart(6, '0'), medio).setOrigin(0.5);
    this.add.text(400, 245, 'Mejor puntaje: ' + String(guardado.mejor).padStart(6, '0'), medio).setOrigin(0.5);

    // Botones
    const etiqueta = this.ganado ? '▶ JUGAR DE NUEVO' : '▶ REINTENTAR NIVEL ' + (this.nivelPerdido + 1);
    crearBotonTexto(this, 310, etiqueta + atajo('Enter'), () => this.reintentar(), false);
    crearBotonTexto(this, 365, 'MENÚ' + atajo('M'), () => this.scene.start('Menu'), false);

    this.input.keyboard.on('keydown-ENTER', () => this.reintentar());
    this.input.keyboard.on('keydown-M', () => this.scene.start('Menu'));
  }

  reintentar() {
    reiniciarPartida();
    this.scene.start('Juego', { nivel: this.ganado ? 0 : this.nivelPerdido });
  }
}

/* ==================================================================
   CONTROLES TÁCTILES FUERA DE LA PANTALLA DEL JUEGO
   El joystick virtual queda a la izquierda y el botón de salto a la
   derecha del juego (paneles HTML, no dibujados dentro del canvas).
   ================================================================== */
function esDispositivoTactil() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

function configurarControlesTactiles() {
  if (!esDispositivoTactil()) return;
  // Esta clase hace visibles los paneles laterales (ver style.css)
  document.body.classList.add('tactil');

  const zonaJoy = document.getElementById('zona-joystick');
  const base = document.getElementById('joy-base');
  const perilla = document.getElementById('joy-perilla');
  const botonSalto = document.getElementById('btn-saltar');
  let idJoy = null;                       // dedo que controla el joystick

  // Calcula la dirección según el desplazamiento del dedo respecto al centro
  const mover = (e) => {
    const r = base.getBoundingClientRect();
    const radio = r.width / 2;
    const dx = e.clientX - (r.left + radio);
    const dy = e.clientY - (r.top + r.height / 2);
    const dist = Math.min(Math.hypot(dx, dy), radio * 0.7);
    const ang = Math.atan2(dy, dx);
    // La perilla se mueve mediante variables CSS definidas en style.css
    perilla.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    perilla.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
    ENTRADA.x = Math.abs(dx) < radio * 0.2 ? 0 : Math.max(-1, Math.min(1, dx / (radio * 0.6)));
  };

  // Devuelve el joystick al centro y detiene el movimiento
  const soltarJoy = (e) => {
    if (e.pointerId !== idJoy) return;
    idJoy = null;
    ENTRADA.x = 0;
    perilla.style.setProperty('--dx', '0px');
    perilla.style.setProperty('--dy', '0px');
    base.classList.remove('activo');
  };

  zonaJoy.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (idJoy !== null) return;
    idJoy = e.pointerId;
    zonaJoy.setPointerCapture(e.pointerId);
    base.classList.add('activo');
    mover(e);
  });
  zonaJoy.addEventListener('pointermove', (e) => { if (e.pointerId === idJoy) mover(e); });
  zonaJoy.addEventListener('pointerup', soltarJoy);
  zonaJoy.addEventListener('pointercancel', soltarJoy);

  // Botón de salto: se mantiene pulsado para saltar más alto
  let idSalto = null;
  const soltarSalto = (e) => {
    if (e.pointerId !== idSalto) return;
    idSalto = null;
    ENTRADA.salto = false;
    botonSalto.classList.remove('activo');
  };
  botonSalto.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (idSalto !== null) return;
    idSalto = e.pointerId;
    botonSalto.setPointerCapture(e.pointerId);
    ENTRADA.salto = true;
    botonSalto.classList.add('activo');
  });
  botonSalto.addEventListener('pointerup', soltarSalto);
  botonSalto.addEventListener('pointercancel', soltarSalto);
}

/* ==================================================================
   INICIO DEL JUEGO
   ================================================================== */
function iniciar() {
  comprobarAlmacenamiento();
  cargar();
  aplicarTemaPagina();
  bloquearSeleccion();
  bloquearZoom();
  vigilarMandos();
  configurarControlesTactiles();
  marcarEscena('menu');

  // Botones de la barra superior: id -> acción
  const acciones = {
    'btn-compartir': compartir,
    'btn-tema': siguienteTema,
    'btn-acercar': () => cambiarZoom(ZOOM_PASO),
    'btn-alejar': () => cambiarZoom(-ZOOM_PASO),
    'btn-menu': irAlMenuPrincipal,
    'btn-jugar': jugarOReintentar
  };
  Object.keys(acciones).forEach((id) => {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.addEventListener('click', () => {
      acciones[id]();
      // Sin foco: así Espacio o Enter no vuelven a pulsar el botón mientras se juega
      boton.blur();
    });
  });

  // El audio solo puede iniciarse tras un gesto del usuario (iOS / Chrome)
  ['pointerdown', 'keydown'].forEach((ev) => {
    window.addEventListener(ev, prepararAudio, { once: true });
  });

  juego = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'contenedor-juego',
    width: ANCHO_PANTALLA,
    height: ALTO_PANTALLA,
    backgroundColor: '#000000',
    pixelArt: true,
    // Se ajusta a cualquier pantalla (computador o celular)
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: GRAVEDAD }, debug: false }
    },
    // Reconoce mandos conectados
    input: { gamepad: true },
    scene: [Arranque, Menu, Juego, Interfaz, Fin]
  });

  vigilarTamano();
}

iniciar();
