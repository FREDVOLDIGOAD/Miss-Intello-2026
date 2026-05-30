// Supabase Edge Function — paygate-init
// Appelée par l'application React pour initier un paiement PayGate Global (Togo)
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Répondre aux pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { candidateId, phoneNumber, network, amount } = await req.json();

    // Validation des champs requis
    if (!candidateId || !phoneNumber || !network || !amount) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants (candidateId, phoneNumber, network, amount)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Récupération du token PayGate depuis les secrets Supabase
    const PAYGATE_TOKEN = Deno.env.get("PAYGATE_TOKEN");
    if (!PAYGATE_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Token PayGate non configuré côté serveur." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Appel à l'API PayGate Global
    // Référence : https://paygateglobal.com/docs
    const paygateResponse = await fetch("https://paygateglobal.com/api/v1/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: PAYGATE_TOKEN,
        phone_number: phoneNumber,    // ex: "90000000" (sans +228)
        amount: amount,               // 200
        network: network,             // "TMONEY" ou "FLOOZ"
        description: `Vote Miss Intello 2026 — candidate #${candidateId}`,
        identifier: `vote-${candidateId}-${Date.now()}`, // identifiant unique
      }),
    });

    const paygateData = await paygateResponse.json();
    console.log("Réponse PayGate :", paygateData);

    // PayGate retourne status=0 en cas de succès
    if (paygateData.status !== 0) {
      return new Response(
        JSON.stringify({ error: paygateData.message || "Échec du paiement PayGate." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Paiement accepté → enregistrer le vote dans Supabase
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );



    // Méthode alternative plus sûre avec rpc increment
    const { error: rpcError } = await supabaseAdmin.rpc("increment_votes", {
      candidate_id: candidateId,
    });

    if (rpcError) {
      console.error("Erreur RPC increment_votes:", rpcError);
      // Le paiement a réussi mais le vote n'a pas été enregistré
      return new Response(
        JSON.stringify({
          warning: "Paiement réussi mais erreur lors de l'enregistrement du vote. Contactez le support.",
          paygateRef: paygateData.reference,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Succès total !
    return new Response(
      JSON.stringify({
        success: true,
        message: "Paiement et vote enregistrés avec succès !",
        reference: paygateData.reference,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erreur inattendue :", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erreur interne du serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
