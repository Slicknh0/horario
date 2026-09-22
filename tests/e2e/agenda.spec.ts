import { expect, type Page, test } from '@playwright/test'
// Playwright runs specs in worker processes that do not inherit process.env
// mutations made while playwright.config.ts loaded (each worker starts from
// its own env snapshot) — re-importing this module re-runs its .env load
// in *this* process too, which is what makes DEMO_EMAIL/DEMO_PASSWORD below
// actually resolve instead of filling the login form with "undefined".
import './env'

// Same helper as booking.spec.ts, restricted to the first 6 offered days
// (indices 1-6, i.e. tomorrow through +6) rather than the whole strip —
// the agenda's week view (src/app/app/page.tsx, WEEK_VIEW_DAYS = 7) shows
// exactly today..+6, so keeping the booking inside that window means the
// default week view is guaranteed to include it without paging forward,
// on any day of the week the suite happens to run. Scoped to the date
// strip's own <fieldset> (role "group") for the same reason
// booking.spec.ts is — every ServiceCard link also has a digit in its
// accessible name (price, duration), so an unscoped `getByRole('link', {
// name: /\d/ })` can match a service link instead.
async function pickAnOpenDayWithinTheWeek(page: Page): Promise<void> {
  const dateStrip = page.getByRole('group', { name: 'Escolha o dia' })
  await expect(dateStrip).toBeVisible()
  const dateLinks = dateStrip.getByRole('link')
  const count = await dateLinks.count()
  const last = Math.min(count, 7)
  for (let i = 1; i < last; i++) {
    const link = dateLinks.nth(i)
    const text = (await link.textContent()) ?? ''
    if (!text.toLowerCase().includes('cheio')) {
      await link.click()
      return
    }
  }
  throw new Error('no open day within the next week found in the date strip')
}

test('the owner sees a booking on the agenda and marks a no-show', async ({
  page,
}) => {
  // This spec books its own appointment rather than relying on
  // booking.spec.ts having already run first — Playwright does not
  // guarantee an order between spec files, so each spec has to be
  // self-sufficient against the seeded database.
  const customerName = `Agenda E2E ${Date.now()}`

  await page.goto('/b/barbearia-do-ze')
  await page
    .getByRole('link', { name: /^Corte\b/ })
    .first()
    .click()
  await pickAnOpenDayWithinTheWeek(page)
  await page.getByRole('radio').first().click()
  await page.getByLabel('Nome completo').fill(customerName)
  await page.getByLabel('E-mail').fill('agenda.e2e@example.com')
  await page.getByLabel('Telefone (WhatsApp)').fill('11988887777')
  await page.getByRole('button', { name: /confirmar agendamento/i }).click()
  // Scoped to the heading, not a plain getByText: bookAppointment redirects
  // to /b/[slug]/confirmado on success (src/actions/book-appointment.ts),
  // and Next's own route announcer (#__next-route-announcer__) echoes the
  // new page's h1 text into a second, visible-to-Playwright element after
  // every client-side navigation — an unscoped text match resolves to both
  // and fails in strict mode.
  await expect(
    page.getByRole('heading', { name: /agendamento confirmado/i }),
  ).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(process.env.DEMO_EMAIL as string)
  await page.getByLabel('Senha').fill(process.env.DEMO_PASSWORD as string)
  await page.getByRole('button', { name: /^entrar$/i }).click()
  await expect(page).toHaveURL(/\/app/)

  // The day view (the default) only shows "today" — switch to the week
  // view so whichever of the next 6 days the booking landed on is
  // visible without navigating the day picker.
  await page.getByRole('link', { name: 'Semana' }).click()

  // Appointment blocks are accessible buttons whose aria-label is
  // "<name>, <time>, <service>, <status>" (agenda-day.tsx / agenda-week.tsx)
  // — select by that name rather than CSS position on the grid.
  const appointmentButton = page.getByRole('button', { name: customerName })
  await expect(appointmentButton).toBeVisible()
  await appointmentButton.click()

  await page.getByRole('button', { name: /não veio/i }).click()

  // The sheet closes itself on a successful status change and the page
  // revalidates — confirm both: the dialog is gone, and the block's own
  // aria-label now reports the new status.
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(
    page.getByRole('button', { name: new RegExp(`${customerName}.*Não veio`) }),
  ).toBeVisible()
})
