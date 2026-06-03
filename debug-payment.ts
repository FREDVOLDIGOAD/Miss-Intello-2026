/**
 * Script de test pour déboguer le flux de paiement
 * À exécuter dans la console Supabase SQL Editor
 */

-- 1. Vérifier que la table candidates existe avec les bonnes colonnes
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'candidates'
ORDER BY ordinal_position;

-- 2. Vérifier que la table transactions existe
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions'
ORDER BY ordinal_position;

-- 3. Lister les candidats avec leurs IDs (pour tester)
SELECT id, name, votes FROM public.candidates LIMIT 5;

-- 4. Vérifier la fonction RPC increment_vote_by
SELECT prosrc FROM pg_proc WHERE proname = 'increment_vote_by';

-- 5. Tester manuellement le RPC avec un candidat existant
-- ATTENTION: Remplacez 'UUID-CANDIDAT-ICI' par un vrai UUID de candidat
-- SELECT increment_vote_by('UUID-CANDIDAT-ICI'::uuid, 1);
-- SELECT votes FROM public.candidates WHERE id = 'UUID-CANDIDAT-ICI'::uuid;

-- 6. Vérifier les transactions en attente
SELECT id, candidate_id, vote_count, status, created_at 
FROM public.transactions 
ORDER BY created_at DESC 
LIMIT 10;

-- 7. Vérifier les transactions complétées
SELECT id, candidate_id, vote_count, status, confirmed_at 
FROM public.transactions 
WHERE status = 'completed'
ORDER BY confirmed_at DESC 
LIMIT 10;

-- 8. Vérifier si les votes ont augmenté après une transaction complétée
SELECT c.id, c.name, c.votes, t.vote_count
FROM public.candidates c
LEFT JOIN public.transactions t ON c.id = t.candidate_id
WHERE t.status = 'completed'
ORDER BY t.confirmed_at DESC
LIMIT 10;
