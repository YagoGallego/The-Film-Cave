// =====================================================================
//  PÁGINA: ADIVINA LA PELÍCULA (juego.html)
//  Cada día hay una película con 6 escenas. Cada fallo o salto
//  desbloquea la escena siguiente (con su pista escrita encima).
// =====================================================================
import { supabase, sesion, iniciarSesion, esc, fecha, hoyISO, api, IMG_URL, iniciarPestanas } from "./comun.js";

const $ = id => document.getElementById(id);
const MAX_INTENTOS = 6;

// ---------- Películas de cada día ----------
// Para añadir un día nuevo: crear la carpeta en assets/films y copiar un bloque.
//  - fecha:    el día en que se publica (los días futuros no se muestran todavía)
//  - tmdbId:   id de la película en TMDB (sale en la URL de themoviedb.org/movie/ID)
//  - titulos:  otras formas válidas de escribir el título (sin importar tildes ni mayúsculas)
//  - imagenes: las 6 escenas en orden
//  - pistas:   el texto que aparece encima de cada escena ("" = sin pista)
const DIAS = [
    {
        numero: 1,
        fecha: "2026-11-23",
        carpeta: "day #1",
        tmdbId: 155,
        titulos: ["The Dark Knight", "El caballero oscuro", "Batman The Dark Knight", "Batman El caballero oscuro"],
        imagenes: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png"],
        pistas: ["", "IMDb: 9.1", "Géneros: acción, crimen, thriller", "Estreno: 2008",
                 "Actor notable: Christian Bale", "Director: Christopher Nolan"]
    },
    {
        numero: 2,
        fecha: "2026-11-24",
        carpeta: "day #2",
        tmdbId: 346364,
        titulos: ["It", "Eso"],
        imagenes: ["1.png", "2.png", "3.png", "4.png", "5.png", "6.png"],
        pistas: ["", "IMDb: 7.3", "Género: terror", "Estreno: 2017",
                 "Actor notable: Bill Skarsgård", "Director: Andy Muschietti"]
    },
    {
        numero: 3,
        fecha: "2026-11-25",
        carpeta: "day #3",
        tmdbId: 157336,
        titulos: ["Interstellar", "Interestelar"],
        imagenes: [
            "Screenshot 2026-11-25 181551.png", "Screenshot 2026-11-25 181611.png",
            "Screenshot 2026-11-25 182129.png", "Screenshot 2026-11-25 182247.png",
            "Screenshot 2026-11-25 182317.png", "Screenshot 2026-11-25 182537.png"
        ],
        pistas: ["", "IMDb: 8.7", "Géneros: ciencia ficción, aventura, drama", "Estreno: 2014",
                 "Actor notable: Matthew McConaughey", "Director: Christopher Nolan"]
    }
];

// Solo los días que ya llegaron
const dias = DIAS.filter(d => d.fecha <= hoyISO());

// Resultados guardados en Supabase: { "AAAA-MM-DD": { correct, attempts, points } }
let resultados = {};

// Partida abierta
let dia = null;          // día que se está jugando
let intentos = [];       // [{ tipo: "fallo" | "salto" | "acierto", titulo }]
let viendo = 0;          // índice de la escena que se está mirando
let elegida = null;      // película elegida en las sugerencias { id, titulo }

// ---------- Utilidades ----------
// "day #1" tiene un # y espacios: hay que codificarlos o el navegador corta la ruta
const rutaImagen = (d, i) =>
    `assets/films/${encodeURIComponent(d.carpeta)}/${encodeURIComponent(d.imagenes[i])}`;

// Quita tildes, mayúsculas y signos para comparar títulos
const normalizarTexto = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");

const puntosPor = n => MAX_INTENTOS + 1 - n; // 1º intento = 6 puntos ... 6º = 1

const terminado = () =>
    intentos.some(i => i.tipo === "acierto") || intentos.length >= MAX_INTENTOS;

const acerto = () => intentos.some(i => i.tipo === "acierto");

// Escenas desbloqueadas: una por intento usado, todas al terminar
const desbloqueadas = () => terminado() ? MAX_INTENTOS : Math.min(intentos.length + 1, MAX_INTENTOS);

// El progreso de cada día se guarda en el navegador para no perderlo al recargar
const claveLocal = f => "fc-juego-" + f;
function leerLocal(f) {
    try { return JSON.parse(localStorage.getItem(claveLocal(f))) || []; } catch { return []; }
}
function guardarLocal() {
    try { localStorage.setItem(claveLocal(dia.fecha), JSON.stringify(intentos)); } catch { /* sin almacenamiento */ }
}

// ---------- Puntos y lista de días ----------
async function cargarResultados() {
    if (!sesion.usuario) return;
    const { data } = await supabase.from("game_results")
        .select("game_date, correct, attempts, points").eq("user_id", sesion.usuario.id);
    resultados = Object.fromEntries((data || []).map(r => [r.game_date, r]));
    $("puntos").textContent = (data || []).reduce((s, r) => s + (r.points || 0), 0);
}

