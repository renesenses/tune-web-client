/**
 * Tests des detecteurs.
 *
 * `analyse()` est pur : c'est la seule partie de l'automate qui se verifie sans
 * navigateur, et c'est aussi celle dont depend la justesse du rapport. Un
 * detecteur trop large noie l'utilisateur, un detecteur trop etroit laisse
 * passer le bug qu'on cherchait.
 *
 *   node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse } from '../src/detect.mjs';

const VIEW = { hash: '#library', nav: 'Bibliotheque', heading: 'Albums' };

function signals(overrides = {}) {
  return { toasts: [], calls: [], errors: [], warnings: [], ...overrides };
}

function state(overrides = {}) {
  return { hash: 1, pageHash: 1, location: '#library', modalOpen: false, length: 500, ...overrides };
}

test('un toast d\'erreur apres un 204 sans corps est signale comme fausse erreur', () => {
  const findings = analyse({
    view: VIEW,
    action: { kind: 'click', label: '4 etoiles', path: 'button.star-btn' },
    before: state(), after: state(),
    signals: signals({
      calls: [{
        at: 100, method: 'POST', url: 'http://x/api/v1/library/albums/52/rate',
        status: 204, ok: true, bodyLength: 0, bodyPreview: '', requestBody: '{"rating":4}',
        contentType: null, durationMs: 12, failed: false,
      }],
      toasts: [{ at: 140, level: 'error', message: 'Erreur notation' }],
    }),
  });

  const finding = findings.find((f) => f.category === 'false-error-empty-body');
  assert.ok(finding, 'le detecteur doit reconnaitre le corps vide parse en JSON');
  assert.equal(finding.severity, 'high');
  assert.match(finding.detail, /JSON\.parse/);
  assert.match(finding.detail, /a pourtant abouti/);
});

test('un toast d\'erreur avec une requete en echec pointe la requete fautive', () => {
  const findings = analyse({
    view: VIEW,
    action: { kind: 'click', label: 'Lire', path: 'button.play' },
    before: state(), after: state(),
    signals: signals({
      calls: [{
        at: 100, method: 'POST', url: 'http://x/api/v1/zones/13/play',
        status: 503, ok: false, bodyLength: 23, bodyPreview: 'Service Unavailable',
        requestBody: null, contentType: 'text/plain', durationMs: 40, failed: false,
      }],
      toasts: [{ at: 150, level: 'error', message: 'Server error: 503' }],
    }),
  });

  assert.ok(findings.some((f) => f.category === 'http-5xx' && f.severity === 'critical'));
  const toastFinding = findings.find((f) => f.category === 'error-toast');
  assert.ok(toastFinding);
  assert.match(toastFinding.detail, /503/);
  // Surtout pas de « fausse erreur » ici : l'erreur affichee est justifiee.
  assert.equal(findings.some((f) => f.category.startsWith('false-error')), false);
});

test('un clic sans aucun effet observable est signale, mais en severite mineure', () => {
  const findings = analyse({
    view: VIEW,
    action: { kind: 'click', label: 'Trier', path: 'button.sort' },
    before: state(), after: state(),
    signals: signals(),
  });

  const inert = findings.find((f) => f.category === 'inert-control');
  assert.ok(inert);
  assert.equal(inert.severity, 'low');
});

test('un clic qui change la page n\'est pas considere comme inerte', () => {
  const findings = analyse({
    view: VIEW,
    action: { kind: 'click', label: 'Replier le menu', path: 'button.collapse' },
    before: state({ pageHash: 1 }),
    // Seule la page entiere change : le repli du menu lateral ne touche pas la vue.
    after: state({ pageHash: 2 }),
    signals: signals(),
  });

  assert.equal(findings.length, 0);
});

test('les images injoignables de la meme origine partagent une empreinte', () => {
  const make = (url) => analyse({
    view: VIEW, action: null, before: state(), after: state(), signals: signals(),
    passive: [{ category: 'broken-image', severity: 'low', detail: url, snippet: '<img>' }],
  })[0];

  const a = make('https://www.radiofrance.fr/s3/2022/09/le-cours.jpg');
  const b = make('https://www.radiofrance.fr/s3/2024/01/vrai-ou-faux.jpg');
  const c = make('https://autre.example/img/pochette.jpg');

  assert.equal(a.fingerprint, b.fingerprint, 'meme origine → une seule issue');
  assert.notEqual(a.fingerprint, c.fingerprint, 'origine differente → issue distincte');
});

test('un controle partage entre deux vues ne produit qu\'une issue', () => {
  const inView = (hash) => analyse({
    view: { hash, nav: hash, heading: '' },
    action: { kind: 'click', label: 'Recherche', path: 'div.global-search-bar > button.search-icon-btn' },
    before: state({ location: hash }), after: state({ location: hash }),
    signals: signals(),
  })[0];

  assert.equal(inView('#library').fingerprint, inView('#home').fingerprint);
});

test('les erreurs console sans valeur de diagnostic sont ignorees', () => {
  const findings = analyse({
    view: VIEW, action: null, before: state(), after: state(),
    signals: signals({
      warnings: [
        { at: 10, level: 'error', message: 'Failed to load resource: favicon.ico' },
        { at: 20, level: 'warn', message: 'quelque chose de mineur' },
        { at: 30, level: 'error', message: 'Rate album error: Invalid JSON response' },
      ],
    }),
  });

  const consoleFindings = findings.filter((f) => f.category === 'console-error');
  assert.equal(consoleFindings.length, 1);
  assert.match(consoleFindings[0].title, /Invalid JSON response/);
});

test('le console.error qui accompagne une erreur deja signalee n\'ouvre pas de seconde issue', () => {
  const findings = analyse({
    view: VIEW,
    action: { kind: 'click', label: '4 etoiles', path: 'button.star-btn' },
    before: state(), after: state(),
    signals: signals({
      calls: [{
        at: 100, method: 'POST', url: 'http://x/api/v1/library/albums/52/rate',
        status: 400, ok: false, bodyLength: 20, bodyPreview: 'rating must be 1-5',
        requestBody: '{"rating":0}', contentType: 'text/plain', durationMs: 8, failed: false,
      }],
      toasts: [{ at: 130, level: 'error', message: 'Erreur notation' }],
      warnings: [{ at: 120, level: 'error', message: 'Rate album error: 400 Bad Request' }],
    }),
  });

  assert.equal(findings.some((f) => f.category === 'console-error'), false);
  assert.ok(findings.some((f) => f.category === 'http-4xx'));
  assert.ok(findings.some((f) => f.category === 'error-toast'));
});

test('le meme message d\'erreur dans deux vues est un seul defaut', () => {
  const inView = (hash) => analyse({
    view: { hash, nav: hash, heading: '' },
    action: { kind: 'click', label: 'Lire', path: 'button.play' },
    before: state({ location: hash }), after: state({ location: hash }),
    signals: signals({
      calls: [{
        at: 10, method: 'GET', url: 'http://x/api/v1/zones', status: 200, ok: true,
        bodyLength: 40, bodyPreview: '[]', requestBody: null, contentType: 'application/json',
        durationMs: 3, failed: false,
      }],
      toasts: [{ at: 50, level: 'error', message: 'Device not yet discovered' }],
    }),
  }).find((f) => f.category.startsWith('false-error'));

  assert.equal(inView('#home').fingerprint, inView('#search').fingerprint);
});

test('un echec de streaming sans compte configure n\'est pas un bug applicatif', () => {
  const findings = analyse({
    view: VIEW, action: null, before: state(), after: state(),
    signals: signals({
      calls: [{
        at: 10, method: 'GET', url: 'http://x/api/v1/streaming/tidal/albums',
        status: 401, ok: false, bodyLength: 12, bodyPreview: 'unauthorized',
        requestBody: null, contentType: null, durationMs: 5, failed: false,
      }],
    }),
  });

  assert.equal(findings.length, 0);
});
