// TMDB, sesión de Supabase, cabecera, tarjetas de película, diálogo de detalle (like, reseña, diario) y diálogo "Añadir a lista".

import { supabase } from "./supabase.js"; // Trae al cliente que "habla" con la bd y con el sistema de login
export { supabase };

// TMDB
const API_KEY = "36a84063a6883f39c54ec819be61cb25";
const API_URL = "https://api.themoviedb.org/3"; // Direccion base de la API. Cada peticion le suma una ruta
export const IMG_URL = "https://image.tmdb.org/t/p/w342"; // Direccion base de las imagenes 


const cache = new Map(); // Guarda las respuestas de la API para no repetir la misma petición

// Hace una petición a TMDB y devuelve el JSON de la respuesta
export async function api(ruta, params = {}) {
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

// Convierte una película de TMDB al formato que usa la página
export function normalizar(m) {
    return {
        id: m.id,
        titulo: m.title,
        portada: m.poster_path ? IMG_URL + m.poster_path : null,
        anio: (m.release_date || "").slice(0, 4),
        generos: m.genre_ids || []
    };
}

// Normaliza una lista de resultados y quita las películas sin portada
export function normalizarLista(resultados) {
    return resultados.map(normalizar).filter(p => p.portada);
}

// Pasa de una fila de la base de datos a una película y al revés
export const desdeFila = f => ({ id: f.movie_id, titulo: f.movie_title, portada: f.movie_poster });
export const aFila = p => ({ movie_id: p.id, movie_title: p.titulo, movie_poster: p.portada });

// ---------- Utilidades ----------
// Escapa caracteres especiales para poder meter texto dentro de innerHTML
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "2026-11-18" -> "18 nov 2026". Se añade la hora para que no cambie de día por la zona horaria
export function fecha(iso) {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

// Fecha de hoy en formato "AAAA-MM-DD" (hora local)
export function hoyISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export const estrellas = n => n ? "★".repeat(n) + "☆".repeat(5 - n) : ""; // Recibe un numero del 1 al 5 y devuelve estrellas llenas y vacias segun la calificación  

// Avatar con la inicial del usuario
export function avatarHTML(perfil, clase = "") {
    const letra = (perfil?.username || "?").charAt(0).toUpperCase(); // Toma el nombre del usuario y selecciona la primera letra de su nombre para ponerla de foto de perfil predeterminadamente
    return `<span class="avatar ${clase}">${esc(letra)}</span>`;
}

export function enlaceUsuario(perfil) {
    if (!perfil) return "<span>Usuario</span>";
    return `<a class="enlace-usuario" href="perfil.html?id=${encodeURIComponent(perfil.id)}">${esc(perfil.username)}</a>`;
}

export function pintarError(contenedor, texto = "No se pudieron cargar los datos. Revisá tu conexión.") {
    contenedor.innerHTML = `<p class="vacio">${esc(texto)}</p>`;
}

// Trae los perfiles de varios usuarios a la vez y los devuelve en un Map por id
export async function obtenerPerfiles(ids) {
    const unicos = [...new Set(ids)].filter(Boolean);
    const mapa = new Map();
    if (unicos.length === 0) return mapa;
    const { data } = await supabase.from("profiles").select("id, username, bio").in("id", unicos);
    (data || []).forEach(p => mapa.set(p.id, p));
    return mapa;
}

// Tarjeta de usuario (buscador de usuarios)
export function tarjetaUsuario(p) {
    return `
        <a class="user-card" href="perfil.html?id=${encodeURIComponent(p.id)}">
            ${avatarHTML(p)}
            <span>
                <strong>${esc(p.username)}</strong>
                ${p.bio ? `<small>${esc(p.bio)}</small>` : ""}
            </span>
        </a>`;
}

//  Sesión
// sesion.usuario: usuario de Supabase Auth (o null si no inició sesión)
// sesion.perfil:  su fila de la tabla profiles
export const sesion = { usuario: null, perfil: null };

// Ids de las películas que le gustan al usuario (para pintar los corazones)

export const misLikes = new Set(); // set con los ids de las peliculas que le gustan al usuario 

export async function iniciarSesion() {
    const { data } = await supabase.auth.getSession();
    sesion.usuario = data.session?.user ?? null;

    if (sesion.usuario) {
        const { data: perfil } = await supabase.from("profiles")
            .select("id, username, bio, avatar_url").eq("id", sesion.usuario.id).maybeSingle();
        sesion.perfil = perfil;

        // Por si el perfil no se creó al registrarse
        if (!perfil) {
            const username = sesion.usuario.user_metadata?.username || sesion.usuario.email.split("@")[0];
            const { data: nuevo } = await supabase.from("profiles")
                .insert({ id: sesion.usuario.id, username }).select().maybeSingle();
            sesion.perfil = nuevo || { id: sesion.usuario.id, username };
        }

        const { data: likes } = await supabase.from("likes").select("movie_id").eq("user_id", sesion.usuario.id); // Carga sus likes y mete cada movie_id en misLikes
        (likes || []).forEach(l => misLikes.add(l.movie_id));
    }

    pintarCabecera();
    crearDialogos();
}

// Si no hay sesion, la pide. Sirve para que el usuario se registre antes de hacer funciones que necesiten sesion 
export function pedirLogin() {
    if (sesion.usuario) return false;
    const volver = location.pathname.split("/").pop() + location.search;
    location.href = "login.html?volver=" + encodeURIComponent(volver);
    return true;
}

export async function cerrarSesion() {
    await supabase.auth.signOut();
    location.href = "index.html";
}

// Avatar con la inicial si hay sesión, botón "Entrar" si no
function pintarCabecera() {
    const avatar = document.querySelector(".header > .avatar");
    if (!avatar) return;
    if (sesion.perfil) {
        avatar.textContent = sesion.perfil.username.charAt(0).toUpperCase();
        avatar.title = sesion.perfil.username;
    } else {
        const entrar = document.createElement("a");
        entrar.href = "login.html";
        entrar.className = "btn-entrar";
        entrar.textContent = "Entrar";
        avatar.replaceWith(entrar);
    }
}

// Likes

export async function toggleLike(p) {
    if (pedirLogin()) return;
    const uid = sesion.usuario.id;
    const yaLeGusta = misLikes.has(p.id);

    // Se actualiza la pantalla primero y luego la base de datos
    if (yaLeGusta) misLikes.delete(p.id); else misLikes.add(p.id);
    actualizarCorazones(p.id);

    const { error } = yaLeGusta
        ? await supabase.from("likes").delete().eq("user_id", uid).eq("movie_id", p.id)
        : await supabase.from("likes").insert({ user_id: uid, ...aFila(p) });

    if (error) {
        // Si falló, se deshace el cambio
        if (yaLeGusta) misLikes.add(p.id); else misLikes.delete(p.id);
        actualizarCorazones(p.id);
        alert("No se pudo guardar el like.");
        return;
    }
    document.dispatchEvent(new CustomEvent("likes-cambiados"));
}

function actualizarCorazones(id) {
    const liked = misLikes.has(id);
    document.querySelectorAll(`.movie-card[data-id="${id}"] .like-btn`).forEach(btn => {
        btn.classList.toggle("liked", liked);
        btn.textContent = liked ? "♥" : "♡";
    });
    const btnDetalle = document.querySelector(`#dialogo-detalle .detalle-like[data-id="${id}"]`);
    if (btnDetalle) {
        btnDetalle.classList.toggle("liked", liked);
        btnDetalle.textContent = liked ? "♥ Te gusta" : "♡ Me gusta";
    }
}

// =====================================================================
//  TARJETAS DE PELÍCULA
// =====================================================================
// opciones.quitar: si se pasa, el botón de la izquierda quita la película de la lista (en vez de abrir "Añadir a lista")
export function crearTarjeta(p, opciones = {}) {
    const liked = misLikes.has(p.id);
    const art = document.createElement("article");
    art.className = "movie-card";
    art.dataset.title = p.titulo;
    art.dataset.id = p.id;
    let botonLista = "";
    if (opciones.quitar) {
        botonLista = '<button class="list-btn quitar" aria-label="Quitar de la lista" title="Quitar de la lista">×</button>';
    } else if (opciones.quitar !== false) {
        botonLista = '<button class="list-btn" aria-label="Añadir a lista" title="Añadir a lista">+</button>';
    }
    art.innerHTML = `
        <img src="${esc(p.portada)}" alt="${esc(p.titulo)}" loading="lazy">
        <button class="like-btn ${liked ? "liked" : ""}" aria-label="Like">${liked ? "♥" : "♡"}</button>
        ${botonLista}
    `;
    art.querySelector("img").addEventListener("click", () => abrirDetalle(p));
    art.querySelector(".like-btn").addEventListener("click", () => toggleLike(p));
    art.querySelector(".list-btn")?.addEventListener("click", () =>
        opciones.quitar ? opciones.quitar(p) : abrirDialogoLista(p));
    return art;
}

// Pinta una cuadrícula de tarjetas. Con anexar = true añade al final
export function pintarGrid(contenedor, lista, anexar = false, opciones = {}) {
    if (!anexar) contenedor.innerHTML = "";
    else contenedor.querySelector(".vacio")?.remove();
    if (lista.length === 0 && !anexar) {
        contenedor.innerHTML = `<p class="vacio">${opciones.vacio || "No hay películas para mostrar."}</p>`;
        return;
    }
    lista.forEach(p => contenedor.appendChild(crearTarjeta(p, opciones)));
}

// Listas
// Trae las listas que cumplan el filtro junto con sus películas filtro: función que recibe la consulta y le añade condiciones
export async function cargarListas(filtro) {
    let consulta = supabase.from("lists").select("id, user_id, title, description, is_public, created_at");
    consulta = filtro(consulta).order("created_at", { ascending: false });
    const { data, error } = await consulta;
    if (error) throw error;
    const listas = data.map(l => ({ ...l, peliculas: [] }));
    if (listas.length === 0) return listas;

    const { data: items } = await supabase.from("list_items")
        .select("list_id, movie_id, movie_title, movie_poster, position")
        .in("list_id", listas.map(l => l.id))
        .order("position");
    (items || []).forEach(it => listas.find(l => l.id === it.list_id)?.peliculas.push(desdeFila(it)));
    return listas;
}

export const misListas = () => cargarListas(q => q.eq("user_id", sesion.usuario.id));

export const estaEnLista = (lista, id) => lista.peliculas.some(p => p.id === id);

export async function crearLista(titulo, descripcion = "", publica = true) {
    const { data, error } = await supabase.from("lists")
        .insert({ user_id: sesion.usuario.id, title: titulo, description: descripcion, is_public: publica })
        .select("id, user_id, title, description, is_public, created_at").single();
    if (error) throw error;
    return { ...data, peliculas: [] };
}

// Si la película está en la lista la quita; si no, la añade
export async function togglePeliculaEnLista(lista, p) {
    if (estaEnLista(lista, p.id)) {
        const { error } = await supabase.from("list_items").delete().eq("list_id", lista.id).eq("movie_id", p.id);
        if (error) throw error;
        lista.peliculas = lista.peliculas.filter(x => x.id !== p.id);
    } else {
        const { error } = await supabase.from("list_items")
            .insert({ list_id: lista.id, position: lista.peliculas.length, ...aFila(p) });
        if (error) throw error;
        lista.peliculas.push({ id: p.id, titulo: p.titulo, portada: p.portada });
    }
}

// Tarjeta de una lista: 4 huecos con las primeras portadas, nombre y cantidad
export function crearTarjetaLista(lista, autor = null) {
    const portadas = lista.peliculas.slice(0, 4);
    const huecos = Array.from({ length: 4 }, (_, i) => portadas[i]
        ? `<img src="${esc(portadas[i].portada)}" alt="">`
        : '<span class="hueco"></span>').join("");
    const n = lista.peliculas.length;
    return `
        <a class="list-card" href="listas.html?id=${encodeURIComponent(lista.id)}">
            <div class="list-posters">${huecos}</div>
            <h3>${esc(lista.title)} ${lista.is_public ? "" : '<span class="etiqueta">Privada</span>'}</h3>
            <p>${autor ? "de " + esc(autor.username) + " · " : ""}${n} ${n === 1 ? "película" : "películas"}</p>
        </a>`;
}

export function pintarTarjetasListas(contenedor, items, vacio, autores = null) {
    contenedor.innerHTML = items.length
        ? items.map(l => crearTarjetaLista(l, autores?.get(l.user_id))).join("")
        : `<p class="vacio">${vacio}</p>`;
}

// Pestañas 
export function iniciarPestanas(contenedor, alCambiar) { // Convierte botones en pestañas
    const botones = contenedor.querySelectorAll("[data-tab]");
    botones.forEach(btn => btn.addEventListener("click", () => {
        botones.forEach(b => b.classList.toggle("activo", b === btn));
        document.querySelectorAll(`[data-panel][data-grupo="${contenedor.dataset.grupo}"]`).forEach(panel => {
            panel.hidden = panel.dataset.panel !== btn.dataset.tab;
        });
        alCambiar?.(btn.dataset.tab);
    }));
}

// Dialogos (las ventanas emergentes)

function crearDialogos() {
    document.body.insertAdjacentHTML("beforeend", `
        <dialog id="dialogo-lista" class="dialogo">
            <div class="dialogo-cuerpo">
                <button type="button" class="dialogo-cerrar" aria-label="Cerrar">×</button>
                <h3>Añadir a lista</h3>
                <p id="dialogo-pelicula" class="dialogo-sub"></p>
                <div id="dialogo-listas" class="dialogo-listas"></div>
                <form id="dialogo-nueva" class="dialogo-nueva">
                    <input type="text" id="dialogo-nombre" placeholder="Crear nueva lista..." maxlength="60" required>
                    <button type="submit">Crear</button>
                </form>
            </div>
        </dialog>

        <dialog id="dialogo-detalle" class="dialogo dialogo-ancho">
            <div class="dialogo-cuerpo" id="detalle-cuerpo"></div>
        </dialog>
    `);

    document.querySelectorAll(".dialogo").forEach(d => {
        // Cerrar con la X o haciendo clic fuera del cuadro
        d.addEventListener("click", e => {
            if (e.target === d || e.target.closest(".dialogo-cerrar")) d.close();
        });
    });

    iniciarDialogoLista();
}

// ---------- Diálogo "Añadir a lista" ----------
let peliculaDialogo = null;
let listasDialogo = [];

export async function abrirDialogoLista(p) {
    if (pedirLogin()) return;
    peliculaDialogo = p;
    document.getElementById("dialogo-pelicula").textContent = p.titulo;
    document.getElementById("dialogo-listas").innerHTML = '<p class="vacio">Cargando...</p>';
    document.getElementById("dialogo-lista").showModal();
    try {
        listasDialogo = await misListas();
        pintarDialogoLista();
    } catch {
        pintarError(document.getElementById("dialogo-listas"));
    }
}

// Muestra una casilla por cada lista, marcada si la película ya está dentro
function pintarDialogoLista() {
    const contenedor = document.getElementById("dialogo-listas");
    if (listasDialogo.length === 0) {
        contenedor.innerHTML = '<p class="vacio">Todavía no tenés listas. Creá una abajo.</p>';
        return;
    }
    contenedor.innerHTML = listasDialogo.map(l => `
        <label class="dialogo-item">
            <input type="checkbox" data-id="${esc(l.id)}" ${estaEnLista(l, peliculaDialogo.id) ? "checked" : ""}>
            <span>${esc(l.title)}</span>
            <small>${l.peliculas.length}</small>
        </label>`).join("");
}

function iniciarDialogoLista() {
    const nombre = document.getElementById("dialogo-nombre");

    document.getElementById("dialogo-listas").addEventListener("change", async e => {
        const lista = listasDialogo.find(l => String(l.id) === e.target.dataset.id);
        if (!lista) return;
        e.target.disabled = true;
        try {
            await togglePeliculaEnLista(lista, peliculaDialogo);
        } catch {
            alert("No se pudo actualizar la lista.");
        }
        pintarDialogoLista();
        document.dispatchEvent(new CustomEvent("listas-cambiadas"));
    });

    document.getElementById("dialogo-nueva").addEventListener("submit", async e => {
        e.preventDefault();
        const texto = nombre.value.trim();
        if (!texto) return;
        try {
            const lista = await crearLista(texto);
            await togglePeliculaEnLista(lista, peliculaDialogo);
            listasDialogo.unshift(lista);
            nombre.value = "";
            pintarDialogoLista();
            document.dispatchEvent(new CustomEvent("listas-cambiadas"));
        } catch {
            alert("No se pudo crear la lista.");
        }
    });
}

// ---------- Diálogo de detalle de película ----------
export async function abrirDetalle(p) {
    const dialogo = document.getElementById("dialogo-detalle");
    const cuerpo = document.getElementById("detalle-cuerpo");
    cuerpo.innerHTML = '<button type="button" class="dialogo-cerrar" aria-label="Cerrar">×</button><p class="vacio">Cargando...</p>';
    if (!dialogo.open) dialogo.showModal();

    try {
        // Las reseñas son privadas: solo se cargan las tuyas de esta película
        const [m, resenas] = await Promise.all([
            api(`/movie/${p.id}`, { append_to_response: "credits" }),
            sesion.usuario
                ? supabase.from("reviews").select("id, rating, body, created_at")
                    .eq("movie_id", p.id).eq("user_id", sesion.usuario.id)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [] })
        ]);
        const pelicula = {
            id: m.id,
            titulo: m.title,
            portada: m.poster_path ? IMG_URL + m.poster_path : p.portada,
            anio: (m.release_date || "").slice(0, 4)
        };
        pintarDetalle(cuerpo, m, pelicula, resenas.data || []);
    } catch {
        cuerpo.innerHTML = '<button type="button" class="dialogo-cerrar" aria-label="Cerrar">×</button><p class="vacio">No se pudo cargar la película.</p>';
    }
}

