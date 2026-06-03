import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

const QUICK_VOTES = [1, 3, 5, 10, 20];
const DEFAULT_PAGE_TITLE = 'MISS INTELLO 2026';
const DEFAULT_SHARE_TITLE = 'Votez pour votre candidate préférée | Miss Intello 2026';
const DEFAULT_SHARE_DESCRIPTION = 'Élisez votre candidate préférée au concours Miss Intello et soutenez l’intelligence au féminin.';
const DEFAULT_SHARE_IMAGE = '/assets/logo-miss-intello.png';

const getCandidateIdFromUrl = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return new URL(window.location.href).searchParams.get('candidate');
};

const buildHomeUrl = () => {
  const url = new URL(window.location.href);
  url.pathname = '/';
  url.searchParams.delete('candidate');
  url.hash = '';
  return url.toString();
};

const buildCandidateAppUrl = (candidateId) => {
  const url = new URL(window.location.href);
  url.pathname = '/';
  url.searchParams.set('candidate', candidateId);
  url.hash = '';
  return url.toString();
};

const buildCandidateShareUrl = (candidateId) => {
  const url = new URL(window.location.href);
  url.pathname = `/share/candidate/${encodeURIComponent(candidateId)}`;
  url.search = '';
  url.hash = '';
  return url.toString();
};

const toAbsoluteUrl = (value) => {
  if (typeof window === 'undefined') {
    return value;
  }

  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return new URL(DEFAULT_SHARE_IMAGE, window.location.origin).toString();
  }
};

const upsertMetaTag = (selector, attributes, content) => {
  if (typeof document === 'undefined') {
    return;
  }

  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
};

const upsertLinkTag = (selector, attributes, href) => {
  if (typeof document === 'undefined') {
    return;
  }

  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement('link');
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
};

