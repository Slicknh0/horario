import type { AppointmentStatus } from '@/domain/types'

// The interface layer's own copy for each appointment status — the domain
// layer (src/domain/agenda.ts) never carries language, the same rule
// messageFor already enforces for error codes in this same directory. Used
// by every agenda block's aria-label and by the sheet's status badge, so
// the two can never drift into two different words for the same status.
// Not routed through messageFor itself: that function is specifically for
// error codes (see errors.ts), and a status is not an error.
export const AGENDA_STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não veio',
}

// Tailwind classes for each status's block on the agenda grid — identical
// in agenda-day.tsx and agenda-week.tsx before this was extracted, so a
// future status-colour change had to land in both or silently drift.
// Neutral for every status except no_show: that one carries a real
// commercial signal (a customer who didn't show up) and is the only status
// that borrows the danger token pair for its block, alongside the
// destructive "Cancelar" button in appointment-sheet.tsx.
export const AGENDA_STATUS_BLOCK_STYLE: Record<AppointmentStatus, string> = {
  confirmed: 'border-border bg-surface-raised text-fg',
  completed: 'border-border bg-surface-raised text-fg-muted',
  cancelled:
    'border-border border-dashed bg-surface text-fg-muted opacity-70 line-through',
  no_show: 'border-danger bg-surface-raised text-fg',
}