// resenas: solo las del usuario que inició sesión para esta película
function pintarDetalle(cuerpo, m, p, resenas) {
    const director = (m.credits?.crew || []).find(c => c.job === "Director");
    const generos = (m.genres || []).map(g => g.name).join(", ");
    const liked = misLikes.has(p.id);

    cuerpo.innerHTML = `
        <button type="button" class="dialogo-cerrar" aria-label="Cerrar">×</button>
        <div class="detalle">
            ${p.portada ? `<img class="detalle-poster" src="${esc(p.portada)}" alt="${esc(p.titulo)}">` : ""}
            <div class="detalle-info">
                <h3 class="detalle-titulo">${esc(p.titulo)} <span>${esc(p.anio)}</span></h3>
                <p class="detalle-meta">
                    ${director ? `Dirigida por <strong>${esc(director.name)}</strong>` : ""}
                    ${m.runtime ? ` · ${m.runtime} min` : ""}
                    ${generos ? ` · ${esc(generos)}` : ""}
                </p>
                <div class="detalle-ratings">
                    <div><small>TMDB</small><strong>★ ${m.vote_average ? m.vote_average.toFixed(1) : "–"}</strong><small>/10 · ${m.vote_count || 0} votos</small></div>
                </div>
                <p class="detalle-sinopsis">${esc(m.overview || "Sin descripción disponible.")}</p>
                <div class="detalle-acciones">
                    <button type="button" class="btn detalle-like ${liked ? "liked" : ""}" data-id="${p.id}">${liked ? "♥ Te gusta" : "♡ Me gusta"}</button>
                    <button type="button" class="btn detalle-lista">+ Añadir a lista</button>
                </div>
            </div>
        </div>

        <form class="form-diario">
            <h4>Registrar en tu diario</h4>
            ${sesion.usuario ? `
                <div class="form-fila">
                    <label>Fecha en que la viste
                        <input type="date" name="fecha" value="${hoyISO()}" max="${hoyISO()}" required>
                    </label>
                    <div>
                        <span class="etiqueta-campo">Tu puntuación</span>
                        <div class="estrellas-input" role="radiogroup" aria-label="Puntuación">
                            ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-valor="${n}" aria-label="${n} estrellas">★</button>`).join("")}
                        </div>
                    </div>
                </div>
                <textarea name="resena" rows="3" maxlength="2000" placeholder="Escribí una reseña (opcional, solo la vas a ver vos)"></textarea>
                <div class="form-fila">
                    <span></span>
                    <button type="submit" class="btn btn-verde">Guardar en el diario</button>
                </div>
                <p class="form-msg" aria-live="polite"></p>
            ` : `<p class="vacio"><a href="login.html">Iniciá sesión</a> para darle like, reseñarla y registrarla en tu diario.</p>`}
        </form>

        ${sesion.usuario ? `
        <section class="detalle-resenas">
            <h4>Tus reseñas</h4>
            ${resenas.length ? resenas.map(r => `
                <div class="resena-mini">
                    <div class="resena-mini-head">
                        <span class="estrellas">${estrellas(r.rating)}</span>
                        <small>${fecha(r.created_at)}</small>
                    </div>
                    ${r.body ? `<p>${esc(r.body)}</p>` : ""}
                </div>`).join("") : '<p class="vacio">Todavía no reseñaste esta película.</p>'}
        </section>` : ""}
    `;

    cuerpo.querySelector(".detalle-like").addEventListener("click", () => toggleLike(p));
    cuerpo.querySelector(".detalle-lista").addEventListener("click", () => abrirDialogoLista(p));

    const form = cuerpo.querySelector(".form-diario");
    if (!sesion.usuario) return;

    // Estrellas: clic para elegir, clic en la misma para quitar la puntuación
    let puntuacion = 0;
    const botonesEstrella = form.querySelectorAll(".estrellas-input button");
    const pintarEstrellas = () => botonesEstrella.forEach(b =>
        b.classList.toggle("activa", Number(b.dataset.valor) <= puntuacion));
    botonesEstrella.forEach(b => b.addEventListener("click", () => {
        const valor = Number(b.dataset.valor);
        puntuacion = puntuacion === valor ? 0 : valor;
        pintarEstrellas();
    }));

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const msg = form.querySelector(".form-msg");
        const boton = form.querySelector("button[type=submit]");
        const texto = form.resena.value.trim();
        boton.disabled = true;
        msg.textContent = "Guardando...";

        const uid = sesion.usuario.id;
        const { error } = await supabase.from("diary_entries").insert({
            user_id: uid, ...aFila(p), watched_on: form.fecha.value, rating: puntuacion || null
        });
        let errorResena = null;
        if (!error && (texto || puntuacion)) {
            ({ error: errorResena } = await supabase.from("reviews").insert({
                user_id: uid, ...aFila(p), rating: puntuacion || null, body: texto || null
            }));
        }

        boton.disabled = false;
        if (error || errorResena) {
            msg.textContent = "No se pudo guardar. Probá de nuevo.";
            return;
        }
        msg.textContent = `✓ Guardada en tu diario (${fecha(form.fecha.value)}).`;
        form.resena.value = "";
        puntuacion = 0;
        pintarEstrellas();
        document.dispatchEvent(new CustomEvent("diario-cambiado"));
    });
}
