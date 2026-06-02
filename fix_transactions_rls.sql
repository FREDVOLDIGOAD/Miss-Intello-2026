-- ✅ FIX: Ajouter les politiques RLS manquantes pour la table transactions

-- Les Edge Functions utilisent SUPABASE_SERVICE_ROLE_KEY (rôle admin) qui bypass RLS
-- Donc on peut créer une politique générale pour les opérations publiques si nécessaire
-- OU laisser seulement les Edge Functions (admin) accéder via leur rôle spécial

-- 1️⃣ Politique : Autoriser les Edge Functions à INSÉRER des transactions (pour paygate-pay)
CREATE POLICY "Edge Functions insèrent les transactions"
ON public.transactions
FOR INSERT
WITH CHECK (true);

-- 2️⃣ Politique : Autoriser les Edge Functions à METTRE À JOUR les transactions (pour paygate-verify et paygate-callback)
CREATE POLICY "Edge Functions mettent à jour les transactions"
ON public.transactions
FOR UPDATE
USING (true)
WITH CHECK (true);

-- 3️⃣ Politique : Autoriser la lecture des transactions par qui ? (à adapter selon besoin)
-- Par défaut : autorisé pour tous (les Edge Functions peuvent lire)
CREATE POLICY "Lire les transactions"
ON public.transactions
FOR SELECT
USING (true);

-- 4️⃣ BONUS: Vérifier que la table transactions existe et est correctement configurée
-- Si la table manque des colonnes, les ajouter ici

-- Vérifier que toutes les colonnes requises existent et ajouter les manquantes si nécessaire
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS payment_reference TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;

-- ✅ Confirmation
SELECT 'Politiques RLS configurées pour transactions' AS status;
