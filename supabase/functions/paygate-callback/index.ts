// Supabase Edge Function — paygate-callback
// Reçoit la confirmation de PayGate et ne confirme le vote que si la transaction est validée.
// Exemple de payload attendu :
// {
//   "tx_reference": "PAYGATE_TX_...",
//   "identifier": "internal-id-...",
//   "payment_reference": "FLOOZ123456",
//   "amount": 400,
//   "phone_number": "90010203",
//   "payment_method": "FLOOZ",
//   "datetime": "2026-06-01T12:34:56Z"
// }

// @ts-ignore: Remote Deno std module import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore: Remote Supabase client import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno"

declare const Deno: any

declare global {
  interface Window {}
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-paygate-callback-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json() as Record<string, unknown>
    const txReference = (payload.tx_reference || payload.reference || payload.txReference || payload.transaction_reference)?.toString()
    const identifier = (payload.identifier || payload.transaction_identifier || payload.txIdentifier)?.toString()
    const paymentReference = (payload.payment_reference || payload.paymentReference)?.toString() || null
    const phoneNumber = (payload.phone_number || payload.phoneNumber)?.toString() || null
    const paymentMethod = (payload.payment_method || payload.paymentMethod)?.toString() || null
    const amount = payload.amount ? Number(payload.amount) : null
    const datetime = (payload.datetime || payload.date_time || payload.date)?.toString() || null

    if (!txReference && !identifier) {
      return new Response(JSON.stringify({ success: false, error: 'tx_reference ou identifier est requis.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const callbackSecret = Deno.env.get('PAYGATE_CALLBACK_SECRET')
    if (callbackSecret) {
      const receivedSecret = req.headers.get('x-paygate-callback-secret') || ''
      if (receivedSecret !== callbackSecret) {
        return new Response(JSON.stringify({ success: false, error: 'Secret de callback invalide.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const paygateToken = Deno.env.get('PAYGATE_TOKEN')
    if (!paygateToken) {
      return new Response(JSON.stringify({ success: false, error: 'PAYGATE_TOKEN manquant dans la configuration.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (txReference) {
      const verifyResponse = await fetch('https://paygateglobal.com/api/v1/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_token: paygateToken,
          tx_reference: txReference,
        }),
      })

      const verifyResult = await verifyResponse.json()
      console.log('Vérification PayGate callback:', verifyResult)

      if (!(verifyResult.status === 0 || verifyResult.status === '0')) {
        return new Response(JSON.stringify({ success: false, error: 'Confirmation de paiement PayGate non validée.', paygateStatus: verifyResult }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ success: false, error: 'Configuration serveur incomplète.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    let existing: { id: string; status: string; candidate_id: string; vote_count: number } | null = null
    let fetchError = null

    const resultByIdentifier = await supabase
      .from('transactions')
      .select('id, status, candidate_id, vote_count')
      .eq('identifier', identifier)
      .maybeSingle()

    existing = resultByIdentifier.data
    fetchError = resultByIdentifier.error

    if (!existing && !fetchError) {
      const resultByReference = await supabase
        .from('transactions')
        .select('id, status, candidate_id, vote_count')
        .eq('transaction_ref', txReference)
        .maybeSingle()
      existing = resultByReference.data
      fetchError = resultByReference.error
    }

    if (fetchError) {
      console.error('Erreur lecture transaction paygate-callback :', fetchError)
      return new Response(JSON.stringify({ success: false, error: 'Impossible de récupérer la transaction.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!existing) {
      return new Response(JSON.stringify({ success: false, error: 'Transaction en attente introuvable.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (existing.status === 'completed') {
      return new Response(JSON.stringify({ success: true, message: 'Transaction déjà confirmée.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!existing.candidate_id || !existing.vote_count) {
      return new Response(JSON.stringify({ success: false, error: 'Transaction incomplète : candidate ou nombre de votes manquant.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`RPC increment_vote_by: candidate=${existing.candidate_id}, votes=${existing.vote_count}`)
    
    const { error: voteError } = await supabase.rpc('increment_vote_by', {
      row_id: existing.candidate_id,
      vote_amount: existing.vote_count,
    })

    if (voteError) {
      console.error('ERREUR RPC increment_vote_by paygate-callback:', {
        error: voteError,
        candidate_id: existing.candidate_id,
        vote_count: existing.vote_count,
      })
      return new Response(JSON.stringify({ success: false, error: 'Impossible de comptabiliser le vote après confirmation: ' + voteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    console.log('✅ Vote comptabilisé avec succès')

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'completed',
        payment_reference: paymentReference,
        payment_method: paymentMethod,
        phone_number: phoneNumber,
        confirmed_at: datetime || new Date().toISOString(),
        transaction_ref: txReference,
      })
      .eq('id', existing.id)

    if (updateError) {
      console.error('❌ ERREUR: Impossible de mettre à jour la transaction dans paygate-callback:', updateError)
      return new Response(JSON.stringify({ success: false, error: 'Impossible de mettre à jour la transaction. Vérifiez que les politiques RLS de la table transactions sont configurées.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, message: 'Paiement confirmé et vote comptabilisé.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Erreur paygate-callback :', error)
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erreur interne.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
