// Supabase Edge Function — paygate-verify
// Vérifie manuellement le statut d'une transaction PayGate v1 et comptabilise le vote

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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const PRICE_PER_VOTE = 200

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { identifier, txReference, reference } = await req.json() as {
      identifier?: string
      txReference?: string
      reference?: string
    }

    const paymentReference = txReference ?? reference

    if (!identifier && !paymentReference) {
      return new Response(JSON.stringify({ error: 'identifier ou txReference est requis.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const paygateToken = Deno.env.get('PAYGATE_TOKEN')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!paygateToken || !supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Configuration serveur incomplète : PAYGATE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY requis.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let query = supabase.from('transactions').select('id, status, candidate_id, vote_count, transaction_ref').maybeSingle()
    if (identifier) {
      query = query.eq('identifier', identifier)
    } else {
      query = query.eq('transaction_ref', paymentReference)
    }

    const { data: transaction, error: fetchError } = await query

    if (fetchError) {
      console.error('Erreur lecture transaction paygate-verify :', fetchError)
      return new Response(JSON.stringify({ error: 'Impossible de récupérer la transaction.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!transaction) {
      return new Response(JSON.stringify({ error: 'Transaction en attente introuvable.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (transaction.status === 'completed') {
      return new Response(JSON.stringify({ success: true, message: 'Transaction déjà confirmée.', transaction }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const txRefToVerify = transaction.transaction_ref ?? paymentReference
    if (!txRefToVerify) {
      return new Response(JSON.stringify({ error: 'Référence de transaction PayGate manquante pour vérification.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const verifyResponse = await fetch('https://paygateglobal.com/api/v1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: paygateToken,
        tx_reference: txRefToVerify,
      }),
    })

    const verifyResult = await verifyResponse.json()
    console.log('Vérification PayGate manuelle :', verifyResult)

    if (!(verifyResult.status === 0 || verifyResult.status === '0')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Paiement PayGate non confirmé.',
        paygateStatus: verifyResult,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!transaction.candidate_id || !transaction.vote_count) {
      return new Response(JSON.stringify({ error: 'Transaction incomplète : candidate ou nombre de votes manquant.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`RPC increment_vote_by: candidate=${transaction.candidate_id}, votes=${transaction.vote_count}`)
    
    const { error: voteError } = await supabase.rpc('increment_vote_by', {
      row_id: transaction.candidate_id,
      vote_amount: transaction.vote_count,
    })

    if (voteError) {
      console.error('ERREUR RPC increment_vote_by paygate-verify:', {
        error: voteError,
        candidate_id: transaction.candidate_id,
        vote_count: transaction.vote_count,
      })
      return new Response(JSON.stringify({ error: 'Impossible de comptabiliser le vote après vérification: ' + voteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    console.log('✅ Vote comptabilisé avec succès')

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'completed',
        confirmed_at: verifyResult.datetime || new Date().toISOString(),
        payment_reference: verifyResult.payment_reference || null,
        payment_method: verifyResult.payment_method || null,
        phone_number: verifyResult.phone_number || null,
        transaction_ref: txRefToVerify,
      })
      .eq('id', transaction.id)

    if (updateError) {
      console.error('❌ ERREUR: Impossible de mettre à jour la transaction dans paygate-verify:', updateError)
      return new Response(JSON.stringify({ error: 'Impossible de mettre à jour la transaction. Vérifiez que les politiques RLS de la table transactions sont configurées.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Paiement PayGate confirmé et vote comptabilisé.',
      paygateStatus: verifyResult,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Erreur paygate-verify :', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur interne du serveur.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
