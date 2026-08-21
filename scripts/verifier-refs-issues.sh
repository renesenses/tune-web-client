#!/usr/bin/env bash
# Rend visible, et actionnable, ce qu'une PR declare corriger.
#
# ⚠️ LE PIEGE PROPRE A CE DEPOT : LES ISSUES VIVENT AILLEURS.
#
# Les signalements des testeurs sont ouverts dans `renesenses/tune-server-rust`,
# y compris ceux dont le correctif est ENTIEREMENT dans le client web. Or GitHub
# resout un `#N` nu dans le depot DE LA PR. Ecrire « Closes #2036 » ici ne
# designe donc pas l'issue #2036 du serveur : ca designe l'issue #2036 de
# `tune-web-client`, qui n'existe pas — ou pire, qui existe et parle d'autre
# chose.
#
# Vecu le 20/08/2026 : la PR #527 portait QUATRE `Closes` — #2036, #2037, #2040,
# #2041, toutes dans `tune-server-rust`. Fusionnee : aucune fermee, aucun lien
# cree. Les quatre ont du etre fermees a la main.
#
# La forme complete cree, elle, un lien visible dans les deux fils :
#
#     Closes renesenses/tune-server-rust#2036
#
# ⚠️ Elle ne FERME pas pour autant : les mots-cles de GitHub ne ferment que des
# issues du MEME depot. Le lien aide qui relira l'issue ; la fermeture reste
# manuelle. C'est pour ca que ce script rend la commande prete a coller.
#
# ⚠️ ET LE CLIENT WEB EST EMBARQUE DANS LA RELEASE DU SERVEUR. Une PR fusionnee
# ici APRES un tag serveur ne sort qu'au tag SUIVANT. Mesure du 20/08/2026 :
#
#     bundle web de la v0.9.92 construit .... 14:42:53 UTC
#     PR #527 fusionnee ..................... 16:44:57 UTC
#
# Deux heures d'ecart : les quatre correctifs testeurs annonces « corriges »
# n'etaient PAS dans la 0.9.92. Un testeur qui met a jour et ne voit rien
# changer a raison, et signale une regression qui n'en est pas une.
#
# Ce script n'echoue jamais. Un controle qui bloque sur une regle inoperante se
# fait desactiver dans la semaine.
#
# Usage :
#   verifier-refs-issues.sh            lit le corps sur STDIN
#   verifier-refs-issues.sh --autotest joue les cas de preuve et sort
set -uo pipefail

# Les seules formes que GitHub reconnait. Toute autre orthographe ne ferme rien.
#
# ⚠️ Ecrire `fix(|es|ed)` ici semble naturel et casse tout : `grep -E` refuse
# l'alternative VIDE (« empty (sub)expression »), la recherche des fermetures
# rend une liste vide, et toute issue pourtant fermee par la PR est annoncee
# « restera ouverte ». Le script sort 0 malgre tout — le defaut est donc muet
# pour qui ne regarde que le code de sortie. D'ou les cas de preuve qui lisent
# la SORTIE, plus bas.
readonly MOTS_ANGLAIS='close[sd]?|fix(es|ed)?|resolve[sd]?'
# Les formes francaises qu'on ecrit spontanement, et qui ne ferment rien.
#
# Volontairement etroite. « traite » et « regle » ont ete essayes puis retires :
# ce sont des verbes de TITRE (« ## Ce que ca regle »), et un titre suivi d'une
# ligne commencant par « #1742 » les declenchait a tort. Un garde-fou qui refuse
# une PR conforme se fait desactiver dans la semaine ; on prefere en laisser
# passer que bloquer a tort.
readonly MOTS_FRANCAIS='ferm(e|ee|ent)|corrig(e|ee|ent)|r(e|é)sou(t|d|dre)|cl(o|ô)t'
# Le depot ou vivent les signalements des testeurs.
readonly DEPOT_ISSUES='renesenses/tune-server-rust'

