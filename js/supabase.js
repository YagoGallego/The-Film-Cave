import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://twpolszykgiduasjstoq.supabase.co";
const SUPABASE_KEY = "sb_publishable_6LHjUASXoYzrHs8mVO7Arw_JGTDMyXo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


// El "cliente" es el objeto que habla con la base de datos y con el login