-- Ce script est à exécuter MANUELLEMENT dans l'éditeur SQL de Supabase
-- pour patcher immédiatement votre backend de production !

-- 1. On crée la table 'transactions' si elle n'existe pas
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES public.candidates(id),
    transaction_ref TEXT UNIQUE NOT NULL,
    amount INTEGER DEFAULT 200,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. On sécurise les transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 3. On sécurise l'incrémentation des votes en recréant la fonction proprement
CREATE OR REPLACE FUNCTION increment_vote(row_id UUID)
RETURNS void
LANGUAGE plpgsql
-- AUCUN SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.candidates
  SET votes = votes + 1
  WHERE id = row_id;
END;
$$;

-- 4. ON BLOQUE L'ACCÈS POUR LE NAVIGATEUR ET LE PUBLIC !
REVOKE EXECUTE ON FUNCTION increment_vote FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_vote FROM anon;
REVOKE EXECUTE ON FUNCTION increment_vote FROM authenticated;

-- On supprime l'ancienne fonction vulnérable que l'on avait abordée avant
DROP FUNCTION IF EXISTS confirmer_vote_payant(UUID, TEXT);
