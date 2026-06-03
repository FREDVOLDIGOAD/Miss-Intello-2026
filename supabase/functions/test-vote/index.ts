import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-test-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json();
    const { candidateId, voteCount, secret } = body;
    
    const headerSecret = req.headers.get('x-test-secret');
    const expectedSecret = Deno.env.get('TEST_VOTE_SECRET');

    // On vérifie le secret dans le body OU dans le header
    if (!expectedSecret || (secret !== expectedSecret && headerSecret !== expectedSecret)) {
      return new Response(JSON.stringify({ error: '401: Secret invalide' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { error } = await supabase.rpc('confirm_vote_transaction', {
      p_transaction_id: crypto.randomUUID(),
      p_candidate_id: Number(candidateId),
      p_vote_amount: Number(voteCount),
      p_payment_ref: 'TEST_MODE',
      p_payment_method: 'TEST',
      p_phone: '00000000',
      p_tx_ref: 'TEST_' + Date.now()
    });

    if (error) throw error;
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
})