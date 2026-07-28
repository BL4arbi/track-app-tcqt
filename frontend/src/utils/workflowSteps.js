// Fixed chronology for on-site machining jobs — replaces free-text
// current_step/next_step with a real, ordered pipeline.
export const WORKFLOW_STEPS = [
  'Dessin',
  'Implémentation',
  'Commande des pièces',
  'Avant départ chantier',
  'Réalisation chantier',
  'Chantier terminé',
];

export function nextWorkflowStep(current) {
  const i = WORKFLOW_STEPS.indexOf(current);
  if (i === -1 || i === WORKFLOW_STEPS.length - 1) return null;
  return WORKFLOW_STEPS[i + 1];
}
