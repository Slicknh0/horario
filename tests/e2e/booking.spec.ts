import { expect, type Page, test } from '@playwright/test'

// Picks the first day in the strip (src/components/booking/date-strip.tsx)
// that isn't marked "cheio" (fully booked / closed) — skipping index 0,
// "Hoje", so the booking lands on a future day the way a real customer
// browsing ahead would. DateStrip renders every day as a Link (role
// "link"), never hiding a full day, so this has to check each one's text
// rather than assume a fixed index: which weekday is closed (Sunday, in
// the seeded hours) and which days already have bookings depends on
// whatever "today" is when the suite runs, and the suite must not depend
// on the wall clock.
//
// Scoped to the date strip's own <fieldset> (role "group", named by its
// legend "Escolha o dia") rather than a page-wide `getByRole('link', {
// name: /\d/ })` — every ServiceCard link also has a digit in its
// accessible name (the price, the duration in minutes), so an unscoped
// locator matches those too and, evaluated before the service pick's
// client-side navigation has settled, can resolve to a service link
// instead of a date link.
async function pickAnOpenFutureDay(page: Page): Promise<void> {
  const dateStrip = page.getByRole('group', { name: 'Escolha o dia' })
  await expect(dateStrip).toBeVisible()
  const dateLinks = dateStrip.getByRole('link')
  const count = await dateLinks.count()
  for (let i = 1; i < count; i++) {
    const link = dateLinks.nth(i)
    const text = (await link.textContent()) ?? ''
    if (!text.toLowerCase().includes('cheio')) {
      await link.click()
      return
    }
  }
  throw new Error('no open future day found in the date strip')
}

test('a customer books and receives a working management link', async ({
  page,
}) => {
  await page.goto('/b/barbearia-do-ze')

  // Services are rendered as accessible links (ServiceCard), not buttons —
  // select by role and accessible name, not CSS, so a styling change can't
  // break this. "Corte" also matches "Corte + Barba"; .first() picks the
  // plain "Corte" service, which is first in the seeded sort order.
  await page
    .getByRole('link', { name: /^Corte\b/ })
    .first()
    .click()

  await pickAnOpenFutureDay(page)

  // Slots are a Radix radiogroup (role "radio" per item) — the one part
  // of the brief's selector sketch that already matched the real DOM.
  await page.getByRole('radio').first().click()

  // Labels: getByLabel does a case-insensitive substring match, so
  // "E-mail" matches the field even though its own label text is longer
  // ("Nome completo", "Telefone (WhatsApp)").
  await page.getByLabel('Nome completo').fill('Cliente Teste')
  await page.getByLabel('E-mail').fill('cliente.teste@example.com')
  await page.getByLabel('Telefone (WhatsApp)').fill('11999990000')
  await page.getByRole('button', { name: /confirmar agendamento/i }).click()

  await expect(page.getByText(/agendamento confirmado/i)).toBeVisible()

  // This is the whole guarantee of the product: the link the confirmation
  // screen hands the customer must actually resolve to their booking, not
  // 404. Assert both the href shape and that following it really works.
  const manageLink = page.getByRole('link', {
    name: /ver ou cancelar agendamento/i,
  })
  await expect(manageLink).toHaveAttribute('href', /^\/a\//)

  const href = await manageLink.getAttribute('href')
  if (!href) throw new Error('management link has no href')
  await page.goto(href)

  await expect(
    page.getByRole('heading', { name: /seu agendamento/i }),
  ).toBeVisible()
  // The booked service's name, rendered on the appointment summary card —
  // proof this is the real booking and not a 404/"não encontramos" page.
  await expect(page.getByText('Corte', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /cancelar agendamento/i }),
  ).toBeVisible()
})
