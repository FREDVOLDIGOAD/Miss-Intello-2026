import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Headers pour autoriser ton site Vercel à appeler cette fonction (CORS)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestion du "Preflight" (indispensable pour les navigateurs)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, amount, network, candidateId, voteCount } = await req.json()
    const numberOfVotes = Number(voteCount) || 1  // Nombre de votes (défaut: 1)

    // On génère un identifiant unique pour PayGate (Paramètre 'identifier' requis)
    const identifier = crypto.randomUUID()

    console.log(`Initiation paiement pour ${phone} - Montant: ${amount} FCFA - Réseau: ${network} - Votes: ${numberOfVotes}`)

    // Appel à l'API PayGateGlobal selon ton guide
    const response = await fetch("https://paygateglobal.com/api/v1/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: Deno.env.get("PAYGATE_TOKEN"), // Ton token LIVE caché
        phone_number: phone,
        amount: amount,
        identifier: identifier,
        network: network,
        description: `${numberOfVotes} vote(s) Miss Intello pour candidate ${candidateId}`
      }),
    })

    const result = await response.json()
    console.log("Réponse PayGate:", result)

    // Si la transaction est enregistrée (status == 0), on incrémente le vote
    if (result.status === 0 || result.status === "0") {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      // Incrémenter directement avec le bon nombre de votes via UPDATE
      const { error: voteError } = await supabase
        .from('candidates')
        .update({ votes: supabase.rpc('increment_by', { x: numberOfVotes }) })
        .eq('id', candidateId)

      if (voteError) {
        // Fallback : utiliser la fonction RPC avec le montant
        console.warn("Update direct échoué, tentative RPC increment_vote:", voteError)
        const { error: rpcError } = await supabase.rpc('increment_vote_by', {
          row_id: candidateId,
          vote_amount: numberOfVotes
        })
        if (rpcError) {
          // Dernier recours : incrémenter 1 par 1 en boucle
          console.warn("increment_vote_by échoué, incrémentation unitaire:", rpcError)
          for (let i = 0; i < numberOfVotes; i++) {
            await supabase.rpc('increment_vote', { row_id: candidateId })
          }
          console.log(`Vote incrémenté ${numberOfVotes} fois via increment_vote unitaire`)
        } else {
          console.log(`Vote incrémenté de ${numberOfVotes} via increment_vote_by`)
        }
      } else {
        console.log(`Vote incrémenté de ${numberOfVotes} via UPDATE direct`)
      }
    }

    // On renvoie la réponse de PayGate à ton application
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})