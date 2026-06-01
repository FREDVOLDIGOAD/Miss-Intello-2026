-- Nouvelle table pour sécuriser et tracer les paiements (optionnel mais très recommandé)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES public.candidates(id),
    identifier TEXT UNIQUE NOT NULL,
    transaction_ref TEXT UNIQUE NOT NULL,
    amount INTEGER DEFAULT 200,
    vote_count INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    phone_number TEXT,
    payment_reference TEXT,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Activation RLS sur les transactions (seul l'admin y accède)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 🚨 Ce script RPC "confirmer_vote_payant" a été retiré et remplacé par l'Edge Function Supabase (verify-payment).
-- Le frontend ne doit JAMAIS interagir directement de façon unilatérale pour la validation monétaire.
-- La table "transactions" continue d'exister pour la traçabilité.