// Estado de un día: primero lo guardado en Supabase, si no lo del navegador
function estadoDia(d) {
    const r = resultados[d.fecha];
    if (r) return { jugado: true, correcto: r.correct, puntos: r.points };
    const local = leerLocal(d.fecha);
    const gano = local.some(i => i.tipo === "acierto");
    if (gano || local.length >= MAX_INTENTOS) {
        return { jugado: true, correcto: gano, puntos: gano ? puntosPor(local.length) : 0 };
    }
    return { jugado: false, enCurso: local.length > 0 };
}

function pintarDias() {
    const cont = $("lista-dias");
    if (dias.length === 0) {
        cont.innerHTML = '<p class="vacio">Todavía no hay juegos. ¡Volvé pronto!</p>';
        return;
    }
    const ordenados = [...dias].sort((a, b) => b.fecha.localeCompare(a.fecha));
    cont.innerHTML = ordenados.map(d => {
        const e = estadoDia(d);
        const clase = e.jugado ? (e.correcto ? "acertado" : "jugado") : "";
        const estado = e.jugado ? (e.correcto ? `✓ +${e.puntos}` : "✗ Jugado")
                     : e.enCurso ? "Continuar →" : "Jugar →";
        return `
            <button type="button" class="dia-card ${clase}" data-fecha="${esc(d.fecha)}">
                <span class="dia-numero">#${d.numero}</span>
                <span class="dia-fecha">${fecha(d.fecha)}</span>
                <span class="dia-estado">${estado}</span>
            </button>`;
    }).join("");
}

// ---------- Tablero ----------
function abrirDia(d) {
    dia = d;
    intentos = leerLocal(d.fecha);
    // Si ya está guardado en Supabase pero no en este navegador, se muestra como terminado
    const r = resultados[d.fecha];
    if (r && !terminado()) {
        intentos = Array.from({ length: r.attempts }, (_, i) =>
            ({ tipo: r.correct && i === r.attempts - 1 ? "acierto" : "fallo", titulo: "(jugado en otro dispositivo)" }));
        if (!r.correct) while (intentos.length < MAX_INTENTOS) intentos.push({ tipo: "fallo", titulo: "—" });
    }
    viendo = desbloqueadas() - 1;

    $("juego-titulo-dia").textContent = `Película #${d.numero}`;
    $("juego-fecha").textContent = fecha(d.fecha);
    $("juego-aviso-login").hidden = !!sesion.usuario;
    document.querySelector(".tabs").hidden = true;
    document.querySelector('[data-panel="dias"]').hidden = true;
    document.querySelector('[data-panel="como"]').hidden = true;
    $("vista-juego").hidden = false;
    pintarTablero();
    // Lo jugó sin sesión y ahora inició sesión: se guardan los puntos
    if (terminado()) guardarResultado();
}

function cerrarDia() {
    dia = null;
    $("vista-juego").hidden = true;
    document.querySelector(".tabs").hidden = false;
    document.querySelector('.tabs [data-tab="dias"]').click();
    pintarDias();
}

function pintarTablero() {
    const fin = terminado();
    const abiertas = desbloqueadas();

    // Escena y pista
    $("juego-img").src = rutaImagen(dia, viendo);
    const pista = dia.pistas[viendo];
    $("juego-pista-texto").textContent = pista;
    $("juego-pista-texto").hidden = !pista;

    // Botones 1-6
    $("juego-numeros").innerHTML = dia.imagenes.map((_, i) => `
        <button type="button" data-i="${i}" class="${i === viendo ? "activo" : ""}"
            ${i >= abiertas ? "disabled" : ""}>${i + 1}</button>`).join("");

    // Intentos restantes
    const quedan = MAX_INTENTOS - intentos.length;
    $("juego-restantes").textContent = fin ? "" :
        quedan === 1 ? "¡Último intento!" : `Te quedan ${quedan} intentos`;

    $("btn-saltar").hidden = fin;
    $("form-adivinar").hidden = fin;

    // Lista de intentos
    $("juego-respuestas").innerHTML = intentos.map(i => i.tipo === "acierto"
        ? `<li class="correcta">✅ ${esc(i.titulo)}</li>`
        : i.tipo === "salto" ? `<li class="saltado">⏭ Saltado</li>`
        : `<li>❌ ${esc(i.titulo)}</li>`).join("");

    pintarFinal();
}

async function pintarFinal() {
    const caja = $("juego-final");
    if (!terminado()) { caja.hidden = true; return; }
    const gano = acerto();
    const pts = gano ? puntosPor(intentos.length) : 0;
    caja.className = "juego-final " + (gano ? "gano" : "perdio");
    caja.innerHTML = `
        <div class="juego-final-poster"></div>
        <div>
            <strong>${gano ? `¡Acertaste en ${intentos.length} ${intentos.length === 1 ? "intento" : "intentos"}!` : "¡Se acabaron los intentos!"}</strong>
            <p>La película era <b id="juego-solucion">${esc(dia.titulos[0])}</b>.</p>
            <p class="juego-final-pts">${gano ? `+${pts} puntos` : "0 puntos"}</p>
        </div>`;
    caja.hidden = false;
    // Portada y título en español desde TMDB
    try {
        const m = await api(`/movie/${dia.tmdbId}`);
        if (m.poster_path) caja.querySelector(".juego-final-poster").innerHTML =
            `<img src="${IMG_URL + m.poster_path}" alt="">`;
        const sol = caja.querySelector("#juego-solucion");
        if (sol && m.title) sol.textContent = `${m.title} (${(m.release_date || "").slice(0, 4)})`;
    } catch { /* sin portada, no pasa nada */ }
}

