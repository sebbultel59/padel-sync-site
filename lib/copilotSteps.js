// lib/copilotSteps.js
// Configuration des étapes du tutoriel

export const copilotSteps = [
  {
    name: "step1_groupes",
    text: {
      title: "👥 Bienvenue sur Padel Sync !",
      body: "Commence par explorer l'onglet Groupes. C'est ici que tu peux créer ou rejoindre un groupe de joueurs.",
    },
    order: 1,
    target: "copilot-groupes-tab",
    wrapper: null,
  },
  {
    name: "step2_rejoindre",
    text: {
      title: "➕ Rejoindre un groupe",
      body: "Clique sur ce bouton pour rejoindre un groupe existant avec un code d'invitation.",
    },
    order: 2,
    target: "copilot-join-group-btn",
    wrapper: null,
  },
  {
    name: "step3_dispos",
    text: {
      title: "📅 Indiquer tes disponibilités",
      body: "Dans l'onglet Dispos, indique tes créneaux disponibles pour la semaine. Les autres joueurs pourront te proposer des matchs !",
    },
    order: 3,
    target: "copilot-dispos-tab",
    wrapper: null,
  },
  {
    name: "step4_matchs",
    text: {
      title: "🎾 Trouver des matchs",
      body: "L'onglet Matchs te montre tous les matchs possibles selon tes disponibilités et celles des autres joueurs.",
    },
    order: 4,
    target: "copilot-matchs-tab",
    wrapper: null,
  },
  {
    name: "step5_match_feu",
    text: {
      title: "🔥 Matchs en feu",
      body: "Cette icône te montre les matchs où il ne manque plus qu'un joueur ! Parfait pour compléter rapidement un match.",
    },
    order: 5,
    target: "copilot-hot-match-icon",
    wrapper: null,
  },
  {
    name: "step6_notifications",
    text: {
      title: "🔔 Notifications",
      body: "Tu recevras ici toutes les notifications importantes : invitations, confirmations de matchs, etc.",
    },
    order: 6,
    target: "copilot-notifications-icon",
    wrapper: null,
  },
];

