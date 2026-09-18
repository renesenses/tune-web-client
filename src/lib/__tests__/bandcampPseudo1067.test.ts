/**
 * #1067 — « Activation Bandcamp impossible » (Patatorz, fil 1615).
 *
 * Le contrat serveur, `plugins/tune-bandcamp/src/service.rs` :
 *
 * ```rust
 * let Some(pseudo) = credentials.get("username").and_then(|v| v.as_str()) else {
 *     return Ok(self.auth_status().await);   // aucun appel sortant
 * };
 * ```
 *
 * Un corps VIDE n'est donc pas une tentative de connexion, c'est un sondage :
 * le serveur rendait l'état courant — non authentifié, sans
 * `verification_url` — et l'écran concluait « le service n'a pas renvoyé de
 * lien ». Le formulaire ne demandait simplement jamais le pseudo.
 */
import { describe, it, expect } from 'vitest';
import {
  formeDesIdentifiants,
  corpsDAuthentification,
  identifiantsComplets,
} from '../identifiantsService';

describe('#1067 — Bandcamp demande un pseudo, et rien d\'autre', () => {
  it('trois formes, et Bandcamp n\'est ni Qobuz ni un code d\'appareil', () => {
    expect(formeDesIdentifiants('bandcamp')).toBe('pseudo');
    // Contre-épreuve : c'est bien une TROISIÈME forme.
    expect(formeDesIdentifiants('qobuz')).toBe('pseudo_motdepasse');
    expect(formeDesIdentifiants('tidal')).toBe('aucune');
    expect(formeDesIdentifiants('deezer')).toBe('aucune');
    expect(formeDesIdentifiants('Bandcamp')).toBe('pseudo');
  });

  it('🔴 le corps porte `username` — c\'est tout le défaut', () => {
    const corps = corpsDAuthentification('bandcamp', { user: 'patatorz', pass: '' });
    expect(corps).toEqual({ username: 'patatorz' });
    // Et surtout PAS de `password`, même vide : le greffon n'en veut pas, et
    // l'écran ne doit pas laisser croire qu'il en existe un.
    expect(corps && 'password' in corps).toBe(false);
  });

  it('avant le correctif, le corps était `undefined` — le sondage du serveur', () => {
    // Ce que l'ancien `usesPassword(name) ? … : undefined` produisait :
    expect(corpsDAuthentification('tidal', { user: 'x', pass: 'y' })).toBeUndefined();
    // …et ce n'est plus le cas pour Bandcamp.
    expect(corpsDAuthentification('bandcamp', { user: 'x' })).not.toBeUndefined();
  });

  it('Qobuz garde son couple identifiant / mot de passe', () => {
    expect(corpsDAuthentification('qobuz', { user: 'a', pass: 'b' }))
      .toEqual({ username: 'a', password: 'b' });
  });

  it('le pseudo est élagué, et un pseudo vide ne part pas', () => {
    expect(corpsDAuthentification('bandcamp', { user: '  patatorz  ' }))
      .toEqual({ username: 'patatorz' });
    expect(identifiantsComplets('bandcamp', { user: '   ' })).toBe(false);
    expect(identifiantsComplets('bandcamp', { user: 'patatorz' })).toBe(true);
    expect(identifiantsComplets('bandcamp', undefined)).toBe(false);
  });

  it('le bouton reste armé pour un flot par code, qui ne saisit rien', () => {
    expect(identifiantsComplets('tidal', undefined)).toBe(true);
    // Qobuz exige les deux.
    expect(identifiantsComplets('qobuz', { user: 'a', pass: '' })).toBe(false);
    expect(identifiantsComplets('qobuz', { user: 'a', pass: 'b' })).toBe(true);
  });
});

describe('#1067 — l\'écran Réglages ▸ Services demande bien le pseudo', () => {
  it('SettingsV2 porte la branche « pseudo seul » et poste le bon corps', async () => {
    const fs = await import('node:fs');
    const vue = fs.readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    expect(vue).toContain("formeSvc(name) === 'pseudo'");
    expect(vue).toContain('settings.usernameOnlyPlaceholder');
    expect(vue).toContain('corpsDAuthentification(name, c)');
    // 🔴 l'ancien corps, celui qui n'envoyait rien pour Bandcamp, a disparu.
    expect(vue).not.toContain("usesPassword(name) ? { username:");
    // Le champ « pseudo seul » ne porte AUCUN mot de passe.
    const i = vue.indexOf("formeSvc(name) === 'pseudo'");
    const j = vue.indexOf('usesPassword(name) && cred[name]', i);
    expect(j).toBeGreaterThan(i);
    expect(vue.slice(i, j)).not.toContain("type=\"password\"");
  });

  it('le message d\'échec nomme le pseudo au lieu du « lien manquant »', async () => {
    const fs = await import('node:fs');
    const vue = fs.readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
    expect(vue).toContain('settings.errUsernameRejected');
    const fr = fs.readFileSync('src/lib/locales/fr.ts', 'utf8');
    for (const cle of ['settings.errUsernameRejected', 'settings.usernameOnlyPlaceholder', 'settings.usernameOnlyHint']) {
      expect(fr).toContain(cle);
    }
  });
});
