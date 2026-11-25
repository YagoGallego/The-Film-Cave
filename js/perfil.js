// =====================================================================
//  PÁGINA: PERFIL (perfil.html)
//  perfil.html          -> tu perfil (necesita sesión)
//  perfil.html?id=UUID  -> el perfil de otro usuario
// =====================================================================
import {
    supabase, sesion, iniciarSesion, pedirLogin, cerrarSesion, esc, fecha, estrellas,
    pintarGrid, pintarError, desdeFila, abrirDetalle,
    cargarListas, pintarTarjetasListas, iniciarPestanas
} from "./comun.js";

const $ = id => document.getElementById(id);

let perfil = null;      // perfil que se está viendo
let esMio = false;
let entradasDiario = [];
let misResenas = [];

// Cuenta filas de una tabla con un filtro (sin descargarlas)
async function contar(tabla, columna, valor) {
    const { count } = await supabase.from(tabla).select("*", { count: "exact", head: true }).eq(columna, valor);
    return count ?? 0;
}

// ---------- Cabecera del perfil ----------
function pintarCabeceraPerfil() {
    document.title = perfil.username + " - The Film Cave";
    $("perfil-avatar").textContent = perfil.username.charAt(0).toUpperCase();
    $("perfil-nombre").textContent = perfil.username;
    $("perfil-bio").textContent = perfil.bio || (esMio ? "Todavía no escribiste una descripción." : "");
    $("perfil-bio").classList.toggle("vacio", !perfil.bio);
    $("btn-editar-bio").hidden = !esMio;
    $("btn-salir").hidden = !esMio;
    // La pestaña de reseñas solo aparece en tu propio perfil
    $("tab-resenas").hidden = !esMio;
}

async function cargarEstadisticas() {
    const id = perfil.id;
    const [diario, likes, listas, aciertos] = await Promise.all([
        contar("diary_entries", "user_id", id),
        contar("likes", "user_id", id),
        // Las listas privadas de otros no se cuentan (la base de datos no las devuelve)
        contar("lists", "user_id", id),
        supabase.from("game_results").select("*", { count: "exact", head: true })
            .eq("user_id", id).eq("correct", true).then(r => r.count ?? 0)
    ]);
    $("stat-diario").textContent = diario;
    $("stat-likes").textContent = likes;
    $("stat-listas").textContent = listas;
    $("stat-aciertos").textContent = aciertos;
}

// ---------- Diario ----------
// Se agrupa por mes, como un diario de verdad
async function cargarDiario() {
    const cont = $("perfil-diario");
    const { data, error } = await supabase.from("diary_entries").select("*")
        .eq("user_id", perfil.id)
        .order("watched_on", { ascending: false })
        .order("created_at", { ascending: false });
    if (error) return pintarError(cont);
    entradasDiario = data;

    if (data.length === 0) {
        cont.innerHTML = `<p class="vacio">${esMio
            ? "Tu diario está vacío. Abrí cualquier película y registrá cuándo la viste."
            : "Este usuario todavía no registró ninguna película."}</p>`;
        return;
    }

    const meses = new Map();
    data.forEach(e => {
        const clave = e.watched_on.slice(0, 7);
        if (!meses.has(clave)) meses.set(clave, []);
        meses.get(clave).push(e);
    });

    cont.innerHTML = [...meses].map(([clave, entradas]) => {
        const nombreMes = new Date(clave + "-15").toLocaleDateString("es-AR", { month: "long", year: "numeric" });
        return `
            <div class="diario-mes">
                <h3>${esc(nombreMes)}</h3>
                ${entradas.map(e => `
                    <div class="diario-fila">
                        <span class="diario-dia">${Number(e.watched_on.slice(8, 10))}</span>
                        ${e.movie_poster ? `<img src="${esc(e.movie_poster)}" alt="" data-id="${e.id}">` : '<span class="hueco"></span>'}
                        <button type="button" class="enlace-peli" data-id="${e.id}">${esc(e.movie_title)}</button>
                        <span class="estrellas">${estrellas(e.rating)}</span>
                        ${esMio ? `<button type="button" class="diario-borrar" data-borrar="${e.id}" aria-label="Borrar entrada" title="Borrar entrada">×</button>` : ""}
                    </div>`).join("")}
            </div>`;
    }).join("");
}

