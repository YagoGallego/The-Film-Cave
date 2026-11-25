// =====================================================================
//  PÁGINA: LISTAS (listas.html)
//  Sin parámetros: pestañas "Mis listas" y "Listas de la comunidad".
//  Con ?id=... muestra esa lista (editable solo si es tuya).
// =====================================================================
import {
    supabase, sesion, iniciarSesion, api, normalizarLista, esc, pintarGrid, pintarError,
    cargarListas, misListas, crearLista, togglePeliculaEnLista, estaEnLista,
    pintarTarjetasListas, obtenerPerfiles, enlaceUsuario, iniciarPestanas
} from "./comun.js";

const $ = id => document.getElementById(id);
const idListaUrl = () => new URLSearchParams(location.search).get("id");

let listaActual = null;
let resultadosBusquedaLista = [];
let comunidadCargada = false;

// ---------- Vista general ----------
async function pintarMisListas() {
    if (!sesion.usuario) {
        $("mias-sin-sesion").hidden = false;
        return;
    }
    $("mias-con-sesion").hidden = false;
    try {
        const listas = await misListas();
        pintarTarjetasListas($("listas-publicas"), listas.filter(l => l.is_public),
            "No tenés listas públicas.");
        pintarTarjetasListas($("listas-privadas"), listas.filter(l => !l.is_public),
            "No tenés listas privadas.");
    } catch {
        pintarError($("listas-publicas"));
        $("listas-privadas").innerHTML = "";
    }
}

// Listas públicas de los demás usuarios
async function pintarComunidad() {
    if (comunidadCargada) return;
    comunidadCargada = true;
    const cont = $("listas-comunidad");
    cont.innerHTML = '<p class="vacio">Cargando...</p>';
    try {
        const listas = await cargarListas(q => {
            q = q.eq("is_public", true).limit(30);
            return sesion.usuario ? q.neq("user_id", sesion.usuario.id) : q;
        });
        const autores = await obtenerPerfiles(listas.map(l => l.user_id));
        pintarTarjetasListas(cont, listas, "Todavía no hay listas de otros usuarios.", autores);
    } catch {
        comunidadCargada = false;
        pintarError(cont);
    }
}

// ---------- Detalle de una lista ----------
async function pintarDetalle() {
    const lista = listaActual;
    const esMia = sesion.usuario?.id === lista.user_id;
    document.title = lista.title + " - The Film Cave";
    $("lista-titulo").textContent = lista.title;
    $("lista-descripcion").textContent = lista.description || "";
    $("lista-count").textContent = lista.peliculas.length;
    $("lista-acciones").hidden = !esMia;
    $("seccion-anadir").hidden = !esMia;
    $("cambiar-visibilidad").textContent = lista.is_public ? "🔓 Pública · hacer privada" : "🔒 Privada · hacer pública";

    if (!esMia) {
        const autores = await obtenerPerfiles([lista.user_id]);
        $("lista-autor").innerHTML = "Lista de " + enlaceUsuario(autores.get(lista.user_id));
    } else {
        $("lista-autor").textContent = lista.is_public ? "Lista pública" : "Lista privada";
    }

    pintarGrid($("lista-peliculas"), lista.peliculas, false, {
        quitar: esMia ? p => alternar(p) : false,
        vacio: esMia
            ? "Esta lista está vacía. Buscá películas arriba o usá el botón + en cualquier póster."
            : "Esta lista está vacía."
    });
    pintarResultadosLista();
}

async function alternar(p) {
    try {
        await togglePeliculaEnLista(listaActual, p);
        pintarDetalle();
    } catch {
        alert("No se pudo actualizar la lista.");
    }
}

// Resultados del buscador de la lista, con botón para añadir o quitar
function pintarResultadosLista() {
    $("buscar-lista-resultados").innerHTML = resultadosBusquedaLista.map(p => {
        const dentro = estaEnLista(listaActual, p.id);
        return `
            <div class="mini-item">
                <img src="${esc(p.portada)}" alt="">
                <span>${esc(p.titulo)} <small>${esc(p.anio)}</small></span>
                <button type="button" data-id="${p.id}" class="${dentro ? "en-lista" : ""}">
                    ${dentro ? "✓ Añadida" : "+ Añadir"}
                </button>
            </div>`;
    }).join("");
}

