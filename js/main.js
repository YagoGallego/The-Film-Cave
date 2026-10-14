// ---------- Configuración de TMDB ----------
const API_KEY = "36a84063a6883f39c54ec819be61cb25";
const API_URL = "https://api.themoviedb.org/3";
const IMG_URL = "https://image.tmdb.org/t/p/w342";

const cache = new Map();

async function api(ruta, params = {}) {
    const url = new URL(API_URL + ruta);
    url.search = new URLSearchParams({ api_key: API_KEY, language: "es-ES", ...params });
    const clave = url.toString();
    if (cache.has(clave)) return cache.get(clave);
    const res = await fetch(clave);
    if (!res.ok) throw new Error("TMDB respondió " + res.status);
    const datos = await res.json();
    cache.set(clave, datos);
    return datos;
}

function normalizar(m) {
    return {
        id: m.id,
        titulo: m.title,
        portada: m.poster_path ? IMG_URL + m.poster_path : null,
        generos: m.genre_ids || []
    };
}

function normalizarLista(resultados) {
    return resultados.map(normalizar).filter(p => p.portada);
}

function leer(clave, porDefecto) {
    try {
        return JSON.parse(localStorage.getItem(clave)) ?? porDefecto;
    } catch {
        return porDefecto;
    }
}
function guardar(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch {}
}

let likes = leer("likes_tmdb", []);   
let actividad = leer("actividad", []);  

const esLike = id => likes.some(l => l.id === id);

const gridPopulares = document.getElementById("populares");
const gridRecomendaciones = document.getElementById("recomendaciones");
const gridResultados = document.getElementById("resultados");
const seccionResultados = document.getElementById("seccion-resultados");
const botonMas = document.getElementById("cargar-mas");
const listaActividad = document.getElementById("actividad");
const sidebarActividad = document.getElementById("sidebar-actividad");
const form = document.getElementById("search-form");
const inputTexto = document.getElementById("search-text");
const selectGenero = document.getElementById("search-genre");

function crearTarjeta(p) {
    const liked = esLike(p.id);
    const art = document.createElement("article");
    art.className = "movie-card";
    art.dataset.title = p.titulo;
    art.dataset.id = p.id;
    art.innerHTML = `
        <img src="${p.portada}" alt="${p.titulo}" loading="lazy">
        <button class="like-btn ${liked ? "liked" : ""}" aria-label="Like">${liked ? "♥" : "♡"}</button>
    `;
    art.querySelector("img").addEventListener("click", () => registrar(`Viste "${p.titulo}"`));
    art.querySelector(".like-btn").addEventListener("click", () => toggleLike(p));
    return art;
}

function pintarGrid(contenedor, lista, anexar = false) {
    if (!anexar) contenedor.innerHTML = "";
    else contenedor.querySelector(".vacio")?.remove();
    if (lista.length === 0 && !anexar) {
        contenedor.innerHTML = '<p class="vacio">No hay películas para mostrar.</p>';
        return;
    }
    lista.forEach(p => contenedor.appendChild(crearTarjeta(p)));
}

function pintarError(contenedor) {
    contenedor.innerHTML = '<p class="vacio">No se pudieron cargar las películas. Revisá tu conexión y la API key.</p>';
}

function pintarActividad() {
    const items = actividad.slice(0, 10);
    listaActividad.innerHTML = items.length
        ? items.map(a => `<p class="activity-item">${a.texto}<span>${a.fecha}</span></p>`).join("")
        : '<p class="vacio">Todavía no hay actividad.</p>';
    sidebarActividad.innerHTML = items.length
        ? items.slice(0, 5).map(a => `<p class="activity-item">${a.texto}</p>`).join("")
        : '<p class="vacio">Sin novedades.</p>';
}


async function cargarPopulares() {
    try {
        const datos = await api("/trending/movie/week");
        pintarGrid(gridPopulares, normalizarLista(datos.results).slice(0, 8));
    } catch {
        pintarError(gridPopulares);
    }
}


async function cargarRecomendaciones() {
    try {
        let lista;
        if (likes.length === 0) {
            const datos = await api("/movie/top_rated");
            lista = normalizarLista(datos.results);
        } else {
            const semillas = likes.slice(-3);
            const respuestas = await Promise.all(
                semillas.map(l => api(`/movie/${l.id}/recommendations`))
            );
            const vistos = new Set();
            lista = normalizarLista(respuestas.flatMap(r => r.results))
                .filter(p => !esLike(p.id) && !vistos.has(p.id) && vistos.add(p.id));
        }
        pintarGrid(gridRecomendaciones, lista.slice(0, 12));
    } catch {
        pintarError(gridRecomendaciones);
    }
}

async function cargarGeneros() {
    try {
        const datos = await api("/genre/movie/list");
        datos.genres.forEach(g => {
            const op = document.createElement("option");
            op.value = g.id;
            op.textContent = g.name;
            selectGenero.appendChild(op);
        });
    } catch {}
}

let paginaBusqueda = 1;
let totalPaginas = 1;

async function buscar(pagina = 1) {
    const texto = inputTexto.value.trim();
    const genero = selectGenero.value;

    if (!texto && !genero) {
        seccionResultados.hidden = true;
        return;
    }

    seccionResultados.hidden = false;
    if (pagina === 1) gridResultados.innerHTML = '<p class="vacio">Buscando...</p>';

    try {
        let datos;
        if (texto) {
            datos = await api("/search/movie", { query: texto, page: pagina, include_adult: false });
        } else {
            datos = await api("/discover/movie", {
                with_genres: genero, sort_by: "popularity.desc", "vote_count.gte": 50, page: pagina
            });
        }
        let lista = normalizarLista(datos.results);

        if (texto && genero) lista = lista.filter(p => p.generos.includes(Number(genero)));

        paginaBusqueda = pagina;
        totalPaginas = Math.min(datos.total_pages, 500);
        pintarGrid(gridResultados, lista, pagina > 1);
        botonMas.hidden = paginaBusqueda >= totalPaginas;
    } catch {
        pintarError(gridResultados);
        botonMas.hidden = true;
    }
}

function registrar(texto) {
    actividad.unshift({ texto, fecha: new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) });
    guardar("actividad", actividad);
    pintarActividad();
}

function toggleLike(p) {
    if (esLike(p.id)) {
        likes = likes.filter(l => l.id !== p.id);
        registrar(`Quitaste el like a "${p.titulo}"`);
    } else {
        likes.push({ id: p.id, titulo: p.titulo, portada: p.portada });
        registrar(`Le diste like a "${p.titulo}"`);
    }
    guardar("likes_tmdb", likes);

    document.querySelectorAll(`.movie-card[data-id="${p.id}"] .like-btn`).forEach(btn => {
        const liked = esLike(p.id);
        btn.classList.toggle("liked", liked);
        btn.textContent = liked ? "♥" : "♡";
    });

    cargarRecomendaciones();
}

form.addEventListener("submit", e => {
    e.preventDefault();
    buscar(1);
});
selectGenero.addEventListener("change", () => buscar(1));
botonMas.addEventListener("click", () => buscar(paginaBusqueda + 1));

pintarActividad();
cargarGeneros();
cargarPopulares();
cargarRecomendaciones();
