import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS Preflight pour le navigateur
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { transactionId, candidateId } = await req.json()

    if (!transactionId || !candidateId) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Initialisation client Supabase 100% avec le rôle d'Admin (bypasse les RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Vérifier que la transaction n'a pas déjà été utilisée !
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('transaction_ref', transactionId)
      .single()

    if (existingTx) {
      return new Response(JSON.stringify({ error: 'Cette transaction a déjà été consommée !' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Contacter Kkiapay pour M'assurer que l'argent est bien rentré !
    const kkiapaySecret = Deno.env.get('KKIAPAY_SECRET_KEY')
    if (!kkiapaySecret) {
      throw new Error("LA clé KKIAPAY_SECRET_KEY n'est pas trouvée dans l'environnement Supabase.")
    }

    const verifyReq = await fetch('https://api.kkiapay.me/api/v1/transactions/status', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-secret-key': kkiapaySecret
      },
      body: JSON.stringify({ transactionId })
    })

    const kkiapayData = await verifyReq.json()

    // 3. Vérification du statut Kkiapay
    // Kkiapay renvoie "SUCCESS" quand le paiement est parfait
    if (kkiapayData?.status !== 'SUCCESS') {
      return new Response(JSON.stringify({ error: 'Transaction invalide ou non payée.', details: kkiapayData }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. On consigne la transaction validée en base de données pour empêcher les doublons futurs
    const txAmount = kkiapayData?.amount || 200
    const { error: txError } = await supabase
      .from('transactions')
      .insert([
        { candidate_id: candidateId, transaction_ref: transactionId, amount: txAmount }
      ])

    if (txError) {
      throw txError
    }

    // 5. On accorde le vote UNIQUEMENT maintenant !
    const { error: voteError } = await supabase.rpc('increment_vote', {
      row_id: candidateId
    })

    if (voteError) {
      throw voteError
    }

    return new Response(JSON.stringify({ success: true, message: 'Transaction validée et vote sécurisé' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