export default function App() {
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [routeCandidateId, setRouteCandidateId] = useState(() => getCandidateIdFromUrl());
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [pendingReference, setPendingReference] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [network, setNetwork] = useState('TMONEY');
  const [voteCount, setVoteCount] = useState(1);
  const PRICE_PER_VOTE = 200;
  const currentCandidateRef = useRef(null);

  const fetchCandidates = async () => {
    setCandidatesLoading(true);

    try {
      const { data, error } = await supabase.from('candidates').select('*');
      if (error) throw error;
      setCandidates(data || []);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setCandidatesLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  useEffect(() => {
    const syncRouteWithUrl = () => {
      setRouteCandidateId(getCandidateIdFromUrl());
    };

    window.addEventListener('popstate', syncRouteWithUrl);

    return () => {
      window.removeEventListener('popstate', syncRouteWithUrl);
    };
  }, []);

  useEffect(() => {
    if (!routeCandidateId) {
      if (selectedCandidate !== null) {
        setSelectedCandidate(null);
      }

      return;
    }

    const matchedCandidate = candidates.find((candidate) => String(candidate.id) === String(routeCandidateId));

    if (matchedCandidate && selectedCandidate !== matchedCandidate) {
      setSelectedCandidate(matchedCandidate);
    }

    if (!matchedCandidate && !candidatesLoading && selectedCandidate !== null) {
      setSelectedCandidate(null);
    }
  }, [candidates, candidatesLoading, routeCandidateId, selectedCandidate]);

  useEffect(() => {
    const title = selectedCandidate ? `${selectedCandidate.name} | Vote Miss Intello 2026` : DEFAULT_PAGE_TITLE;
    const description = selectedCandidate
      ? `Votez pour ${selectedCandidate.name} au concours Miss Intello 2026 et partagez sa page officielle.`
      : DEFAULT_SHARE_DESCRIPTION;
    const pageUrl = selectedCandidate ? buildCandidateAppUrl(selectedCandidate.id) : buildHomeUrl();
    const imageUrl = toAbsoluteUrl(selectedCandidate?.photo_url || DEFAULT_SHARE_IMAGE);

    document.title = title;
    upsertMetaTag('meta[name="description"]', { name: 'description' }, description);
    upsertMetaTag('meta[property="og:title"]', { property: 'og:title' }, selectedCandidate ? title : DEFAULT_SHARE_TITLE);
    upsertMetaTag('meta[property="og:description"]', { property: 'og:description' }, description);
    upsertMetaTag('meta[property="og:image"]', { property: 'og:image' }, imageUrl);
    upsertMetaTag('meta[property="og:url"]', { property: 'og:url' }, pageUrl);
    upsertMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, selectedCandidate ? title : DEFAULT_SHARE_TITLE);
    upsertMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, description);
    upsertMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' }, imageUrl);
    upsertLinkTag('link[rel="canonical"]', { rel: 'canonical' }, pageUrl);
  }, [selectedCandidate]);

  const openCandidateDetails = (candidate) => {
    setSelectedCandidate(candidate);
    setRouteCandidateId(candidate.id);
    window.history.pushState({ candidateId: candidate.id }, '', buildCandidateAppUrl(candidate.id));
  };

  const closeCandidateDetails = () => {
    setSelectedCandidate(null);
    setRouteCandidateId(null);
    window.history.pushState({}, '', buildHomeUrl());
  };

  const shareCandidate = async (candidate) => {
    if (!candidate) {
      return;
    }

    const shareUrl = buildCandidateShareUrl(candidate.id);
    const shareData = {
      title: `${candidate.name} | Miss Intello 2026`,
      text: `Votez pour ${candidate.name} au concours Miss Intello 2026.`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        alert(`Le lien de partage de ${candidate.name} a été copié.`);
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }

      console.error('Erreur lors du partage :', error);
      alert('Le partage a échoué. Réessayez dans quelques instants.');
      return;
    }

    window.prompt('Copiez ce lien de partage :', shareUrl);
  };

  if (erreur) {
    return (
      <div className="page-shell page-shell--centered">
        <div className="feedback-card glass-card">
          <span className="eyebrow">Connexion</span>
          <h1>Oups ! Erreur de connexion ❌</h1>
          <p className="feedback-message">{erreur}</p>
          <p className="feedback-hint">Vérifie tes clés dans le fichier .env</p>
        </div>
      </div>
    );
  }

  if (candidatesLoading && routeCandidateId) {
    return (
      <div className="page-shell page-shell--centered">
        <div className="feedback-card glass-card">
          <span className="eyebrow">Chargement</span>
          <h1>Ouverture de la candidate…</h1>
          <p className="feedback-hint">Préparation de la page de vote.</p>
        </div>
      </div>
    );
  }

  const handleVoteClick = (candidate) => {
    currentCandidateRef.current = candidate;
    setShowPaymentModal(true);
    setPhoneNumber('');
    setNetwork('TMONEY');
    setVoteCount(1);
  };

  const handleVotePayGate = async (candidate, mobilePhoneNumber, paymentNetwork, numberOfVotes) => {
    if (!candidate) {
      alert('Aucune candidate sélectionnée.');
      return false;
    }

    const totalAmount = numberOfVotes * PRICE_PER_VOTE;

    const { data, error } = await supabase.functions.invoke('paygate-pay', {
      body: {
        phone: mobilePhoneNumber,
        amount: totalAmount,
        network: paymentNetwork,
        candidateId: candidate.id,
        voteCount: numberOfVotes,
      },
    });

    if (error) {
      console.error("Erreur d'appel Edge Function:", error);
      alert('Impossible de contacter le service de paiement. Vérifiez votre connexion ou réessayez plus tard.');
      return false;
    }

    if (data?.paymentInitiated === true) {
      setPendingReference(data.reference || null);
      alert('Demande de paiement envoyée ! Vérifiez votre téléphone et confirmez la transaction. Le vote sera comptabilisé une fois le paiement confirmé.');
      return true;
    }

    const status = data?.status ?? data?.paygateResult?.status;
    const serverMessage = data?.error || data?.message || 'Une erreur inconnue est survenue avec PayGate.';

    if (status === 2) {
      alert("Erreur PayGate : jeton d'authentification invalide.");
    } else if (status === 4) {
      alert('Erreur PayGate : paramètres invalides (vérifiez le numéro et le réseau).');
    } else {
      alert(serverMessage);
    }

    return false;
  };

  const processPaygatePayment = async (e) => {
    e.preventDefault();
    if (!phoneNumber || phoneNumber.length < 8) {
      alert('Veuillez entrer un numéro de téléphone valide.');
      return;
    }

    setPaymentLoading(true);
    try {
      const candidate = currentCandidateRef.current;
      const success = await handleVotePayGate(candidate, phoneNumber, network, voteCount);

      if (success) {
        setShowPaymentModal(false);
      }

      fetchCandidates();
    } catch (err) {
      console.error('Erreur de Paiement PayGate:', err);
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
        <div className="page-shell">
          <header className="site-header">
            <div className="brand">
              <img src="/assets/logo-miss-intello.png" alt="Logo MISS INTELLO" className="brand__logo" />
              <div>
                <span className="eyebrow">Vote officiel 2026</span>
                <strong>MISS INTELLO</strong>
              </div>
            </div>

            <a href="#vote" className="button button--ghost">Voter maintenant</a>
          </header>

          <main>
            <section className="hero section">
              <div className="hero__visual">
                <div className="glow glow--one"></div>
                <div className="glow glow--two"></div>

                <div className="hero__content glass-card">
                  <div className="hero__brandmark">
                    <img src="/assets/logo-miss-intello.png" alt="Logo officiel MISS INTELLO" className="hero__brandmark-logo" />
                    <div>
                      <span className="eyebrow">Collection officielle</span>
                      <strong>MISS INTELLO 2026</strong>
                    </div>
                  </div>

                  <h1>Votez en ligne pour Votre candidate préférée</h1>
                  <p className="hero__lead">Élisez votre candidate préférée au concours Miss Intello et soutenez l&apos;intelligence au féminin !</p>

                  <div className="hero__actions">
                    <a href="#vote" className="button">Voter maintenant</a>
                  </div>
                </div>

                <div className="hero__side">
                  <div className="hero-image-card glass-card">
                    <div className="hero-image">
                      <img src="/WhatsApp_Image_2026-03-30_at_20.55.09-removebg-preview.png" alt="Miss Intello" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {pendingReference && (
              <section className="section section--compact">
                <div className="status-banner glass-card">
                  <div>
                    <strong>Paiement en attente</strong>
                    <p>Référence : {pendingReference}. Si le paiement est déjà confirmé, cliquez sur Vérifier.</p>
                  </div>
                  <button
                    type="button"
                    onClick={verifyPaygateTransaction}
                    disabled={verifyLoading}
                    className="button button--secondary"
                  >
                    {verifyLoading ? 'Vérification...' : 'Vérifier le paiement'}
                  </button>
                </div>
              </section>
            )}

            <section className="section" id="vote">
              <div className="section-heading">
                <span className="eyebrow">Galerie officielle</span>
                <h2>Les Candidates</h2>
              </div>

              {candidates.length === 0 ? (
                <div className="empty-state glass-card">
                  <p>Aucune candidate trouvée dans la base de données.</p>
                  <p>Va dans le &quot;Table Editor&quot; de Supabase pour en ajouter !</p>
                </div>
              ) : (
                <div className="candidates-grid">
                  {candidates.map((candidate) => (
                    <article key={candidate.id} className="card candidate-card">
                      <div className="card-image-box candidate-card__media">
                        <img src={candidate.photo_url || 'https://via.placeholder.com/300x350/222/fff?text=Photo'} alt={candidate.name} />
                      </div>

                      <div className="card-info candidate-card__body">
                        <div className="candidate-card__meta">
                          <p className="label-category">MISS</p>
                          <div className="stat-badge">
                            <i className="fa-solid fa-check-to-slot"></i> {candidate.votes} votes
                          </div>
                        </div>

                        <h3 className="candidate-name">{candidate.name}</h3>

                        <div className="info-line purple-text">
                          <i className="fa-solid fa-money-bill-wave"></i>
                          <span>Montant / vote : 200 FCFA</span>
                        </div>
                      </div>

                      <div className="card-buttons candidate-card__actions">
                        <button type="button" onClick={() => handleVoteClick(candidate)} className="button button--card">
                          Voter
                        </button>
                        <button type="button" onClick={() => openCandidateDetails(candidate)} className="button button--secondary button--card-secondary">
                          <i className="fa-regular fa-eye"></i> Voir Détail
                        </button>
                        <button type="button" onClick={() => shareCandidate(candidate)} className="button button--secondary button--card-secondary">
                          <i className="fa-solid fa-share-nodes"></i> Partager
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </main>

          <footer className="site-footer">
            <div className="site-footer__grid">
              <div>
                <div className="footer-brand">
                  <img src="/assets/logo-miss-intello.png" alt="Logo MISS INTELLO" className="footer-brand__logo" />
                  <h4>Miss Intello 2026</h4>
                </div>
                <p>
                  Célébrons l&apos;intelligence, le leadership et l&apos;excellence au féminin. Soutenez votre candidate favorite en votant en ligne.
                </p>
              </div>

              <div>
                <h4>Contacts</h4>
                <ul>
                  <li><i className="fa-solid fa-phone"></i> +228 90 83 64 94</li>
                  <li><i className="fa-solid fa-envelope"></i> comitemissintello1@gmailcom</li>
                  <li><i className="fa-solid fa-location-dot"></i> Lomé, TOGO</li>
                </ul>
              </div>

              <div>
                <h4>Informations</h4>
                <ul>
                  <li><a href="#/">Mentions Légales</a></li>
                  <li><a href="#/">Conditions Générales de Vente</a></li>
                  <li><a href="#/">Politique de Confidentialité</a></li>
                </ul>
              </div>
            </div>

            <div className="site-footer__bottom">
              <p>&copy; {new Date().getFullYear()} Miss Intello. Tous droits réservés.</p>
            </div>
          </footer>
        </div>
      ) : (
        <div className="page-shell detail-page-shell">
          <section className="section section--compact">
            <a href="/" className="btn-back" onClick={(e) => { e.preventDefault(); closeCandidateDetails(); }}>
              <i className="fa-solid fa-arrow-left"></i> Retour aux candidates
            </a>
          </section>

          <section className="section section--compact">
            <div className="detail-container">
              <div className="main-layout">
                <div className="poster-section glass-card">
                  <img src={selectedCandidate.photo_url || 'https://via.placeholder.com/400x500'} alt="Affiche Candidate" className="candidate-poster" />
                </div>

                <div className="info-section glass-card">
                  <div className="candidate-header">
                    <img
                      src={selectedCandidate.photo_url || 'https://via.placeholder.com/400x500'}
                      alt={`Portrait de ${selectedCandidate.name}`}
                      className="candidate-avatar-mobile"
                    />
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

                  <div className="bio-card">
                    <h3 className="bio-card__title">
                      <i className="fa-solid fa-book-open"></i> Biographie
                    </h3>
                    <div className="bio-card__content">
                      {selectedCandidate.biography ? (
                        <p>{selectedCandidate.biography}</p>
                      ) : (
                        <p className="bio-card__placeholder">
                          {selectedCandidate.name} est une jeune femme passionnée et déterminée. Elle participe à l&apos;élection Miss Intello 2026 pour mettre en avant l&apos;excellence, le leadership féminin et défendre les causes qui lui tiennent à cœur.
                          <strong>(Biographie détaillée à venir)</strong>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="candidate-detail-actions">
                    <button type="button" className="button button--large" onClick={() => handleVoteClick(selectedCandidate)}>
                      <i className="fa-solid fa-heart"></i> Voter pour {selectedCandidate.name}
                    </button>
                    <button type="button" className="button button--secondary button--large" onClick={() => shareCandidate(selectedCandidate)}>
                      <i className="fa-solid fa-share-nodes"></i> Partager sa page
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="modal-card glass-card">
            <button
              type="button"
              onClick={() => !paymentLoading && setShowPaymentModal(false)}
              className="modal-close"
              disabled={paymentLoading}
            >
              <i className="fa-solid fa-xmark"></i>
            </button>

            <div className="modal-card__body">
              <h3 className="modal-title">Paiement <span>PayGate</span></h3>
              <p className="modal-subtitle">
                Votez pour <span>{currentCandidateRef.current?.name}</span>
              </p>

              <form onSubmit={processPaygatePayment} className="payment-form">
                <div className="form-field">
                  <label htmlFor="vote-count">
                    <i className="fa-solid fa-check-to-slot"></i>
                    Nombre de votes
                  </label>
                  <div className="vote-stepper">
                    <button
                      type="button"
                      onClick={() => setVoteCount((value) => Math.max(1, value - 1))}
                      disabled={paymentLoading || voteCount <= 1}
                      className="step-button"
                    >
                      −
                    </button>
                    <input
                      id="vote-count"
                      type="number"
                      min="1"
                      value={voteCount}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!Number.isNaN(value) && value >= 1) {
                          setVoteCount(value);
                        }
                      }}
                      disabled={paymentLoading}
                      className="vote-input"
                    />
                    <button
                      type="button"
                      onClick={() => setVoteCount((value) => value + 1)}
                      disabled={paymentLoading}
                      className="step-button"
                    >
                      +
                    </button>
                  </div>
                  <div className="vote-chip-grid">
                    {QUICK_VOTES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setVoteCount(value)}
                        disabled={paymentLoading}
                        className={`vote-chip ${voteCount === value ? 'is-active' : ''}`}
                      >
                        {value}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="payment-summary">
                  <span>Total à payer</span>
                  <strong>
                    {(voteCount * PRICE_PER_VOTE).toLocaleString('fr-FR')} <span>FCFA</span>
                  </strong>
                </div>

                <div className="form-field">
                  <label>Réseau Mobile</label>
                  <div className="network-grid">
                    <button
                      type="button"
                      onClick={() => setNetwork('TMONEY')}
                      className={`network-option ${network === 'TMONEY' ? 'is-active' : ''}`}
                      disabled={paymentLoading}
                    >
                      <i className="fa-solid fa-mobile-screen"></i>
                      <span>T-Money</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNetwork('FLOOZ')}
                      className={`network-option ${network === 'FLOOZ' ? 'is-active' : ''}`}
                      disabled={paymentLoading}
                    >
                      <i className="fa-solid fa-sim-card"></i>
                      <span>Flooz</span>
                    </button>
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="phone-number">Numéro de téléphone</label>
                  <div className="phone-field">
                    <span className="country-code">+228</span>
                    <input
                      id="phone-number"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                      className="phone-input"
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
                  className="button button--submit"
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
    </>
  );
}