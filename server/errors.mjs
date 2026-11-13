// API-feil etter docs/backend-contract.md kapittel 4 (application/problem+json, RFC 9457).
const TITLES = {
  malformed_request: 'Forespørselen kunne ikke leses',
  idempotency_key_required: 'Idempotency-Key mangler eller er ugyldig',
  unauthenticated: 'Ingen gyldig sesjon',
  forbidden_operation: 'Rollen har ikke denne operasjonen',
  forbidden_scope: 'Operasjonen er utenfor ditt omfang',
  forbidden_origin: 'Forespørselen kommer fra en annen opprinnelse',
  not_found: 'Finnes ikke',
  method_not_allowed: 'Metoden støttes ikke',
  possible_duplicate: 'Mulig dublett',
  handoff_pending: 'Saken har allerede en ventende overlevering',
  handoff_not_pending: 'Overleveringen venter ikke på bekreftelse',
  case_closed: 'Saken er avsluttet',
  agreement_required: 'Registrer avtale før oppstartsoverlevering',
  action_already_completed: 'Handlingen er allerede fullført',
  precondition_failed: 'Saken er endret siden du leste den',
  payload_too_large: 'Forespørselen er for stor',
  unsupported_media_type: 'Innholdstypen må være application/json',
  validation_failed: 'Valideringen feilet',
  idempotency_key_reused: 'Nøkkelen er brukt med annet innhold',
  precondition_required: 'If-Match mangler',
  rate_limited: 'For mange forespørsler',
  internal_error: 'Uventet feil',
};

export class ApiError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra; // felter som legges i svaret (errors, matches …)
    this.headers = {};
    this.denial = null; // settes når avslaget skal i revisjonsloggen
  }
  withHeaders(headers) { Object.assign(this.headers, headers); return this; }
  withDenial(denial) { this.denial = denial; return this; }
}

export const validationError = errors => new ApiError(422, 'validation_failed', { errors });

export function problemBody(error, requestId) {
  return {
    type: 'https://medvind.example/problems/' + error.code,
    title: TITLES[error.code] || error.code,
    status: error.status,
    code: error.code,
    requestId,
    ...error.extra,
  };
}
