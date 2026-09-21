// Google Calendar's "render" endpoint takes absolute instants (a trailing
// Z), not a wall-clock time in a particular zone — so this is one of the
// few places in the app that deliberately formats a date in UTC. Google
// converts to whatever zone the viewer's own calendar is set to, which is
// the correct behavior: the customer sees the event at their own local
// time, same as any other entry on their calendar.
function toGoogleCalendarDate(instant: Date): string {
  return instant.toISOString().replace(/[-:]|\.\d{3}/g, '')
}

export function buildGoogleCalendarUrl(input: {
  title: string
  startsAt: Date
  endsAt: Date
  details: string
}): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${toGoogleCalendarDate(input.startsAt)}/${toGoogleCalendarDate(input.endsAt)}`,
    details: input.details,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