// ---------- Likes y listas ----------
async function cargarLikes() {
    const cont = $("perfil-likes");
    const { data, error } = await supabase.from("likes").select("movie_id, movie_title, movie_poster")
        .eq("user_id", perfil.id).order("created_at", { ascending: false });
    if (error) return pintarError(cont);
    pintarGrid(cont, data.map(desdeFila).filter(p => p.portada), false, {
        vacio: esMio ? "Todavía no le diste like a ninguna película." : "Todavía no le dio like a ninguna película."
    });
}

async function cargarListasPerfil() {
    const cont = $("perfil-listas");
    try {
        const listas = await cargarListas(q => q.eq("user_id", perfil.id));
        pintarTarjetasListas(cont, listas, esMio
            ? 'No creaste ninguna lista. <a href="listas.html">Crear una</a>'
            : "No tiene listas públicas.");
    } catch {
        pintarError(cont);
    }
}

// ---------- Juego ----------
async function cargarJuego() {
    const { data } = await supabase.from("game_results").select("*")
        .eq("user_id", perfil.id).order("game_date", { ascending: false });
    const resultados = data || [];
    $("juego-aciertos").textContent = resultados.filter(r => r.correct).length;
    $("juego-jugados").textContent = resultados.length;
    $("juego-puntos").textContent = resultados.reduce((s, r) => s + (r.points || 0), 0);
    $("perfil-juego").innerHTML = resultados.length
        ? resultados.map(r => `
            <div class="juego-fila ${r.correct ? "acierto" : "fallo"}">
                <span>${fecha(r.game_date)}</span>
                <span>${r.correct ? "✓ Acertó" : "✗ No acertó"}</span>
                <span>${r.attempts} ${r.attempts === 1 ? "intento" : "intentos"}</span>
                <strong>+${r.points || 0}</strong>
            </div>`).join("")
        : `<p class="vacio">${esMio ? "Todavía no jugaste." : "Todavía no jugó."} <a href="juego.html">Ir al juego</a></p>`;
}

// ---------- Mis reseñas (privadas: solo las ve su autor) ----------
async function cargarResenas() {
    if (!esMio) return;
    const cont = $("perfil-resenas");
    const { data, error } = await supabase.from("reviews")
        .select("id, movie_id, movie_title, movie_poster, rating, body, created_at")
        .eq("user_id", perfil.id)
        .order("created_at", { ascending: false });
    if (error) return pintarError(cont);
    misResenas = data;

    cont.innerHTML = data.length
        ? data.map(r => `
            <article class="review-card">
                ${r.movie_poster
                    ? `<img src="${esc(r.movie_poster)}" alt="${esc(r.movie_title)}" data-resena="${esc(r.id)}">`
                    : '<span class="hueco"></span>'}
                <div class="review-cuerpo">
                    <div class="review-head">
                        <button type="button" class="enlace-peli review-titulo" data-resena="${esc(r.id)}">${esc(r.movie_title || "Película")}</button>
                        <span class="estrellas">${estrellas(r.rating)}</span>
                        <button type="button" class="diario-borrar" data-borrar-resena="${esc(r.id)}" aria-label="Borrar reseña" title="Borrar reseña">×</button>
                    </div>
                    <p class="review-autor">${fecha(r.created_at)}</p>
                    ${r.body ? `<p class="review-texto">${esc(r.body)}</p>` : ""}
                </div>
            </article>`).join("")
        : '<p class="vacio">Todavía no escribiste ninguna reseña. Abrí una película y guardala en tu diario con una reseña.</p>';
}

