// =====================================================================
//  PÁGINA: LOGIN (login.html) - entrar o crear cuenta con Supabase Auth
// =====================================================================
import { supabase, iniciarPestanas } from "./comun.js";

const msg = document.getElementById("login-msg");

// A dónde volver después de entrar (solo páginas de este sitio)
function destino() {
    const volver = new URLSearchParams(location.search).get("volver") || "";
    return /^[a-z]+\.html(\?.*)?$/.test(volver) ? volver : "index.html";
}

// Si ya hay sesión no tiene sentido estar acá
const { data } = await supabase.auth.getSession();
if (data.session) location.replace(destino());

iniciarPestanas(document.querySelector('.tabs[data-grupo="login"]'), () => { msg.textContent = ""; });

document.getElementById("form-entrar").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;
    msg.textContent = "Entrando...";
    const { error } = await supabase.auth.signInWithPassword({
        email: f.email.value.trim(), password: f.password.value
    });
    if (error) {
        msg.textContent = error.message.includes("Email not confirmed")
            ? "Tenés que confirmar tu email antes de entrar. Revisá tu correo."
            : "Email o contraseña incorrectos.";
        return;
    }
    location.href = destino();
});

document.getElementById("form-registro").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;
    const username = f.username.value.trim();
    msg.textContent = "Creando cuenta...";

    // Comprobar que el nombre de usuario no esté usado
    const { data: existe } = await supabase.from("profiles").select("id").ilike("username", username.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
    if (existe) {
        msg.textContent = "Ese nombre de usuario ya está en uso.";
        return;
    }

    const { data: res, error } = await supabase.auth.signUp({
        email: f.email.value.trim(),
        password: f.password.value,
        options: { data: { username } }  // lo usa la base de datos para crear el perfil
    });
    if (error) {
        msg.textContent = "No se pudo crear la cuenta: " + error.message;
        return;
    }
    if (res.session) {
        location.href = destino();
    } else {
        msg.textContent = "¡Cuenta creada! Te enviamos un email para confirmarla. Después podés entrar.";
        f.reset();
    }
});
