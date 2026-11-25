// =====================================================================
//  PÁGINA: ADIVINA LA PELÍCULA (juego.html)
//  De momento solo la estructura: todavía no hay días cargados.
// =====================================================================
import { supabase, sesion, iniciarSesion, esc, fecha, iniciarPestanas } from "./comun.js";

const $ = id => document.getElementById(id);

// Puntos acumulados del usuario (suma de la tabla game_results)
let puntos = 0;

// Días de juego: [{ numero, fecha: "AAAA-MM-DD" }]. Vacío por ahora.
const dias = [];

// Resultados del usuario por fecha: { "AAAA-MM-DD": { correct, attempts, points } }
let resultados = {};

async function cargarPuntos() {
    if (!sesion.usuario) return;
    const { data } = await supabase.from("game_results")
        .select("game_date, correct, attempts, points").eq("user_id", sesion.usuario.id);
    resultados = Object.fromEntries((data || []).map(r => [r.game_date, r]));
    puntos = (data || []).reduce((s, r) => s + (r.points || 0), 0);
    $("puntos").textContent = puntos;
}
 
// El día más reciente arriba del todo
function pintarDias() {
    const cont = $("lista-dias");
    if (dias.length === 0) {
        cont.innerHTML = '<p class="vacio">Todavía no hay juegos. ¡Volvé pronto!</p>';
        return;
    }
    const ordenados = [...dias].sort((a, b) => b.fecha.localeCompare(a.fecha));
    cont.innerHTML = ordenados.map(d => {
        const r = resultados[d.fecha];
        const clase = r ? (r.correct ? "acertado" : "jugado") : "";
        const estado = r ? (r.correct ? `✓ +${r.points}` : "✗ Jugado") : "Jugar →";
        return `
            <button type="button" class="dia-card ${clase}" data-fecha="${esc(d.fecha)}">
                <span class="dia-numero">#${d.numero}</span>
                <span class="dia-fecha">${fecha(d.fecha)}</span>
                <span class="dia-estado">${estado}</span>
            </button>`;
    }).join("");
}

function abrirDia(dia) {
    $("juego-titulo-dia").textContent = `Día #${dia.numero} · ${fecha(dia.fecha)}`;
    document.querySelector(".tabs").hidden = true;
    document.querySelector('[data-panel="dias"]').hidden = true;
    $("vista-juego").hidden = false;
}

function cerrarDia() {
    $("vista-juego").hidden = true;
    document.querySelector(".tabs").hidden = false;
    document.querySelector('[data-panel="dias"]').hidden = false;
}

function iniciarJuego() {
    iniciarPestanas(document.querySelector('.tabs[data-grupo="juego"]'));

    $("lista-dias").addEventListener("click", e => {
        const btn = e.target.closest(".dia-card");
        const dia = btn && dias.find(d => d.fecha === btn.dataset.fecha);
        if (dia) abrirDia(dia);
    });
    $("volver-dias").addEventListener("click", cerrarDia);
    $("form-adivinar").addEventListener("submit", e => e.preventDefault());

    pintarDias();
    cargarPuntos().then(pintarDias);
}

await iniciarSesion();
iniciarJuego();