// ---------- Descripción ----------
function eventosBio() {
    const form = $("form-bio");
    $("btn-editar-bio").addEventListener("click", () => {
        $("bio-texto").value = perfil.bio || "";
        form.hidden = false;
        $("btn-editar-bio").hidden = true;
        $("bio-texto").focus();
    });
    $("bio-cancelar").addEventListener("click", () => {
        form.hidden = true;
        $("btn-editar-bio").hidden = false;
    });
    form.addEventListener("submit", async e => {
        e.preventDefault();
        const bio = $("bio-texto").value.trim();
        const { error } = await supabase.from("profiles").update({ bio }).eq("id", perfil.id);
        if (error) return alert("No se pudo guardar la descripción.");
        perfil.bio = bio;
        form.hidden = true;
        pintarCabeceraPerfil();
    });
}

function eventos() {
    iniciarPestanas(document.querySelector('.tabs[data-grupo="perfil"]'));

    $("btn-salir").addEventListener("click", cerrarSesion);
    eventosBio();

    // Diario: abrir detalle o borrar una entrada
    $("perfil-diario").addEventListener("click", async e => {
        const borrar = e.target.closest("[data-borrar]");
        if (borrar) {
            if (!confirm("¿Borrar esta entrada del diario?")) return;
            const { error } = await supabase.from("diary_entries").delete().eq("id", borrar.dataset.borrar);
            if (error) return alert("No se pudo borrar.");
            cargarDiario();
            cargarEstadisticas();
            return;
        }
        const abrir = e.target.closest("[data-id]");
        const entrada = abrir && entradasDiario.find(x => x.id === abrir.dataset.id);
        if (entrada) abrirDetalle(desdeFila(entrada));
    });

    // Mis reseñas: abrir detalle o borrar una reseña
    $("perfil-resenas").addEventListener("click", async e => {
        const borrar = e.target.closest("[data-borrar-resena]");
        if (borrar) {
            if (!confirm("¿Borrar esta reseña?")) return;
            const { error } = await supabase.from("reviews").delete().eq("id", borrar.dataset.borrarResena);
            if (error) return alert("No se pudo borrar.");
            cargarResenas();
            return;
        }
        const abrir = e.target.closest("[data-resena]");
        const resena = abrir && misResenas.find(r => String(r.id) === abrir.dataset.resena);
        if (resena) abrirDetalle(desdeFila(resena));
    });

    // Recargar si cambia algo desde los diálogos
    document.addEventListener("likes-cambiados", () => { if (esMio) { cargarLikes(); cargarEstadisticas(); } });
    document.addEventListener("listas-cambiadas", () => { if (esMio) { cargarListasPerfil(); cargarEstadisticas(); } });
    document.addEventListener("diario-cambiado", () => { if (esMio) { cargarDiario(); cargarResenas(); cargarEstadisticas(); } });
}

async function iniciarPerfil() {
    const idUrl = new URLSearchParams(location.search).get("id");

    if (!idUrl) {
        if (pedirLogin()) return;
        perfil = { ...sesion.perfil };
    } else {
        const { data } = await supabase.from("profiles").select("id, username, bio").eq("id", idUrl).maybeSingle();
        perfil = data;
    }

    if (!perfil) {
        $("perfil-cargando").textContent = "Este usuario no existe.";
        return;
    }

    esMio = sesion.usuario?.id === perfil.id;
    document.querySelector(".header > .avatar")?.classList.toggle("activo", esMio);
    $("perfil-cargando").hidden = true;
    $("perfil-contenido").hidden = false;

    pintarCabeceraPerfil();
    eventos();
    cargarEstadisticas();
    cargarDiario();
    cargarLikes();
    cargarListasPerfil();
    cargarJuego();
    cargarResenas();
}

await iniciarSesion();
iniciarPerfil();
