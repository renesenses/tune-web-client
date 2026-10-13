/**
 * tune-server-rust#4176 — PURE allumé sur une zone où il n'y a RIEN à
 * contourner (Jean Valjean, fil 1798, Windows WASAPI exclusif).
 *
 * Sans égaliseur, convolution, crossfeed ni repli mono armés, le signal est
 * déjà intact : basculer PURE ne change aucun échantillon, et la pastille
 * s'allumait pourtant comme si elle faisait quelque chose (« basculer sur
 * Pure ne fait rien »).
 *
 * Depuis la 1.0.0-rc4 (PR serveur #6022), le chemin du signal le DIT par une
 * étape `DSP` dédiée (`OutputDspState::PureSansObjet`,
 * `tune-server/src/routes/zones/signal_path.rs`). Le serveur ne lui donne pas
 * de `code` : la description, figée côté serveur, est le seul repère publié.
 * Un serveur antérieur ne la publie pas : on n'affirme alors rien.
 */
export const DESCRIPTION_PURE_SANS_OBJET = 'PURE actif : aucun traitement armé, rien à contourner';

type CheminDuSignal = { steps?: { name?: string; description?: string }[] | null } | null | undefined;

/** Le chemin du signal dit-il que PURE n'a rien à contourner ? */
export function pureSansObjet(signalPath: CheminDuSignal): boolean {
  return !!signalPath?.steps?.some(
    (s) => s?.name === 'DSP' && s?.description === DESCRIPTION_PURE_SANS_OBJET,
  );
}