# Analyse un corps de PR. Ecrit son rapport sur STDOUT. Sortie toujours 0.
analyser() {
  local corps="$1" resume="${2:-/dev/null}"

  # Une reference citee n'engage a rien : on retire les blocs ```, les lignes
  # commencant par « > », et le code EN LIGNE entre accents graves. Sans ca,
  # coller un extrait de journal contenant « Fixes #123 » suffirait a faire
  # passer — ou echouer — une PR sur du texte cite.
  #
  # ⚠️ Ce script s'est declenche DEUX FOIS sur sa propre PR, qui explique la
  # regle et doit donc citer les formes fautives :
  #   1. accents graves oublies — la citation en code en ligne comptait ;
  #   2. GUILLEMETS FRANCAIS oublies — en francais on cite entre « … », et le
  #      corps corrige de la PR #2010 disait « Ferme #1819 » sans accents
  #      graves. Le script proposait de fermer #1819 et #1744, que cette PR ne
  #      corrige pas : une commande destructrice prete a coller, sur les
  #      mauvaises issues.
  # C'est le defaut le plus vicieux d'un controle : il frappe precisement ceux
  # qui l'expliquent. Quatrieme occurrence de cette famille dans le depot cette
  # semaine — le garde-fou apt decoupait deja sur un libelle present dans son
  # propre commentaire.
  local propre
  propre=$(printf '%s\n' "$corps" | awk '
    /^[[:space:]]*```/ { dans = !dans; next }
    dans { next }
    /^[[:space:]]*>/   { next }
    { gsub(/`[^`]*`/, " "); gsub(/«[^»]*»/, " "); print }
  ')

  # Trois populations, et c'est toute la difficulte de ce depot :
  #   - `owner/repo#N`  forme complete, correcte : elle cree un lien visible ;
  #   - `#N` declare     forme nue avec mot-cle : elle designe le MAUVAIS depot ;
  #   - `#N` cite        simple renvoi, legitime.
  #
  # On retire d'abord les formes completes du texte, sinon leur `#N` serait
  # recompte comme une reference nue et le rapport se contredirait.
  local completes
  completes=$(printf '%s\n' "$propre" \
    | grep -oiE "(${MOTS_ANGLAIS}|${MOTS_FRANCAIS}) +[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#[0-9]+" \
    | grep -oE '[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#[0-9]+' | sort -u)

  local sans_completes
  # ⚠️ Delimiteur `%` et non `#` : le motif CONTIENT des `#`, et sed rend alors
  # « bad flag in substitute command » — l'etape echoue en silence sous
  # `set -uo pipefail`, la liste part vide, et le rapport annonce « aucune
  # reference » sur une PR qui en porte quatre.
  sans_completes=$(printf '%s\n' "$propre" | sed -E 's%[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#[0-9]+% %g')

  local nues_declarees
  nues_declarees=$(printf '%s\n' "$sans_completes" \
    | grep -oiE "(^|[^[:alnum:]_/])(${MOTS_ANGLAIS}|${MOTS_FRANCAIS}) +#[0-9]+" \
    | grep -oE '#[0-9]+' | sort -u)

  local toutes_nues
  toutes_nues=$(printf '%s\n' "$sans_completes" | grep -oE '#[0-9]{2,5}' | sort -u)

  local citees
  citees=$(comm -23 <(printf '%s\n' "$toutes_nues" | grep . || true) \
                    <(printf '%s\n' "$nues_declarees" | grep . || true))

  {
    if [ -n "$nues_declarees" ]; then
      echo "### ⚠️ Déclarations qui désignent le mauvais dépôt"
      printf '%s\n' "$nues_declarees" | sed 's/^/- /'
      echo
      echo "GitHub résout un \`#N\` nu dans le dépôt **de la PR**. Les signalements"
      echo "des testeurs vivent dans \`$DEPOT_ISSUES\` — ces lignes ne désignent donc"
      echo "rien ici, ou pire, une autre issue portant le même numéro."
      echo
      echo "Vécu le 20/08/2026 : la PR #527 portait quatre \`Closes\` (#2036, #2037,"
      echo "#2040, #2041). Fusionnée : **aucune fermée, aucun lien créé**."
      echo
      echo "Forme à écrire pour créer le lien :"
      echo
      echo '```'
      printf '%s\n' "$nues_declarees" | tr -d '#' | while read -r i; do
        [ -n "$i" ] && echo "Closes $DEPOT_ISSUES#$i"
      done
      echo '```'
      echo
    fi

    if [ -n "$completes" ]; then
      echo "### Déclarées corrigées, forme complète"
      printf '%s\n' "$completes" | sed 's/^/- /'
      echo
    fi

    if [ -n "$nues_declarees" ] || [ -n "$completes" ]; then
      echo "⚠️ **Aucune ne se fermera toute seule.** Les mots-clés de GitHub ne"
      echo "ferment que des issues du **même dépôt** ; la forme complète crée un"
      echo "lien, pas une fermeture."
      echo
      echo "À coller après la fusion :"
      echo
      echo '```bash'
      { printf '%s\n' "$completes" | sed -E 's%^([^#]+)#([0-9]+)$%gh issue close \2 -R \1%'
        printf '%s\n' "$nues_declarees" | tr -d '#' | while read -r i; do
          [ -n "$i" ] && echo "gh issue close $i -R $DEPOT_ISSUES"
        done
      } | grep -E '^gh ' | sort -u
      echo '```'
      echo
      echo "Puis **vérifier**, ne pas supposer : \`gh issue view <n> -R $DEPOT_ISSUES --json state\`."
      echo
      echo "⚠️ **Et ne pas annoncer de version.** Le client web est embarqué dans la"
      echo "release du serveur : fusionnée après un tag, cette PR ne sort qu'au tag"
      echo "**suivant**. Le 20/08, quatre correctifs testeurs ont raté la v0.9.92 de"
      echo "deux heures."
      echo
    fi

    if [ -n "$citees" ]; then
      echo "### Simplement citées"
      printf '%s\n' "$citees" | sed 's/^/- /'
      echo
      echo "Aucune action : « suite de #N », « cause racine de #N » sont légitimes."
      echo
    fi

    if [ -z "$nues_declarees" ] && [ -z "$completes" ] && [ -z "$citees" ]; then
      echo "Aucune référence d'issue dans cette PR."
    fi
  } | tee -a "$resume"
  return 0
}

