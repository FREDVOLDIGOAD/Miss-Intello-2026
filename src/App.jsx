import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function App() {
  const [candidates, setCandidates] = useState([]);
  const [erreur, setErreur] = useState(null);


  // Function to fetch candidates from Supabase
  const fetchCandidates = async () => {
    try {
      const { data, error } = await supabase.from('candidates').select('*');
      if (error) throw error;
      setCandidates(data || []);
    } catch (e) {
      setErreur(e.message);
    }
  };

  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [pendingReference, setPendingReference] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [network, setNetwork] = useState('TMONEY'); // TMONEY ou FLOOZ
  const [voteCount, setVoteCount] = useState(1); // Nombre de votes choisi
  const PRICE_PER_VOTE = 200; // FCFA par vote
  const currentCandidateRef = useRef(null);

  useEffect(() => {
    fetchCandidates();
  }, []);

  // L'écouteur Kkiapay a été retiré, nous utilisons maintenant PayGate.

  if (erreur) {
    return (
      <div className="p-20 text-center text-red-500">
        <h1 className="text-2xl font-bold">Oups ! Erreur de connexion ❌</h1>
        <p className="mt-4 bg-gray-100 p-4 rounded">{erreur}</p>
        <p className="mt-4 text-gray-500 italic">Vérifie tes clés dans le fichier .env</p>
      </div>
    );
  }

  const handleVoteClick = (candidate) => {
    currentCandidateRef.current = candidate;
    setShowPaymentModal(true);
    setPhoneNumber('');
    setNetwork('TMONEY'); // Réseau par défaut
    setVoteCount(1); // Réinitialiser le nombre de votes
  };

  const handleVotePayGate = async (candidate, phoneNumber, network, numberOfVotes) => {
    if (!candidate) {
      alert("Aucune candidate sélectionnée.");
      return false;
    }

    const totalAmount = numberOfVotes * PRICE_PER_VOTE;

    const { data, error } = await supabase.functions.invoke('paygate-pay', {
      body: {
        phone: phoneNumber,
        amount: totalAmount,
        network,
        candidateId: candidate.id,
        voteCount: numberOfVotes,
      },
    });

    if (error) {
      console.error("Erreur d'appel Edge Function:", error);
      alert("Impossible de contacter le service de paiement. Vérifiez votre connexion ou réessayez plus tard.");
      return false;
    }

    if (data?.paymentInitiated === true) {
      setPendingReference(data.reference || null);
      alert(`Demande de paiement envoyée ! Vérifiez votre téléphone et confirmez la transaction. Le vote sera comptabilisé une fois le paiement confirmé.`);
      return true;
    }

    const status = data?.status ?? data?.paygateResult?.status;
    const serverMessage = data?.error || data?.message || "Une erreur inconnue est survenue avec PayGate.";

    if (status === 2) {
      alert("Erreur PayGate : jeton d'authentification invalide.");
    } else if (status === 4) {
      alert("Erreur PayGate : paramètres invalides (vérifiez le numéro et le réseau).");
    } else {
      alert(serverMessage);
    }

    return false;
  };

  const processPaygatePayment = async (e) => {
    e.preventDefault();
    if (!phoneNumber || phoneNumber.length < 8) {
      alert("Veuillez entrer un numéro de téléphone valide.");
      return;
    }

    setPaymentLoading(true);
    try {
      const candidate = currentCandidateRef.current;

      const success = await handleVotePayGate(candidate, phoneNumber, network, voteCount);

      if (success) {
        setShowPaymentModal(false);
      }

      // Rafraîchir la liste des candidats
      fetchCandidates();

    } catch (err) {
      console.error("Erreur de Paiement PayGate:", err);
      alert(`Erreur lors de l'initiation du paiement : ${err.message || 'Impossible de joindre le serveur.'}`);
    } finally {
      setPaymentLoading(false);
    }
  };

  const verifyPaygateTransaction = async () => {
    if (!pendingReference) {
      alert('Aucune transaction en attente à vérifier.');
      return;
    }

    setVerifyLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('paygate-verify', {
        body: {
          txReference: pendingReference,
        },
      });

      if (error) {
        console.error('Erreur d’appel de vérification :', error);
        alert('Impossible de vérifier la transaction. Réessayez plus tard.');
        return;
      }

      if (data?.success) {
        alert('Paiement confirmé. Le vote a été comptabilisé.');
        setPendingReference(null);
        fetchCandidates();
        return;
      }

      alert(data?.error || 'La vérification du paiement a échoué.');
    } catch (err) {
      console.error('Erreur de vérification PayGate :', err);
      alert(`Erreur lors de la vérification du paiement : ${err.message || 'Réessayez plus tard.'}`);
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <>
      {!selectedCandidate ? (
        <>
          <header>
            <div className="logo-top">
              <strong>MISS INTELLO</strong>
            </div>

            <div className="hero-content">
              <h1>Votez en ligne pour Votre candidate préférée</h1>
              <p>Élisez votre candidate préférée au concours Miss Intello et soutenez l&apos;intelligence au féminin !</p>
              <a href="#vote" className="btn-main">Voter maintenant</a>
            </div>

            <div className="hero-image">
              <img src="WhatsApp_Image_2026-03-30_at_20.55.09-removebg-preview.png" alt="Miss Intello" />
            </div>
          </header>

          {pendingReference && (
            <div className="max-w-4xl mx-auto my-6 rounded-2xl border border-pink-400/30 bg-pink-500/10 p-5 text-pink-100 shadow-lg">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <strong>Paiement en attente</strong>
                  <p className="text-sm text-pink-200 mt-1">Référence : {pendingReference}. Si le paiement est déjà confirmé, cliquez sur Vérifier.</p>
                </div>
                <button
                  onClick={verifyPaygateTransaction}
                  disabled={verifyLoading}
                  className="btn-main inline-flex items-center justify-center px-5 py-3"
                >
                  {verifyLoading ? 'Vérification...' : 'Vérifier le paiement'}
                </button>
              </div>
            </div>
          )}

          <section className="candidates-section" id="vote">
            <h2>Les Candidates</h2>

            {candidates.length === 0 ? (
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', padding: '40px', borderRadius: '10px', boxShadow: '0 10px 20px rgba(0,0,0,0.3)', maxWidth: '400px', margin: '0 auto' }}>
                <p style={{ color: '#e2e8f0' }}>Aucune candidate trouvée dans la base de données.</p>
                <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginTop: '10px' }}>Va dans le "Table Editor" de Supabase pour en ajouter !</p>
              </div>
            ) : (
              <div className="candidates-grid">
                {candidates.map(c => (
                  <article key={c.id} className="card">
                    <div className="card-image-box">
                      <img src={c.photo_url || "https://via.placeholder.com/300x350/222/fff?text=Photo"} alt={c.name} />
                    </div>

                    <div className="card-info">
                      <p className="label-category">MISS</p>
                      <h3 className="candidate-name">{c.name}</h3>

                      <div className="stat-badge">
                        <i className="fa-solid fa-check-to-slot"></i> {c.votes} votes
                      </div>
                      <div className="info-line purple-text">
                        <i className="fa-solid fa-money-bill-wave"></i>
                        <span>Montant / vote : 200 FCFA</span>
                      </div>
                    </div>

                    <div className="card-buttons">
                      <button onClick={() => handleVoteClick(c)} className="btn-vote-now">Voter</button>
                      <button onClick={() => setSelectedCandidate(c)} className="btn-view-details">
                        <i className="fa-regular fa-eye"></i> Voir Détail
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="details-page-wrapper">
          <div className="detail-container">
            <a href="#/" className="btn-back" onClick={(e) => { e.preventDefault(); setSelectedCandidate(null); }}>
              <i className="fa-solid fa-arrow-left"></i> Retour aux candidates
            </a>

            <div className="main-layout">
              <div className="poster-section">
                <img src={selectedCandidate.photo_url || "https://via.placeholder.com/400x500"} alt="Affiche Candidate" className="candidate-poster" />
              </div>

              <div className="info-section">
                <div className="candidate-header">
                  <span className="category-tag">MISS</span>
                  <h1 className="candidate-name-large">{selectedCandidate.name}</h1>
                </div>

                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-icon"><i className="fa-solid fa-check-to-slot"></i></div>
                    <div className="stat-text">
                      <label>Votes</label>
                      <strong>{selectedCandidate.votes}</strong>
                    </div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-icon"><i className="fa-solid fa-money-bill-wave"></i></div>
                    <div className="stat-text">
                      <label>Montant / vote</label>
                      <strong>200 FCFA</strong>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8 backdrop-blur-md shadow-lg">
                  <h3 className="text-xl font-semibold mb-3 text-black flex items-center gap-2">
                    <i className="fa-solid fa-book-open text-pink-500"></i> Biographie
                  </h3>
                  <div className="text-black leading-relaxed text-[0.95rem]">
                    {selectedCandidate.biography ? (
                      <p>{selectedCandidate.biography}</p>
                    ) : (
                      <p className="italic text-gray-400">
                        {selectedCandidate.name} est une jeune femme passionnée et déterminée. Elle participe à l&apos;élection Miss Intello 2026 pour mettre en avant l&apos;excellence, le leadership féminin et défendre les causes qui lui tiennent à cœur.
                        <strong>(Biographie détaillée à venir)</strong>
                      </p>
                    )}
                  </div>
                </div>


                <button className="btn-vote-large" onClick={() => handleVoteClick(selectedCandidate)}>
                  <i className="fa-solid fa-heart"></i> Voter pour {selectedCandidate.name}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PayGate Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1e1e2e] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative transition-all">
            <button
              onClick={() => !paymentLoading && setShowPaymentModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              disabled={paymentLoading}
            >
              <i className="fa-solid fa-xmark text-xl"></i>
            </button>

            <div className="p-8">
              <h3 className="text-2xl font-bold text-white mb-2 text-center">
                Paiement <span className="text-[#ec4899]">PayGate</span>
              </h3>
              <p className="text-gray-400 text-center text-sm mb-6">
                Votez pour <span className="text-pink-400 font-semibold">{currentCandidateRef.current?.name}</span>
              </p>

              <form onSubmit={processPaygatePayment} className="space-y-5">

                {/* --- Sélecteur du nombre de votes --- */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <i className="fa-solid fa-check-to-slot mr-2 text-pink-400"></i>
                    Nombre de votes
                  </label>
                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-2">
                    <button
                      type="button"
                      onClick={() => setVoteCount(v => Math.max(1, v - 1))}
                      disabled={paymentLoading || voteCount <= 1}
                      className="w-10 h-10 rounded-lg bg-white/10 hover:bg-pink-600/30 text-white font-bold text-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={voteCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val >= 1) setVoteCount(val);
                      }}
                      disabled={paymentLoading}
                      className="flex-1 text-center bg-transparent text-white text-2xl font-bold focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setVoteCount(v => v + 1)}
                      disabled={paymentLoading}
                      className="w-10 h-10 rounded-lg bg-white/10 hover:bg-pink-600/30 text-white font-bold text-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </div>
                  {/* Raccourcis rapides */}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[1, 3, 5, 10, 20].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setVoteCount(n)}
                        disabled={paymentLoading}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          voteCount === n
                            ? 'bg-pink-600 text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Récapitulatif du montant */}
                <div className="flex items-center justify-between bg-gradient-to-r from-pink-600/10 to-purple-600/10 border border-pink-500/20 rounded-xl px-4 py-3">
                  <span className="text-gray-300 text-sm">Total à payer</span>
                  <span className="text-white font-bold text-xl">
                    {(voteCount * PRICE_PER_VOTE).toLocaleString('fr-FR')} <span className="text-pink-400 text-sm">FCFA</span>
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Réseau Mobile</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNetwork('TMONEY')}
                      className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${network === 'TMONEY' ? 'border-[#ec4899] bg-[#ec4899]/10 text-white' : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/30'}`}
                      disabled={paymentLoading}
                    >
                      <i className="fa-solid fa-mobile-screen text-xl"></i>
                      <span className="font-semibold text-sm">T-Money</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNetwork('FLOOZ')}
                      className={`py-3 px-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${network === 'FLOOZ' ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/30'}`}
                      disabled={paymentLoading}
                    >
                      <i className="fa-solid fa-sim-card text-xl"></i>
                      <span className="font-semibold text-sm">Flooz</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Numéro de téléphone</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-gray-400 font-medium">+228</span>
                    </div>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\\D/g, ''))}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-xl pl-16 pr-4 py-3 focus:outline-none focus:border-[#ec4899] transition-colors"
                      placeholder="90 00 00 00"
                      required
                      disabled={paymentLoading}
                      maxLength="8"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={paymentLoading || phoneNumber.length < 8}
                  className="w-full mt-6 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {paymentLoading ? (
                    <><i className="fa-solid fa-circle-notch fa-spin"></i> Traitement...</>
                  ) : (
                    <><i className="fa-solid fa-lock"></i> Payer {(voteCount * PRICE_PER_VOTE).toLocaleString('fr-FR')} FCFA — {voteCount} vote{voteCount > 1 ? 's' : ''}</>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-16 border-t border-white/10 bg-black/40 py-12 backdrop-blur-md">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center md:text-left">
              <h4 className="text-[#ec4899] font-bold text-lg mb-4">Miss Intello 2026</h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                Célébrons l&apos;intelligence, le leadership et l&apos;excellence au féminin. Soutenez votre candidate favorite en votant en ligne.
              </p>
            </div>

            <div className="text-center">
              <h4 className="text-white font-bold text-lg mb-4">Contacts</h4>
              <ul className="text-gray-400 text-sm space-y-2">
                <li><i className="fa-solid fa-phone mr-2 text-[#ec4899]"></i> +228 90 83 64 94</li>
                <li><i className="fa-solid fa-envelope mr-2 text-[#ec4899]"></i> comitemissintello1@gmailcom</li>
                <li><i className="fa-solid fa-location-dot mr-2 text-[#ec4899]"></i> Lomé, TOGO</li>
              </ul>
            </div>

            <div className="text-center md:text-right">
              <h4 className="text-white font-bold text-lg mb-4">Informations</h4>
              <ul className="text-gray-400 text-sm space-y-2">
                <li><a href="#/" className="hover:text-[#ec4899] transition-colors">Mentions Légales</a></li>
                <li><a href="#/" className="hover:text-[#ec4899] transition-colors">Conditions Générales de Vente</a></li>
                <li><a href="#/" className="hover:text-[#ec4899] transition-colors">Politique de Confidentialité</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/10 text-center text-gray-500 text-sm">
            <p> &copy; {new Date().getFullYear()} Miss Intello. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </>
  );
}