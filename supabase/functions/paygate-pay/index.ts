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

const validNetworks = ['TMONEY', 'FLOOZ']
const PRICE_PER_VOTE = 200

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, amount, network, candidateId, voteCount } = await req.json() as {
      phone?: string
      amount?: number | string
      network?: string
      candidateId?: string | number
      voteCount?: number | string
    }

    if (!phone || amount === undefined || amount === null || !network || !candidateId) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants : phone, amount, network, candidateId.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Valider que candidateId est un UUID valide
    const candidateIdStr = candidateId.toString().trim()
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(candidateIdStr)) {
      return new Response(JSON.stringify({ error: `candidateId invalide: "${candidateIdStr}" n'est pas un UUID valide.` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!validNetworks.includes(network)) {
      return new Response(JSON.stringify({ error: 'Réseau invalide. Utilisez TMONEY ou FLOOZ.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const numberOfVotes = Math.max(1, Math.floor(Number(voteCount) || 1))
    if (numberOfVotes < 1) {
      return new Response(JSON.stringify({ error: 'Le nombre de votes doit être au moins 1.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const amountNumber = Number(amount)
    if (!Number.isFinite(amountNumber) || amountNumber !== numberOfVotes * PRICE_PER_VOTE) {
      return new Response(JSON.stringify({ error: `Montant incorrect. Le montant doit être égal à ${numberOfVotes * PRICE_PER_VOTE}.` }), {
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

    const identifier = crypto.randomUUID()
    console.log(`Initiation paiement pour ${phone} - Montant: ${amountNumber} FCFA - Réseau: ${network} - Votes: ${numberOfVotes}`)

    const response = await fetch('https://paygateglobal.com/api/v1/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_token: paygateToken,
        phone_number: phone,
        amount: amountNumber,
        identifier,
        network,
        description: `${numberOfVotes} vote(s) Miss Intello pour candidate ${candidateId}`,
      }),
    })

    const result = await response.json()
    console.log('Réponse PayGate:', result)

    if (!(result.status === 0 || result.status === '0')) {
      return new Response(JSON.stringify({
        success: false,
        status: result.status ?? 1,
        error: result.message || 'Échec du paiement PayGate.',
        result,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const txReference = result.tx_reference ?? result.reference ?? identifier
    
    console.log(`Sauvegarde transaction: ref=${txReference}, id=${candidateIdStr}, votes=${numberOfVotes}`)
    
    const { error: saveError } = await supabase.from('transactions').insert([
      {
        transaction_ref: txReference,
        identifier,
        candidate_id: candidateIdStr,
        amount: amountNumber,
        vote_count: numberOfVotes,
        status: 'pending',
      },
    ])

    if (saveError) {
      console.error('ERREUR: Impossible d'enregistrer la transaction PayGate:', saveError)
      return new Response(JSON.stringify({ error: 'Erreur sauvegarde transaction: ' + saveError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      paymentInitiated: true,
      status: result.status === undefined ? 0 : result.status,
      message: 'Paiement initié. Confirmez la transaction depuis votre téléphone. Le vote sera comptabilisé après paiement confirmé.',
      paygateResult: result,
      reference: txReference,
      candidateId,
      voteCount: numberOfVotes,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Erreur paygate-pay :', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur interne du serveur.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})