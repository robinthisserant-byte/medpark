import { createClient } from "@supabase/supabase-js";

// Connexion à la base de données Supabase.
// La clé "publishable" est faite pour être dans l'application (ce n'est pas un secret).
const SUPABASE_URL = "https://onboyxjrehfhpjlniavw.supabase.co";
const SUPABASE_KEY = "sb_publishable_IQshB0U1Q4Ra-BcPC25UNA_NZNWHeQY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
