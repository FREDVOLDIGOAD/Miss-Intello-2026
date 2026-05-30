import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// On ajoute une petite vérification pour ne pas faire crasher l'app
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ ATTENTION : Les clés Supabase manquent dans le fichier .env !");
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.co', supabaseAnonKey || 'placeholder')