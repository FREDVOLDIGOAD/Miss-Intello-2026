import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const { identifier } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: tx } = await supabase.from('transactions').select('*').eq('identifier', identifier).single();

    if (tx.status === 'completed') return new Response(JSON.stringify({ success: true }));

    // On demande à PayGate le statut réel
    const pgRes = await fetch("https://paygateglobal.com/api/v1/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: Deno.env.get('PAYGATE_TOKEN'),
        tx_reference: tx.transaction_ref
      })
    });
    const pgData = await pgRes.json();

    if (String(pgData.status) === "0") {
      await supabase.rpc('confirm_vote_transaction', {
        p_transaction_id: tx.id,
        p_candidate_id: tx.candidate_id,
        p_vote_amount: tx.vote_count,
        p_payment_ref: pgData.payment_reference,
        p_payment_method: pgData.payment_method,
        p_phone: pgData.phone_number,
        p_tx_ref: tx.transaction_ref
      });
      return new Response(JSON.stringify({ success: true }));
    }

    return new Response(JSON.stringify({ success: false, message: "Paiement non trouvé" }));
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
})