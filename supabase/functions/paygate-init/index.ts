import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRICE_PER_VOTE = 200;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { candidateId, phoneNumber, network, amount } = await req.json();

    // Validation
    const amountNum = Number(amount);
    if (!candidateId || !phoneNumber || amountNum % PRICE_PER_VOTE !== 0) {
      throw new Error("Données invalides ou montant incorrect.");
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const internalId = crypto.randomUUID();

    // Appel API PayGate Global
    const response = await fetch("https://paygateglobal.com/api/v1/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: Deno.env.get("PAYGATE_TOKEN"),
        phone_number: phoneNumber.replace(/\s/g, ''),
        amount: amountNum,
        network: network.toUpperCase(),
        identifier: internalId,
        description: `Vote Miss Intello`
      }),
    });

    const data = await response.json();

    if (String(data.status) !== "0") {
      return new Response(JSON.stringify({ error: data.message }), { status: 400, headers: corsHeaders });
    }

    // Enregistrement en base (status pending)
    await supabase.from('transactions').insert({
      id: internalId, // On utilise l'UUID généré
      identifier: internalId,
      candidate_id: candidateId,
      amount: amountNum,
      vote_count: amountNum / PRICE_PER_VOTE,
      status: 'pending',
      transaction_ref: data.tx_reference
    });

    return new Response(JSON.stringify({ success: true, identifier: internalId }), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});