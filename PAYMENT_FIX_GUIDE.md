# 🔧 FIX: Paiements Qui Ne S'Enregistrent Pas

## 🔴 Problème Identifié

Les paiements ne s'enregistrent pas dans la base de données car :

1. **La table `transactions` a RLS activé SANS politiques RLS définies**
   - Les Edge Functions ne peuvent pas insérer/mettre à jour les enregistrements
   - Les erreurs sont seulement loggées en avertissement dans les fonctions

2. **Gestion des erreurs insuffisante**
   - Les erreurs d'insertion de transaction retournent `console.warn` au lieu de signaler l'erreur au client

## ✅ Solutions à Appliquer

### Étape 1: Ajouter les Politiques RLS Manquantes (CRITIQUE)

Exécutez le script SQL dans Supabase:
1. Allez sur **Supabase Dashboard** → **SQL Editor**
2. Créez une nouvelle requête
3. Collez le contenu de **`fix_transactions_rls.sql`**
4. Exécutez (Ctrl+Entrée)

Ce script ajoute les politiques RLS pour que les Edge Functions puissent insérer/mettre à jour les transactions.

### Étape 2: Vérifier les Variables d'Environnement

Assurez-vous que dans Supabase Edge Functions, ces secrets sont définis :
- ✅ `PAYGATE_TOKEN` : Votre token d'authentification PayGate
- ✅ `SUPABASE_URL` : URL de votre projet Supabase
- ✅ `SUPABASE_SERVICE_ROLE_KEY` : Clé secrète Supabase (rôle admin)
- ✅ `PAYGATE_CALLBACK_SECRET` : (optionnel) Secret pour valider les webhooks

**Comment vérifier/ajouter** :
1. Supabase Dashboard → **Edge Functions**
2. Sélectionnez chaque fonction (`paygate-pay`, `paygate-verify`, `paygate-callback`)
3. Cliquez sur **Settings** → vérifiez les secrets

### Étape 3: Tester le Flux (Optionnel)

Après appliquer le fix RLS, testez :

1. **Initier un paiement** (le bouton "Voter")
   - Une transaction doit s'insérer en `status='pending'`
   
2. **Vérifier le paiement** ("Vérifier le paiement")
   - La transaction doit passer en `status='completed'`
   - Les votes doivent s'ajouter à la candidate

## 📋 Fichiers Modifiés

- ✅ `supabase/functions/paygate-pay/index.ts` : Amélioration du log d'erreur
- 📄 `fix_transactions_rls.sql` : Politiques RLS manquantes

## 🐛 Logs à Vérifier

Après le fix, si ça ne marche toujours pas :

1. Supabase → **Edge Functions** → Fonction `paygate-pay` → **Logs**
2. Cherchez les logs d'erreur en rouge
3. Regardez pour `:❌ ERREUR CRITIQUE:` ou autres messages d'erreur

## 📞 Si Ça Ne Marche Pas

Vérifiez dans cet ordre :
1. ✅ Les politiques RLS ont-elles été ajoutées ?
2. ✅ Tous les secrets d'Edge Functions sont-ils définis ?
3. ✅ La table `transactions` existe-t-elle dans Supabase ?
4. ✅ Consultez les logs des Edge Functions
