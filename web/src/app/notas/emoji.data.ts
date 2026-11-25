/** Emoji por categoría. Cada entrada es «emoji nombre palabras»: el nombre en español sirve para buscar. */
export interface EmojiCategory {
  id: string;
  label: string;
  /** Emoji que representa a la categoría en las pestañas. */
  icon: string;
  items: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'caras',
    label: 'Caras',
    icon: '😀',
    items: [
      '😀 sonrisa feliz', '😃 feliz alegre', '😄 risa contento', '😁 sonrisa dientes', '😆 carcajada', '😅 sudor risa alivio', '🤣 risa llorar', '😂 lagrimas de risa',
      '🙂 sonrisa leve', '🙃 al reves', '😉 guino', '😊 sonrojo feliz', '😇 angel inocente', '🥰 enamorado corazones', '😍 ojos de corazon', '🤩 estrellas asombro',
      '😘 beso', '😋 delicioso', '😛 lengua', '😜 guino lengua', '🤪 loco', '🤗 abrazo', '🤔 pensando duda', '🤨 ceja escepticismo', '😐 neutral', '😑 sin expresion',
      '😶 sin boca silencio', '🙄 ojos en blanco', '😏 picaro', '😒 fastidio', '😬 mueca', '😌 alivio tranquilo', '😔 triste pensativo', '😴 dormido sueno', '🤤 baba',
      '😷 mascarilla enfermo', '🤒 fiebre', '🤕 herido venda', '🤢 nauseas', '🤮 vomito', '🥵 calor', '🥶 frio', '🥴 mareado', '😵 aturdido', '🤯 mente explotando',
      '🤠 vaquero', '🥳 fiesta celebrar', '😎 gafas de sol genial', '🤓 nerd estudioso', '🧐 monoculo', '😕 confundido', '😟 preocupado', '😮 sorpresa', '😲 asombro',
      '😳 sonrojado', '🥺 suplica ojitos', '😢 llorando', '😭 llanto', '😱 miedo grito', '😖 frustrado', '😞 decepcion', '😓 sudor frio', '😩 cansado', '😫 agotado',
      '🥱 bostezo', '😤 enojo resoplido', '😡 enojado', '🤬 groserias', '😈 diablillo', '💀 calavera', '💩 popo', '🤡 payaso', '👻 fantasma', '👽 alien extraterrestre', '🤖 robot',
    ],
  },
  {
    id: 'gestos',
    label: 'Gestos y personas',
    icon: '👍',
    items: [
      '👍 pulgar arriba bien', '👎 pulgar abajo mal', '👌 perfecto ok', '✌️ paz victoria', '🤞 dedos cruzados suerte', '🤟 te amo', '🤘 rock', '👈 izquierda', '👉 derecha', '👆 arriba', '👇 abajo',
      '☝️ uno dedo', '✋ mano alto', '🖐️ mano abierta', '👋 saludo adios', '🤙 llamame', '💪 fuerza musculo', '🙏 gracias rezar por favor', '🤝 apreton de manos acuerdo', '👏 aplausos', '🙌 celebracion manos',
      '👐 manos abiertas', '✍️ escribir', '🤳 selfie', '💅 unas', '👀 ojos mirar', '👁️ ojo', '🧠 cerebro', '🫀 corazon organo', '🦷 diente', '👅 lengua', '👄 boca',
      '👶 bebe', '🧒 nino', '👦 chico', '👧 chica', '🧑 persona', '👨 hombre', '👩 mujer', '🧓 anciano', '👴 abuelo', '👵 abuela', '🧑‍💻 programador', '🧑‍🎓 estudiante', '🧑‍🏫 maestro',
      '🧑‍🍳 cocinero', '🧑‍⚕️ doctor medico', '🧑‍🔧 mecanico', '🧑‍🚀 astronauta', '🦸 superheroe', '🧙 mago', '🧛 vampiro', '🧜 sirena', '🧚 hada', '🏃 correr', '🚶 caminar', '🧘 meditar yoga', '💃 bailar', '🕺 bailarin',
    ],
  },
  {
    id: 'animales',
    label: 'Animales y naturaleza',
    icon: '🐶',
    items: [
      '🐶 perro', '🐱 gato', '🐭 raton', '🐹 hamster', '🐰 conejo', '🦊 zorro', '🐻 oso', '🐼 panda', '🐨 koala', '🐯 tigre', '🦁 leon', '🐮 vaca', '🐷 cerdo', '🐸 rana', '🐵 mono',
      '🙈 mono no ver', '🐔 gallina pollo', '🐧 pinguino', '🐦 pajaro', '🦆 pato', '🦅 aguila', '🦉 buho', '🦇 murcielago', '🐺 lobo', '🐴 caballo', '🦄 unicornio', '🐝 abeja', '🐛 oruga', '🦋 mariposa',
      '🐌 caracol', '🐞 mariquita', '🐜 hormiga', '🕷️ arana', '🐢 tortuga', '🐍 serpiente', '🦎 lagartija', '🐙 pulpo', '🦑 calamar', '🦀 cangrejo', '🐠 pez', '🐬 delfin', '🐳 ballena', '🦈 tiburon',
      '🐊 cocodrilo', '🐘 elefante', '🦒 jirafa', '🦓 cebra', '🐪 camello', '🌵 cactus', '🎄 arbol de navidad', '🌲 pino', '🌳 arbol', '🌴 palmera', '🌱 brote planta', '🌿 hierba', '🍀 trebol suerte', '🍁 hoja de arce',
      '🍂 hojas otono', '🌷 tulipan', '🌹 rosa', '🌻 girasol', '🌼 flor', '🌸 flor de cerezo', '💐 ramo', '🍄 hongo', '🌍 mundo tierra', '🌙 luna', '⭐ estrella', '🌟 estrella brillante', '✨ destellos', '⚡ rayo energia',
      '🔥 fuego llama', '🌈 arcoiris', '☀️ sol', '⛅ nublado', '☁️ nube', '🌧️ lluvia', '❄️ nieve', '💧 gota agua', '🌊 ola mar',
    ],
  },
  {
    id: 'comida',
    label: 'Comida y bebida',
    icon: '🍎',
    items: [
      '🍎 manzana', '🍊 naranja', '🍋 limon', '🍌 platano banana', '🍉 sandia', '🍇 uvas', '🍓 fresa', '🫐 arandanos', '🍒 cerezas', '🍑 durazno', '🥭 mango', '🍍 pina', '🥥 coco', '🥝 kiwi',
      '🍅 tomate jitomate', '🥑 aguacate', '🥦 brocoli', '🥕 zanahoria', '🌽 maiz elote', '🌶️ chile picante', '🥔 papa', '🧄 ajo', '🧅 cebolla', '🍞 pan', '🥐 cruasan', '🥖 baguette', '🧀 queso',
      '🥚 huevo', '🍳 huevo frito', '🥓 tocino', '🥩 carne', '🍗 pollo', '🍖 hueso carne', '🌭 hot dog', '🍔 hamburguesa', '🍟 papas fritas', '🍕 pizza', '🌮 taco', '🌯 burrito', '🥗 ensalada',
      '🍝 pasta espagueti', '🍜 sopa fideos', '🍣 sushi', '🍤 camaron', '🍚 arroz', '🍦 helado', '🍩 dona', '🍪 galleta', '🎂 pastel cumpleanos', '🍰 rebanada pastel', '🍫 chocolate', '🍬 dulce', '🍿 palomitas',
      '☕ cafe', '🍵 te', '🧃 jugo', '🥤 refresco vaso', '🍺 cerveza', '🍷 vino', '🍹 coctel', '🥛 leche', '💧 agua', '🧊 hielo',
    ],
  },
  {
    id: 'actividades',
    label: 'Actividades',
    icon: '⚽',
    items: [
      '⚽ futbol', '🏀 baloncesto', '🏈 futbol americano', '⚾ beisbol', '🎾 tenis', '🏐 voleibol', '🏉 rugby', '🎱 billar', '🏓 ping pong', '🏸 badminton', '🥊 boxeo', '🥋 artes marciales',
      '⛳ golf', '🏹 arco flecha', '🎣 pesca', '🏊 nadar', '🚴 ciclismo bicicleta', '🏋️ pesas gimnasio', '🤸 gimnasia', '🧗 escalar', '🏆 trofeo', '🥇 medalla oro primero', '🥈 medalla plata', '🥉 medalla bronce',
      '🎯 diana objetivo meta', '🎮 videojuegos', '🕹️ joystick', '🎲 dado', '🧩 rompecabezas', '♟️ ajedrez', '🎨 arte pintura', '🎭 teatro', '🎬 cine', '🎤 microfono', '🎧 audifonos', '🎵 musica nota', '🎶 notas musicales',
      '🎹 piano', '🎸 guitarra', '🥁 bateria', '🎺 trompeta', '🎻 violin', '📚 libros leer', '📖 libro abierto', '✏️ lapiz', '🖊️ pluma',
    ],
  },
  {
    id: 'viajes',
    label: 'Viajes y lugares',
    icon: '✈️',
    items: [
      '🚗 auto carro', '🚕 taxi', '🚌 autobus', '🚎 trolebus', '🏎️ carrera', '🚓 policia', '🚑 ambulancia', '🚒 bomberos', '🚚 camion', '🚜 tractor', '🏍️ moto', '🚲 bicicleta', '🛴 patineta scooter',
      '🚆 tren', '🚇 metro', '🚊 tranvia', '✈️ avion viaje', '🛫 despegue', '🛬 aterrizaje', '🚀 cohete lanzamiento', '🛸 ovni', '🚁 helicoptero', '⛵ velero', '🚢 barco', '⚓ ancla',
      '🏠 casa hogar', '🏡 casa jardin', '🏢 edificio oficina', '🏥 hospital', '🏦 banco', '🏫 escuela', '🏪 tienda', '🏭 fabrica', '🏰 castillo', '🗼 torre', '🗽 estatua libertad', '⛪ iglesia',
      '🏖️ playa', '🏝️ isla', '🏔️ montana', '🌋 volcan', '⛺ campamento', '🌆 ciudad', '🌃 noche ciudad', '🗺️ mapa', '🧭 brujula', '🎡 rueda de la fortuna', '🎢 montana rusa',
    ],
  },
  {
    id: 'objetos',
    label: 'Objetos',
    icon: '💡',
    items: [
      '💡 idea foco', '🔦 linterna', '📱 celular telefono', '💻 computadora laptop', '🖥️ monitor', '⌨️ teclado', '🖱️ raton mouse', '🖨️ impresora', '📷 camara', '🎥 video camara', '📺 television',
      '⏰ alarma reloj', '⌚ reloj', '⏳ reloj de arena tiempo', '⏱️ cronometro', '🔋 bateria', '🔌 enchufe', '💾 disquete guardar', '📀 disco', '📁 carpeta', '📂 carpeta abierta', '📄 documento hoja', '📃 pagina',
      '📋 portapapeles lista', '📌 chincheta fijar', '📍 ubicacion', '📎 clip', '🖇️ clips', '✂️ tijeras', '🗂️ organizador', '🗒️ bloc de notas', '📝 nota escribir', '📓 cuaderno', '📔 libreta', '📒 libro de cuentas',
      '📅 calendario', '📆 calendario fecha', '📈 grafica subiendo', '📉 grafica bajando', '📊 grafica barras', '💰 dinero bolsa', '💵 billete dolar', '💳 tarjeta credito', '🪙 moneda', '🧾 recibo cuenta',
      '✉️ correo sobre', '📧 email', '📦 paquete caja', '🛒 carrito compras', '🎁 regalo', '🔑 llave', '🔒 candado cerrado', '🔓 candado abierto', '🔨 martillo', '🔧 llave inglesa herramienta', '⚙️ engrane configuracion',
      '🧰 caja de herramientas', '🧪 prueba laboratorio', '🔬 microscopio', '🔭 telescopio', '💊 pastilla medicina', '🩺 estetoscopio', '🧹 escoba limpiar', '🧺 canasta ropa', '🛏️ cama', '🚿 ducha', '🛁 banera',
    ],
  },
  {
    id: 'simbolos',
    label: 'Símbolos',
    icon: '❤️',
    items: [
      '❤️ corazon rojo amor', '🧡 corazon naranja', '💛 corazon amarillo', '💚 corazon verde', '💙 corazon azul', '💜 corazon morado', '🖤 corazon negro', '🤍 corazon blanco', '💔 corazon roto', '💕 dos corazones',
      '💖 corazon brillante', '💯 cien perfecto', '✅ listo hecho check', '☑️ casilla marcada', '✔️ palomita', '❌ equis error', '❎ equis', '⭕ circulo', '❗ exclamacion importante', '❓ pregunta', '‼️ doble exclamacion',
      '⚠️ advertencia cuidado', '🚫 prohibido', '⛔ alto', '🔴 circulo rojo', '🟠 circulo naranja', '🟡 circulo amarillo', '🟢 circulo verde', '🔵 circulo azul', '🟣 circulo morado', '⚫ circulo negro', '⚪ circulo blanco',
      '🔺 triangulo rojo', '🔻 triangulo abajo', '🔶 rombo naranja', '🔷 rombo azul', '➕ mas sumar', '➖ menos restar', '➗ dividir', '✖️ multiplicar', '♾️ infinito', '💲 signo de dinero', '©️ derechos', '™️ marca',
      '⬆️ flecha arriba', '⬇️ flecha abajo', '⬅️ flecha izquierda', '➡️ flecha derecha', '↩️ regresar', '🔄 actualizar repetir', '🔁 repetir', '🔀 mezclar', '▶️ reproducir', '⏸️ pausa', '⏹️ detener',
      '🔔 campana notificacion', '🔕 sin sonido', '📣 megafono', '💬 comentario globo', '💭 pensamiento', '🗯️ enojo globo', '🏁 meta bandera', '🚩 bandera roja', '🏳️ bandera blanca', '🎉 fiesta confeti', '🎊 confeti', '🔖 marcador',
    ],
  },
];

export interface EmojiEntry {
  char: string;
  /** Nombre y palabras clave, sin acentos y en minúsculas. */
  words: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Todos los emoji de una categoría, listos para buscar. */
export function entriesOf(cat: EmojiCategory): EmojiEntry[] {
  return cat.items.map((raw) => {
    const at = raw.indexOf(' ');
    return { char: raw.slice(0, at), words: norm(raw.slice(at + 1)) };
  });
}

/** Busca en todas las categorías por nombre o palabra clave (sin acentos). */
export function searchEmoji(query: string): EmojiEntry[] {
  const q = norm(query).trim();
  if (!q) return [];
  const seen = new Set<string>();
  const out: EmojiEntry[] = [];
  for (const cat of EMOJI_CATEGORIES) {
    for (const e of entriesOf(cat)) {
      if (e.words.includes(q) && !seen.has(e.char)) {
        seen.add(e.char);
        out.push(e);
      }
    }
  }
  return out;
}