function eventosDetalle() {
    const resultados = $("buscar-lista-resultados");
    $("form-buscar-lista").addEventListener("submit", async e => {
        e.preventDefault();
        const texto = $("buscar-lista-texto").value.trim();
        if (!texto) return;
        resultados.innerHTML = '<p class="vacio">Buscando...</p>';
        try {
            const datos = await api("/search/movie", { query: texto, include_adult: false });
            resultadosBusquedaLista = normalizarLista(datos.results).slice(0, 8);
            if (resultadosBusquedaLista.length === 0) {
                resultados.innerHTML = '<p class="vacio">Sin resultados.</p>';
                return;
            }
            pintarResultadosLista();
        } catch {
            pintarError(resultados);
        }
    });

    // Un solo listener para todos los botones "+ Añadir" (delegación de eventos)
    resultados.addEventListener("click", e => {
        const btn = e.target.closest("button[data-id]");
        if (!btn) return;
        const p = resultadosBusquedaLista.find(x => x.id === Number(btn.dataset.id));
        if (p) alternar(p);
    });

    $("cambiar-visibilidad").addEventListener("click", async () => {
        const nuevo = !listaActual.is_public;
        const { error } = await supabase.from("lists").update({ is_public: nuevo }).eq("id", listaActual.id);
        if (error) return alert("No se pudo cambiar la visibilidad.");
        listaActual.is_public = nuevo;
        pintarDetalle();
    });

    $("borrar-lista").addEventListener("click", async () => {
        if (!confirm(`¿Eliminar la lista "${listaActual.title}"?`)) return;
        await supabase.from("list_items").delete().eq("list_id", listaActual.id);
        const { error } = await supabase.from("lists").delete().eq("id", listaActual.id);
        if (error) return alert("No se pudo eliminar la lista.");
        location.href = "listas.html";
    });

    // Si se añade la película desde el diálogo "+" de una tarjeta
    document.addEventListener("listas-cambiadas", recargarDetalle);
}

async function recargarDetalle() {
    const [lista] = await cargarListas(q => q.eq("id", listaActual.id));
    if (lista) {
        listaActual = lista;
        pintarDetalle();
    }
}

function eventosGeneral() {
    iniciarPestanas(document.querySelector('.tabs[data-grupo="listas"]'), tab => {
        if (tab === "comunidad") pintarComunidad();
    });

    $("form-lista").addEventListener("submit", async e => {
        e.preventDefault();
        const nombre = $("lista-nombre").value.trim();
        const desc = $("lista-desc").value.trim();
        if (!nombre) return;
        try {
            const lista = await crearLista(nombre, desc, $("lista-visibilidad").value === "publica");
            location.href = "listas.html?id=" + encodeURIComponent(lista.id);
        } catch {
            alert("No se pudo crear la lista.");
        }
    });

    document.addEventListener("listas-cambiadas", pintarMisListas);
}

async function iniciarListas() {
    const id = idListaUrl();
    if (!id) {
        $("vista-listas").hidden = false;
        eventosGeneral();
        // Sin sesión se abre directamente la pestaña de la comunidad
        if (!sesion.usuario) document.querySelector('[data-tab="comunidad"]').click();
        pintarMisListas();
        return;
    }

    try {
        [listaActual] = await cargarListas(q => q.eq("id", id));
    } catch {
        listaActual = null;
    }
    // Si no existe o es privada de otro usuario, vuelve a la vista general
    if (!listaActual) {
        location.href = "listas.html";
        return;
    }
    $("vista-listas").hidden = true;
    $("vista-lista").hidden = false;
    eventosDetalle();
    pintarDetalle();
}

await iniciarSesion();
iniciarListas();
