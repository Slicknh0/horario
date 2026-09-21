import type { DomainError } from '@/domain/types'

// The only place a domain/action error code becomes Portuguese copy. No
// component may invent its own wording — it calls messageFor instead.
export type UiError =
  | DomainError
  | 'SLUG_TAKEN'
  | 'SLUG_RESERVED'
  | 'SLUG_INVALID'
  | 'NOT_FOUND'
  | 'SIGNUP_FAILED'
  | 'VALIDATION_ERROR'
  // Not a domain code: this is what a component shows when an action's
  // result carries `serverError` (a thrown/unrecognized failure — a bug, a
  // transient DB/network error) instead of a structured `{ ok: false }`.
  // The underlying error text is never surfaced here; it can carry
  // internals, and this is the ONLY acceptable fallback message for it.
  | 'UNEXPECTED_ERROR'

const MESSAGES: Record<UiError, string> = {
  SLOT_TAKEN: 'Esse horário acabou de ser preenchido. Escolha outro.',
  TOO_SOON: 'Esse horário está muito próximo. Escolha um mais adiante.',
  TOO_FAR: 'Esse horário está longe demais para agendar agora.',
  OUTSIDE_HOURS: 'Esse horário está fora do expediente.',
  PLAN_LIMIT: 'O plano gratuito permite 3 serviços ativos.',
  TOO_LATE_TO_CANCEL:
    'O prazo de cancelamento online já passou. Entre em contato com o estabelecimento.',
  ALREADY_CANCELLED: 'Esse agendamento não está mais ativo.',
  SLUG_TAKEN: 'Esse endereço já está em uso.',
  SLUG_RESERVED: 'Esse endereço é reservado.',
  SLUG_INVALID: 'Use de 3 a 50 letras, números ou hífens.',
  NOT_FOUND: 'Não encontramos o que você procura.',
  SIGNUP_FAILED:
    'Não foi possível criar a conta. Verifique os dados e tente novamente.',
  VALIDATION_ERROR: 'Verifique os campos preenchidos e tente novamente.',
  UNEXPECTED_ERROR: 'Algo deu errado. Tente novamente.',
}

export function messageFor(error: UiError): string {
  return MESSAGES[error]
}
