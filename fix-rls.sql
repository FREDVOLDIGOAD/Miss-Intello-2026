-- Fix RLS sur la table transactions
-- Les Edge Functions utilisent SERVICE_ROLE qui doit avoir accès complet

-- 1. Vérifier les politiques existantes
SELECT * FROM pg_policies WHERE tablename = 'transactions';

-- 2. Si vides, ajouter les politiques pour SERVICE_ROLE (par défaut les Edge Functions peuvent toujours accéder)
-- Mais si vous avez des politiques restrictives, vérifiez qu'elles ne bloquent pas SERVICE_ROLE

-- 3. Alternative: Créer une politique permissive pour éviter les problèmes
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;

-- OU garder RLS mais ajouter une politique qui refuse tout sauf SERVICE_ROLE:
-- CREATE POLICY "Service role access" 
-- ON public.transactions 
-- USING (auth.role() = 'service_role')
-- WITH CHECK (auth.role() = 'service_role');

-- 4. Puis re-activer
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 5. Vérifier que les candidats ont aussi les bonnes permissions
SELECT * FROM pg_policies WHERE tablename = 'candidates';
