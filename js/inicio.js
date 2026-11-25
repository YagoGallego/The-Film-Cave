import {
    supabase, sesion, misLikes, iniciarSesion, api, normalizarLista, esc, fecha, estrellas,
    pintarGrid, pintarError, tarjetaUsuario, abrirDetalle,
    desdeFila, iniciarPestanas
} from "./comun.js";

let paginaBusqueda = 1;
let totalPaginas = 1;
let modo = "peliculas"; // "peliculas" o "usuarios"

// ---------- Populares, recomendaciones y géneros ----------
async function cargarPopulares() {
    const grid = document.getElementById("populares");
    try {
        const datos = await api("/trending/movie/week");
        pintarGrid(grid, normalizarLista(datos.results).slice(0, 8));
    } catch {
        pintarError(grid);
    }
}

// Sin likes muestra las mejor valoradas; con likes, recomendaciones
// basadas en las 3 últimas películas que te gustaron
async function cargarRecomendaciones() {
    const grid = document.getElementById("recomendaciones");
    try {
        let lista;
        let semillas = [];
        if (sesion.usuario && misLikes.size > 0) {
            const { data } = await supabase.from("likes").select("movie_id")
                .eq("user_id", sesion.usuario.id).order("created_at", { ascending: false }).limit(3);
            semillas = (data || []).map(l => l.movie_id);
        }
        if (semillas.length === 0) {
            const datos = await api("/movie/top_rated");
            lista = normalizarLista(datos.results);
        } else {
            const respuestas = await Promise.all(semillas.map(id => api(`/movie/${id}/recommendations`)));
            const vistos = new Set();
            lista = normalizarLista(respuestas.flatMap(r => r.results))
                .filter(p => !misLikes.has(p.id) && !vistos.has(p.id) && vistos.add(p.id));
        }
        pintarGrid(grid, lista.slice(0, 12));
    } catch {
        pintarError(grid);
    }
}

async function cargarGeneros() {
    try {
        const datos = await api("/genre/movie/list");
        const select = document.getElementById("search-genre");
        datos.genres.forEach(g => {
            const op = document.createElement("option");
            op.value = g.id;
            op.textContent = g.name;
            select.appendChild(op);
        });
    } catch {}
}

// ---------- Buscador de películas ----------
async function buscarPeliculas(numPagina = 1) {
    const texto = document.getElementById("search-text").value.trim();
    const genero = document.getElementById("search-genre").value;
    const seccion = document.getElementById("seccion-resultados");
    const grid = document.getElementById("resultados");
    const botonMas = document.getElementById("cargar-mas");

    if (!texto && !genero) {
        seccion.hidden = true;
        return;
    }

    seccion.hidden = false;
    if (numPagina === 1) grid.innerHTML = '<p class="vacio">Buscando...</p>';

    try {
        let datos;
        if (texto) {
            datos = await api("/search/movie", { query: texto, page: numPagina, include_adult: false });
        } else {
            datos = await api("/discover/movie", {
                with_genres: genero, sort_by: "popularity.desc", "vote_count.gte": 50, page: numPagina
            });
        }
        let lista = normalizarLista(datos.results);

        // La búsqueda por texto de TMDB no filtra por género, así que se filtra aquí
        if (texto && genero) lista = lista.filter(p => p.generos.includes(Number(genero)));

        paginaBusqueda = numPagina;
        totalPaginas = Math.min(datos.total_pages, 500);
        pintarGrid(grid, lista, numPagina > 1);
        botonMas.hidden = paginaBusqueda >= totalPaginas;
    } catch {
        pintarError(grid);
        botonMas.hidden = true;
    }
}

// ---------- Buscador de usuarios ----------
async function buscarUsuarios() {
    const texto = document.getElementById("search-text").value.trim();
    const seccion = document.getElementById("seccion-usuarios");
    const grid = document.getElementById("resultados-usuarios");
    if (!texto) {
        seccion.hidden = true;
        return;
    }
    seccion.hidden = false;
    grid.innerHTML = '<p class="vacio">Buscando...</p>';

    // Los % y _ son comodines en ilike: se escapan para buscar el texto tal cual
    const patron = "%" + texto.replace(/[%_\\]/g, c => "\\" + c) + "%";
    const { data, error } = await supabase.from("profiles")
        .select("id, username, bio").ilike("username", patron).order("username").limit(24);
    if (error) return pintarError(grid);
    grid.innerHTML = data.length
        ? data.map(tarjetaUsuario).join("")
        : '<p class="vacio">No se encontró ningún usuario.</p>';
}

function cambiarModo(nuevo) {
    modo = nuevo;
    const input = document.getElementById("search-text");
    input.placeholder = modo === "usuarios" ? "Buscar usuario..." : "Buscar película...";
    document.getElementById("search-genre").hidden = modo === "usuarios";
    document.getElementById("seccion-resultados").hidden = true;
    document.getElementById("seccion-usuarios").hidden = true;
    input.focus();
    if (input.value.trim()) buscar();
}

const buscar = () => modo === "usuarios" ? buscarUsuarios() : buscarPeliculas(1);

// ---------- Tu actividad reciente (últimas entradas de tu diario) ----------
function filaActividad(entrada) {
    return `
        <p class="activity-item">
            <span class="activity-texto">
                <button type="button" class="enlace-peli" data-id="${entrada.movie_id}">${esc(entrada.movie_title)}</button>
                <span class="estrellas">${estrellas(entrada.rating)}</span>
            </span>
            <span>${fecha(entrada.watched_on)}</span>
        </p>`;
}

async function cargarActividad() {
    const cont = document.getElementById("actividad");

    if (!sesion.usuario) {
        cont.innerHTML = '<p class="vacio"><a href="login.html">Iniciá sesión</a> para ver tu actividad.</p>';
        return;
    }

    const { data, error } = await supabase.from("diary_entries").select("*")
        .eq("user_id", sesion.usuario.id)
        .order("created_at", { ascending: false }).limit(10);
    if (error) return pintarError(cont);

    cont.innerHTML = data.length
        ? data.map(filaActividad).join("")
        : '<p class="vacio">Abrí una película y registrala en tu diario.</p>';

    // Guardar las entradas para poder abrir el detalle al hacer clic en el título
    entradasActividad = data;
}

let entradasActividad = [];

function iniciarInicio() {
    iniciarPestanas(document.querySelector('.tabs[data-grupo="busqueda"]'), cambiarModo);

    document.getElementById("search-form").addEventListener("submit", e => {
        e.preventDefault();
        buscar();
    });
    document.getElementById("search-genre").addEventListener("change", () => buscarPeliculas(1));
    document.getElementById("cargar-mas").addEventListener("click", () => buscarPeliculas(paginaBusqueda + 1));

    // Clic en el título de una película de la actividad: abre su detalle
    document.getElementById("seccion-actividad").addEventListener("click", e => {
        const btn = e.target.closest(".enlace-peli");
        if (!btn) return;
        const entrada = entradasActividad.find(x => x.movie_id === Number(btn.dataset.id));
        if (entrada) abrirDetalle(desdeFila(entrada));
    });

    document.addEventListener("likes-cambiados", cargarRecomendaciones);
    document.addEventListener("diario-cambiado", cargarActividad);

    cargarGeneros();
    cargarPopulares();
    cargarRecomendaciones();
    cargarActividad();
}

await iniciarSesion();
iniciarInicio();
