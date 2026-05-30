-- Création de la table candidates
CREATE TABLE public.candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    bio TEXT,
    photo_url TEXT,
    votes INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Activation de la RLS (Row Level Security) par sécurité
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

-- Autoriser la lecture publique des candidats
CREATE POLICY "Candidats visibles par tous" 
ON public.candidates FOR SELECT 
USING (true);

-- Fonction RPC pour incrémenter d'1 vote (rétrocompatibilité)
CREATE OR REPLACE FUNCTION increment_vote(row_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.candidates
  SET votes = votes + 1
  WHERE id = row_id;
END;
$$;

-- ✅ NOUVELLE FONCTION : Incrémenter les votes par un nombre arbitraire
-- Utilisée quand l'utilisateur choisit plusieurs votes à la fois
CREATE OR REPLACE FUNCTION increment_vote_by(row_id UUID, vote_amount INTEGER)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.candidates
  SET votes = votes + vote_amount
  WHERE id = row_id;
END;
$$;

-- On supprime l'accès public aux deux fonctions (BACKEND SEUL via Service Role)
REVOKE EXECUTE ON FUNCTION increment_vote FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_vote FROM anon;
REVOKE EXECUTE ON FUNCTION increment_vote FROM authenticated;

REVOKE EXECUTE ON FUNCTION increment_vote_by FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_vote_by FROM anon;
REVOKE EXECUTE ON FUNCTION increment_vote_by FROM authenticated;
