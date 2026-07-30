/**
 * Transforme les signaux bruts d'une action (toasts, appels reseau, erreurs JS,
 * delta d'etat) en constats exploitables.
 *
 * Chaque detecteur reste une fonction pure : meme entree, meme constat. C'est
 * ce qui rend le rapport reproductible d'un passage a l'autre.
 */

/** Messages console sans valeur de diagnostic — ils noieraient le rapport. */
const CONSOLE_NOISE = [
  /favicon/i,
  /\[vite\]/i,
  /websocket.*(reconnect|closed)/i,
  /Download the Svelte devtools/i,
  /was preloaded using link preload but not used/i,
];

/** Appels dont un echec est attendu hors ligne / sans compte de streaming. */
const EXPECTED_FAILURES = [
  /\/api\/v1\/streaming\/(tidal|qobuz|spotify|deezer|amazon|youtube)\//i,
  /\/api\/v1\/cloud\//i,
  /\/api\/v1\/premium\//i,
];

const API_RE = /\/api\/v1\//;

/**
 * @param {object} ctx  { action, view, before, after, signals, passive }
 * @returns {Array<object>} constats
 */
export function analyse(ctx) {
  const { action, view, before, after, signals } = ctx;
  const findings = [];
  const apiCalls = signals.calls.filter((c) => API_RE.test(c.url));
  const failedCalls = apiCalls.filter((c) => c.failed || (c.status !== null && c.status >= 400));
  const errorToasts = signals.toasts.filter((t) => t.level === 'error');

  // --- 1. Exceptions JS -----------------------------------------------------
  for (const err of signals.errors) {
    findings.push({
      category: err.kind === 'unhandledrejection' ? 'unhandled-rejection' : 'js-exception',
      severity: 'critical',
      title: `${err.kind === 'unhandledrejection' ? 'Promesse rejetee non geree' : 'Exception JS'} : ${err.message}`,
      detail: err.message,
      stack: err.stack,
    });
  }

  // --- 2. Erreurs console ---------------------------------------------------
  // Reportees a la fin : quand la meme action a deja produit une erreur HTTP ou
  // un toast, le `console.error` qui l'accompagne decrit le meme defaut et
  // n'ajoute qu'une troisieme issue a lire.
  const consoleErrors = signals.warnings.filter(
    (w) => w.level === 'error' && !CONSOLE_NOISE.some((re) => re.test(w.message))
  );

  // --- 3. Appels API en echec ----------------------------------------------
  for (const call of failedCalls) {
    if (EXPECTED_FAILURES.some((re) => re.test(call.url))) continue;
    const status = call.failed ? 'echec reseau' : call.status;
    findings.push({
      category: call.failed ? 'network-failure' : `http-${Math.floor(call.status / 100)}xx`,
      severity: call.failed || call.status >= 500 ? 'critical' : 'high',
      title: `${call.method} ${shortUrl(call.url)} → ${status}`,
      detail: `${call.method} ${call.url}\nstatut : ${status}\ncorps requete : ${call.requestBody || '(vide)'}\nreponse : ${call.bodyPreview || '(vide)'}`,
      call,
    });
  }

  // --- 4. Toasts d'erreur ---------------------------------------------------
  // Le cas interessant : un toast d'erreur alors que toutes les requetes ont
  // reussi. L'action a abouti cote serveur mais l'UI annonce un echec — c'est
  // exactement le symptome « ca note quand meme mais ca affiche une erreur ».
  for (const toast of errorToasts) {
    const window_ = apiCalls.filter((c) => c.at <= toast.at && toast.at - c.at < 5000);
    const allOk = window_.length > 0 && window_.every((c) => c.ok);
    if (allOk) {
      // Cause la plus frequente : le serveur repond 204/corps vide et le client
      // fait un JSON.parse dessus.
      const emptyBody = window_.find((c) => c.ok && (c.status === 204 || c.bodyLength === 0));
      findings.push({
        category: emptyBody ? 'false-error-empty-body' : 'false-error-toast',
        severity: 'high',
        title: emptyBody
          ? `Fausse erreur « ${toast.message} » : ${emptyBody.method} ${shortUrl(emptyBody.url)} a renvoye ${emptyBody.status} sans corps`
          : `Fausse erreur « ${toast.message} » : toutes les requetes ont reussi`,
        detail: [
          `Toast affiche : « ${toast.message} »`,
          `Requetes de la fenetre : ${window_.map((c) => `${c.method} ${shortUrl(c.url)} → ${c.status} (${c.bodyLength} octets)`).join(', ')}`,
          emptyBody
            ? `Diagnostic : le client parse la reponse en JSON alors que le corps est vide (JSON.parse('') leve « Invalid JSON response »). L'operation a pourtant abouti cote serveur.`
            : `Diagnostic : l'UI signale un echec alors qu'aucun appel n'a echoue.`,
        ].join('\n'),
        call: emptyBody || window_[0],
      });
    } else {
      const culprit = window_.find((c) => !c.ok);
      findings.push({
        category: 'error-toast',
        severity: 'high',
        title: `Erreur affichee : « ${toast.message} »`,
        detail: [
          `Toast : « ${toast.message} »`,
          culprit ? `Requete fautive : ${culprit.method} ${culprit.url} → ${culprit.status}\n${culprit.bodyPreview || ''}` : 'Aucune requete correlee — erreur purement cote client.',
        ].join('\n'),
        call: culprit,
      });
    }
  }

  // Le `console.error` ne devient une issue que s'il est le seul temoin.
  if (findings.length === 0) {
    for (const warn of consoleErrors) {
      findings.push({
        category: 'console-error',
        severity: 'medium',
        title: `console.error : ${firstLine(warn.message)}`,
        detail: warn.message,
      });
    }
  }

  // --- 5. Controle inerte ---------------------------------------------------
  // Ni requete, ni changement d'ecran, ni retour visuel : de l'exterieur, le
  // bouton ne fait rien. Signale en faible severite, un clic peut legitimement
  // n'avoir aucun effet observable (bascule deja dans l'etat vise).
  if (action && action.kind === 'click') {
    const inert =
      signals.calls.length === 0 &&
      signals.toasts.length === 0 &&
      signals.errors.length === 0 &&
      before && after &&
      before.hash === after.hash &&
      before.pageHash === after.pageHash &&
      before.location === after.location &&
      before.modalOpen === after.modalOpen;
    if (inert) {
      findings.push({
        category: 'inert-control',
        severity: 'low',
        title: `Controle sans effet : « ${action.label || action.path} »`,
        detail: `Le clic sur « ${action.label}  » (${action.path}) n'a produit aucune requete, aucun changement d'ecran et aucun message.`,
      });
    }
  }

  // --- 6. Controle qui refuse le clic --------------------------------------
  if (ctx.unclickable) {
    findings.push({
      category: 'unclickable-control',
      severity: 'medium',
      title: `Controle inaccessible au clic : « ${(action && action.label) || 'sans libelle'} »`,
      detail: [
        `L'element est visible a l'ecran mais le clic n'aboutit pas.`,
        `Cause habituelle : un autre element le recouvre, ou il se deplace en permanence.`,
        ctx.unclickable,
      ].join('\n'),
    });
  }

  // --- 7. Modale impossible a fermer ---------------------------------------
  if (ctx.modalStuck) {
    findings.push({
      category: 'modal-not-dismissable',
      severity: 'high',
      title: `Modale « ${after.modalTitle || 'sans titre'} » impossible a fermer`,
      detail: `Apres Echap et un clic sur le bouton de fermeture, la modale ouverte par « ${action.label} » est toujours affichee. L'utilisateur est bloque.`,
    });
  }

  // --- 8. Constats passifs apparus a cause de l'action ----------------------
  for (const p of ctx.passive || []) {
    findings.push({
      category: p.category,
      severity: p.severity,
      title: passiveTitle(p),
      detail: p.detail,
      snippet: p.snippet,
    });
  }

  return findings.map((f) => ({
    ...f,
    view: view.hash || view.nav || 'inconnue',
    fingerprint: fingerprint(f, view),
  }));
}

