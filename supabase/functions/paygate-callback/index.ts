import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paygate-callback-secret',
};

serve(async (req: Request) => {
  // Gérer le pré-chargement CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json();
    
    // --- NOUVELLE VÉRIFICATION DU SECRET (URL + HEADERS) ---
    const callbackSecret = Deno.env.get('PAYGATE_CALLBACK_SECRET');
    const url = new URL(req.url);
    const urlSecret = url.searchParams.get('secret'); // Pour l'URL ?secret=...
    const headerSecret = req.headers.get('x-paygate-callback-secret'); // Pour le header

    // Si le secret n'est ni dans l'URL, ni dans le header, on bloque
    if (callbackSecret && (urlSecret !== callbackSecret && headerSecret !== callbackSecret)) {
      console.error("Accès refusé : Secret invalide.");
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    // -------------------------------------------------------

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Chercher la transaction correspondante par son identifiant unique
    const { data: tx } = await supabase.from('transactions')
      .select('*')
      .eq('identifier', payload.identifier)
      .maybeSingle();

    if (tx && tx.status !== 'completed') {
      console.log(`Validation du vote pour la candidate ${tx.candidate_id}`);
      
      // Appel de la fonction SQL RPC pour ajouter le vote et marquer la transaction finie
      const { error: rpcError } = await supabase.rpc('confirm_vote_transaction', {
        p_transaction_id: tx.id,
        p_candidate_id: tx.candidate_id,
        p_vote_amount: tx.vote_count,
        p_payment_ref: payload.payment_reference || payload.payment_ref,
        p_payment_method: payload.payment_method,
        p_phone: payload.phone_number,
        p_tx_ref: payload.tx_reference || payload.reference
      });

      if (rpcError) throw rpcError;
    }

    return new Response(JSON.stringify({ success: true }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (e) {
    console.error("Erreur Callback:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})