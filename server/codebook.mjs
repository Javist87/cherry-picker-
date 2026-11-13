// Kodeverk etter docs/backend-contract.md. Stabile koder i API, visningstekst i klient (B-07, forslag).
// Avdelinger og team er fiktive eksempler. Faktisk organisering er ikke bekreftet (B-02, fase 1).
export const CODEBOOK = Object.freeze({
  status: ['new', 'dialog', 'on_hold', 'handover', 'closed'],
  bpa: ['unclear', 'application', 'awaiting_decision', 'decision_made', 'provider_change'],
  source: ['website', 'email', 'phone', 'fair', 'referral'],
  relationshipRole: ['self', 'next_of_kin', 'guardian', 'municipal_caseworker', 'other'],
  departments: [
    { code: 'trondelag', label: 'Trøndelag', teams: [{ code: 'trondelag-1', label: 'Trøndelag team 1' }, { code: 'trondelag-2', label: 'Trøndelag team 2' }] },
    { code: 'vestland', label: 'Vestland', teams: [{ code: 'vestland-1', label: 'Vestland team 1' }] },
  ],
});

export const CASE_ROLES = ['selger', 'teamleder', 'avdelingsleder'];
export const departmentOf = code => CODEBOOK.departments.find(d => d.code === code);
export const teamBelongs = (department, team) => !!departmentOf(department)?.teams.some(t => t.code === team);