// ---------- Jugar ----------
async function registrarIntento(intento) {
    if (!dia || terminado()) return;
    intentos.push(intento);
    guardarLocal();
    // La escena nueva que se desbloquea pasa a verse
    viendo = desbloqueadas() - 1;
    pintarTablero();
    if (terminado()) await guardarResultado();
}

async function guardarResultado() {
    if (!sesion.usuario || resultados[dia.fecha]) return;
    const fila = {
        user_id: sesion.usuario.id,
        game_date: dia.fecha,
        correct: acerto(),
        attempts: intentos.length,
        points: acerto() ? puntosPor(intentos.length) : 0
    };
    const { error } = await supabase.from("game_results").insert(fila);
    if (error) { console.error("No se pudo guardar el resultado:", error); return; }
    resultados[dia.fecha] = fila;
    $("puntos").textContent = Object.values(resultados).reduce((s, r) => s + (r.points || 0), 0);
}

function esCorrecta(texto, id) {
    if (id != null) return id === dia.tmdbId;
    const t = normalizarTexto(texto);
    return dia.titulos.some(x => normalizarTexto(x) === t);
}

function adivinar(e) {
    e.preventDefault();
    const texto = $("adivinar-texto").value.trim();
    if (!texto) return;
    // Si eligió de la lista y no cambió el texto, se compara por id de TMDB
    const id = elegida && elegida.titulo === texto ? elegida.id : null;
    const ok = esCorrecta(texto, id);
    $("adivinar-texto").value = "";
    elegida = null;
    ocultarSugerencias();
    registrarIntento({ tipo: ok ? "acierto" : "fallo", titulo: texto });
}

// ---------- Sugerencias mientras se escribe (búsqueda en TMDB) ----------
let temporizador = null;
let ultimaBusqueda = "";

function ocultarSugerencias() {
    $("juego-sugerencias").hidden = true;
    $("juego-sugerencias").innerHTML = "";
}

function alEscribir() {
    elegida = null;
    const q = $("adivinar-texto").value.trim();
    clearTimeout(temporizador);
    if (q.length < 2) return ocultarSugerencias();
    temporizador = setTimeout(async () => {
        ultimaBusqueda = q;
        try {
            const datos = await api("/search/movie", { query: q });
            if (q !== ultimaBusqueda) return; // llegó tarde una búsqueda vieja
            const pelis = datos.results.slice(0, 6);
            const lista = $("juego-sugerencias");
            if (!pelis.length) return ocultarSugerencias();
            lista.innerHTML = pelis.map(m => `
                <li><button type="button" data-id="${m.id}" data-titulo="${esc(m.title)}">
                    ${esc(m.title)} <span>${esc((m.release_date || "").slice(0, 4))}</span>
                </button></li>`).join("");
            lista.hidden = false;
        } catch { ocultarSugerencias(); }
    }, 250);
}

// ---------- Inicio ----------
function iniciarJuego() {
    iniciarPestanas(document.querySelector('.tabs[data-grupo="juego"]'));

    $("lista-dias").addEventListener("click", e => {
        const btn = e.target.closest(".dia-card");
        const d = btn && dias.find(x => x.fecha === btn.dataset.fecha);
        if (d) abrirDia(d);
    });
    $("volver-dias").addEventListener("click", cerrarDia);

    $("juego-numeros").addEventListener("click", e => {
        const btn = e.target.closest("button[data-i]");
        if (!btn || btn.disabled) return;
        viendo = Number(btn.dataset.i);
        pintarTablero();
    });
    $("btn-saltar").addEventListener("click", () => registrarIntento({ tipo: "salto", titulo: "" }));

    $("form-adivinar").addEventListener("submit", adivinar);
    $("adivinar-texto").addEventListener("input", alEscribir);
    $("adivinar-texto").addEventListener("keydown", e => { if (e.key === "Escape") ocultarSugerencias(); });
    $("juego-sugerencias").addEventListener("click", e => {
        const btn = e.target.closest("button[data-id]");
        if (!btn) return;
        elegida = { id: Number(btn.dataset.id), titulo: btn.dataset.titulo };
        $("adivinar-texto").value = elegida.titulo;
        ocultarSugerencias();
        $("adivinar-texto").focus();
    });
    document.addEventListener("click", e => {
        if (!e.target.closest(".juego-buscador")) ocultarSugerencias();
    });

    pintarDias();
    cargarResultados().then(pintarDias);
}

await iniciarSesion();
iniciarJuego();