# ---------------------------------------------------------------------------
# Cas de preuve. Un garde-fou sans contre-epreuve ne prouve rien : deux fois
# cette semaine, un garde-fou de ce depot repondait vert sur le defaut qu'il
# etait cense attraper. Chaque cas porte donc son inverse.
# ---------------------------------------------------------------------------
autotest() {
  local echecs=0
  attendu() {
    local libelle="$1" code_attendu="$2" corps="$3"
    analyser "$corps" >/dev/null 2>&1
    local code=$?
    if [ "$code" -eq "$code_attendu" ]; then
      printf '  ok    %s\n' "$libelle"
    else
      printf '  ECHEC %s (attendu %s, obtenu %s)\n' "$libelle" "$code_attendu" "$code"
      echecs=$((echecs + 1))
    fi
  }

  attendu "ne bloque jamais — forme nue"      0 'Closes #2036'
  attendu "ne bloque jamais — forme complete" 0 'Closes renesenses/tune-server-rust#2036'
  attendu "corps vide"                        0 ''

  # Tout se joue sur le CLASSEMENT, pas sur le code de sortie (toujours 0).
  classe() {
    local libelle="$1" corps="$2" section="$3" motif="$4"
    local sortie
    sortie=$(analyser "$corps" 2>/dev/null)
    if printf '%s\n' "$sortie" | sed -n "/$section/,\$p" | grep -qx -- "- $motif"; then
      printf '  ok    %s\n' "$libelle"
    else
      printf '  ECHEC %s — %s absent de « %s »\n' "$libelle" "$motif" "$section"
      echecs=$((echecs + 1))
    fi
  }
  contient() {
    local libelle="$1" corps="$2" motif="$3"
    if analyser "$corps" 2>/dev/null | grep -qF -- "$motif"; then
      printf '  ok    %s\n' "$libelle"
    else
      printf '  ECHEC %s — « %s » absent\n' "$libelle" "$motif"
      echecs=$((echecs + 1))
    fi
  }
  absent_de() {
    local libelle="$1" corps="$2" motif="$3"
    if analyser "$corps" 2>/dev/null | grep -q -- "$motif"; then
      printf '  ECHEC %s — « %s » ne devrait pas apparaitre\n' "$libelle" "$motif"
      echecs=$((echecs + 1))
    else
      printf '  ok    %s\n' "$libelle"
    fi
  }

  # Le coeur du sujet : forme nue = mauvais depot, forme complete = correcte.
  classe "forme nue -> mauvais depot"  'Closes #2036' 'mauvais dépôt' '#2036'
  classe "francais nu -> mauvais depot" 'Ferme #2036'  'mauvais dépôt' '#2036'
  classe "forme complete -> correcte"  'Closes renesenses/tune-server-rust#2036' \
         'forme complète' 'renesenses/tune-server-rust#2036'
  # ⚠️ Le piege du comptage double : la forme complete CONTIENT « #2036 ». Sans
  # le retrait prealable des formes completes, ce numero retombe dans les
  # references nues et donc dans « Simplement citées » — le rapport annonce
  # alors la meme issue comme correctement declaree ET comme simple renvoi.
  #
  # Ce cas a d'abord ete ecrit contre la section « mauvais dépôt » : il etait
  # AVEUGLE, car l'adjacence du mot-cle empeche deja ce classement-la. Sa
  # contre-epreuve l'a montre — retrait du filtre, zero cas au rouge. Viser
  # « Simplement citées » est le seul test qui mord.
  absent_de "forme complete non recomptee en citation" \
         'Closes renesenses/tune-server-rust#2036' 'Simplement citées'
  # Et une reference nue SANS mot-cle reste une simple citation.
  classe "reference nue citee"  'Suite de #1900.' 'Simplement citées' '#1900'

  # Les commandes doivent viser le BON depot, avec -R.
  contient "commande -R sur forme nue"      'Closes #2036' 'gh issue close 2036 -R renesenses/tune-server-rust'
  contient "commande -R sur forme complete" 'Closes renesenses/tune-server-rust#2036' \
           'gh issue close 2036 -R renesenses/tune-server-rust'
  # L'avertissement de version — le defaut qui a fait rater la v0.9.92.
  contient "avertit sur le tag suivant" 'Closes #2036' "ne sort qu'au tag"
  contient "avertit que rien ne se ferme seul" 'Closes #2036' "ne se fermera toute seule"

  # Le texte cite ne declenche rien : quatre formes, chacune verifiee.
  absent_de "bloc de code ignore"      '```\nCloses #2036\n```'          '- #2036'
  absent_de "citation ignoree"         '> Closes #2036'                    '- #2036'
  absent_de "accents graves ignores"   'On ecrit `Closes #2036`.'          '- #2036'
  absent_de "guillemets ignores"       'On ecrit « Closes #2036 ».'        '- #2036'
  # Leur inverse, sans quoi le filtre pourrait tout avaler.
  classe "hors citation, toujours attrape" 'Voir `le guide`. Closes #2036' 'mauvais dépôt' '#2036'

  echo
  if [ "$echecs" -eq 0 ]; then
    echo "autotest : tous les cas passent"
    return 0
  fi
  echo "autotest : $echecs cas en echec"
  return 1
}

if [ "${1:-}" = "--autotest" ]; then
  autotest
  exit $?
fi

analyser "$(cat)" "${GITHUB_STEP_SUMMARY:-/dev/null}"
