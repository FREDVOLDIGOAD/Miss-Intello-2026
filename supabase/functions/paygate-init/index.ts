// Supabase Edge Function — paygate-init
// Appelée par l'application React pour initier un paiement PayGate Global (Togo)
/// <reference lib="dom" />
/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const validNetworks = ["TMONEY", "FLOOZ"];
const PRICE_PER_VOTE = 200;

serve(async (req) => {
  // Répondre aux pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { candidateId, phoneNumber, network, amount } = await req.json() as {
      candidateId?: string | number
      phoneNumber?: string
      network?: string
      amount?: number | string
    }

    if (!candidateId || !phoneNumber || !network || amount === undefined || amount === null) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants (candidateId, phoneNumber, network, amount)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!validNetworks.includes(network)) {
      return new Response(
        JSON.stringify({ error: "Réseau de paiement invalide. Utilisez TMONEY ou FLOOZ." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0 || amountNumber % PRICE_PER_VOTE !== 0) {
      return new Response(
        JSON.stringify({ error: `Montant invalide. Le montant doit être un multiple de ${PRICE_PER_VOTE}.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const numberOfVotes = amountNumber / PRICE_PER_VOTE;
    if (numberOfVotes < 1) {
      return new Response(
        JSON.stringify({ error: "Le nombre de votes doit être au moins 1." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const PAYGATE_TOKEN = Deno.env.get("PAYGATE_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAYGATE_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Configuration serveur incomplète : PAYGATE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY requis." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const identifier = `vote-${candidateId}-${Date.now()}`
    const paygateResponse = await fetch("https://paygateglobal.com/api/v1/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: PAYGATE_TOKEN,
        phone_number: phoneNumber,
        amount: amountNumber,
        network: network,
        description: `Vote Miss Intello 2026 — candidate #${candidateId}`,
        identifier,
      }),
    });

    const paygateData = await paygateResponse.json();
    console.log("Réponse PayGate :", paygateData);

    if (!(paygateData.status === 0 || paygateData.status === "0")) {
      return new Response(
        JSON.stringify({
          success: false,
          status: paygateData.status ?? 1,
          error: paygateData.message || "Échec du paiement PayGate.",
          paygateData,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const txReference = paygateData.tx_reference ?? paygateData.reference ?? identifier
    const { error: saveError } = await supabase.from('transactions').insert([
      {
        transaction_ref: txReference,
        identifier,
        candidate_id: candidateId,
        amount: amountNumber,
        vote_count: numberOfVotes,
        status: 'pending',
      },
    ], { upsert: true, onConflict: ['transaction_ref', 'identifier'] })

    if (saveError) {
      console.warn('Impossible d’enregistrer la transaction PayGate en attente :', saveError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        paymentInitiated: true,
        status: paygateData.status === undefined ? 0 : paygateData.status,
        message: "Paiement initié. Confirmez la transaction depuis votre téléphone. Le vote sera comptabilisé après confirmation du paiement.",
        reference: txReference,
        candidateId,
        voteCount: numberOfVotes,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erreur inattendue :", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur interne du serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