function passiveTitle(p) {
  switch (p.category) {
    case 'i18n-key-visible': return `Cle de traduction affichee brute : « ${p.detail} »`;
    case 'broken-image': return `Image(s) injoignable(s) sous ${imageGroup(p.detail)} — ex. ${shortUrl(p.detail)}`;
    case 'horizontal-overflow': return `Debordement horizontal de la page (${p.detail})`;
    case 'empty-view': return `Vue vide : aucun contenu rendu`;
    case 'stuck-loading': return `Chargement bloque : l'indicateur reste affiche`;
    default: return `${p.category} : ${p.detail}`;
  }
}

/**
 * Deux occurrences du meme defaut doivent produire une seule issue. On neutralise
 * donc tout ce qui varie d'un album ou d'un passage a l'autre : identifiants,
 * horodatages, tailles.
 */
function fingerprint(finding, view) {
  // Un composant partage (champ de recherche, bouton de la barre de lecture)
  // se comporte pareil partout : regrouper ses occurrences plutot que d'ouvrir
  // une issue par vue traversee.
  // Un message d'erreur identifie son chemin de code (sa cle de traduction),
  // pas l'ecran ou il apparait : le meme toast dans six vues reste un defaut.
  const SHARED = [
    'inert-control', 'unclickable-control', 'broken-image',
    'error-toast', 'false-error-toast', 'false-error-empty-body',
    'js-exception', 'unhandled-rejection', 'console-error',
  ];
  const scope = SHARED.includes(finding.category) ? '*' : view.hash;

  // Vingt pochettes injoignables sur le meme hote, c'est un defaut, pas vingt.
  const title = finding.category === 'broken-image'
    ? `images injoignables sur ${imageGroup(finding.detail)}`
    : finding.title || '';

  const normalised = `${finding.category}|${scope}|${title
    .replace(/\d+/g, 'N')
    .replace(/« [^»]{0,80} »/g, '« X »')
    .slice(0, 160)}`;
  let hash = 0;
  for (let i = 0; i < normalised.length; i++) hash = ((hash << 5) - hash + normalised.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Regroupe les images cassees par origine et premier segment de chemin. */
function imageGroup(url) {
  try {
    const parsed = new URL(url, 'http://local');
    const first = parsed.pathname.split('/').filter(Boolean)[0] || '/';
    return `${parsed.host || 'meme origine'}/${first}`;
  } catch {
    return 'origine inconnue';
  }
}

function shortUrl(url) {
  try { return new URL(url, 'http://x').pathname + (new URL(url, 'http://x').search || ''); }
  catch { return String(url).slice(0, 120); }
}

function firstLine(text) {
  return String(text).split('\n')[0].slice(0, 120);
}
