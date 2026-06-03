import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { candidateId, voteCount } = await req.json()
    
    // ✅ Validation des paramètres
    if (!candidateId || !voteCount) {
      return new Response(JSON.stringify({ error: 'candidateId et voteCount sont obligatoires' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // ✅ Validation que candidateId est un UUID valide
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (typeof candidateId !== 'string' || !uuidRegex.test(candidateId)) {
      return new Response(JSON.stringify({ error: 'candidateId doit être un UUID valide' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // ✅ Validation que voteCount est un nombre positif
    const voteAmount = parseInt(voteCount)
    if (!Number.isInteger(voteAmount) || voteAmount < 1) {
      return new Response(JSON.stringify({ error: 'voteCount doit être un nombre entier > 0' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`Tentative de vote test pour Miss ID: ${candidateId}`);

    // --- MODE TEST AUTOMATIQUE ---
    // 1. On ajoute les votes directement
    const { error: rpcError } = await supabase.rpc('increment_vote_by', {
      row_id: candidateId,  // ✅ Envoyer comme UUID, pas comme integer
      vote_amount: voteAmount
    })

    if (rpcError) {
      throw new Error("Erreur SQL: " + (rpcError?.message || JSON.stringify(rpcError)))
    }

    // 2. On crée une trace dans les transactions
    const identifier = `TEST_${candidateId}_${Date.now()}`
    const { error: insertError } = await supabase.from('transactions').insert([{
      identifier,
      transaction_ref: `TEST_${Date.now()}`,
      candidate_id: candidateId,  // ✅ UUID, pas integer
      vote_count: voteAmount,
      status: 'completed',
      payment_method: 'TEST'
    }])

    if (insertError) {
      throw new Error("Erreur insertion transaction: " + (insertError?.message || JSON.stringify(insertError)))
    }

    return new Response(JSON.stringify({ success: true, message: "VOTE COMPTABILISÉ !" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Erreur:', errorMessage)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})