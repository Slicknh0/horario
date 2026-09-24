import { expect, type Locator, type Page, test } from '@playwright/test'

// Finds the first day in the strip (src/components/booking/date-strip.tsx)
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
//
// Returns the locator rather than clicking it — the re-click regression
// test below needs to interact with it more than once.
async function findAnOpenFutureDayLink(page: Page): Promise<Locator> {
  const dateStrip = page.getByRole('group', { name: 'Escolha o dia' })
  await expect(dateStrip).toBeVisible()
  const dateLinks = dateStrip.getByRole('link')
  const count = await dateLinks.count()
  for (let i = 1; i < count; i++) {
    const link = dateLinks.nth(i)
    const text = (await link.textContent()) ?? ''
    if (!text.toLowerCase().includes('cheio')) return link
  }
  throw new Error('no open future day found in the date strip')
}

async function pickAnOpenFutureDay(page: Page): Promise<void> {
  const link = await findAnOpenFutureDayLink(page)
  await link.click()
}

// Spec §7: the booking page must never scroll horizontally on a phone. When
// it does, the phone zooms the whole page out to fit — which is how this was
// found, on a real iPhone: the date strip's <fieldset> refused to shrink
// below its row of days (browsers give fieldsets min-inline-size:
// min-content), the document grew to ~960px, and the slot grid rendered
// tiny after the first day was picked.
//
// Compared against the configured device width, NOT clientWidth: once the
// content overflows, mobile Chromium widens its layout viewport to fit, so
// clientWidth grows with the bug and a clientWidth check passes right
// through it.
async function expectNoHorizontalOverflow(page: Page, step: string) {
  const deviceWidth = page.viewportSize()?.width
  if (!deviceWidth) throw new Error('no viewport configured for this project')
  const documentWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  )
  expect(
    documentWidth,
    `the page is wider than the ${deviceWidth}px screen ${step}`,
  ).toBeLessThanOrEqual(deviceWidth)
}

// A real pointer click at the button's coordinates — the fixed bottom bar is
// exactly what a thumb reaches for. This once had to be a DOM click(),
// because the widened page (see expectNoHorizontalOverflow) left the layout
// viewport at ~960px and the fixed button's rect no longer matched where a
// pointer landed; that was blamed at the time on Next re-inserting the
// viewport meta tag, which it was not.
async function clickConfirmar(page: Page): Promise<void> {
  await page.getByRole('button', { name: /confirmar agendamento/i }).click()
}

test('a customer books and receives a working management link', async ({
  page,
  context,
}) => {
  // The copy button (src/components/copy-link-button.tsx) calls
  // navigator.clipboard.writeText, which silently no-ops on a denied/absent
  // permission — granting it explicitly is what makes the assertion below
  // prove the click actually worked, not just that it didn't throw.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:3000',
  })

  await page.goto('/b/barbearia-do-ze')

  // Services are rendered as accessible links (ServiceCard), not buttons —
  // select by role and accessible name, not CSS, so a styling change can't
  // break this. "Corte" also matches "Corte + Barba"; .first() picks the
  // plain "Corte" service, which is first in the seeded sort order.
  await page
    .getByRole('link', { name: /^Corte\b/ })
    .first()
    .click()
  await expect(page.getByRole('group', { name: 'Escolha o dia' })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'after choosing a service')

  await pickAnOpenFutureDay(page)
  await expect(page.getByRole('radio').first()).toBeVisible()
  await expectNoHorizontalOverflow(page, 'after choosing a day')

  // The days that do not fit must still be reachable — by scrolling the
  // strip itself, not the page.
  const strip = page.getByRole('group', { name: 'Escolha o dia' })
  const stripScrolls = await strip
    .locator('div')
    .first()
    .evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(stripScrolls, 'the date strip should scroll on its own').toBe(true)

  // Slots are a Radix radiogroup (role "radio" per item) — the one part
  // of the brief's selector sketch that already matched the real DOM.
  await page.getByRole('radio').first().click()

  // Labels: getByLabel does a case-insensitive substring match, so
  // "E-mail" matches the field even though its own label text is longer
  // ("Nome completo", "Telefone (WhatsApp)").
  await page.getByLabel('Nome completo').fill('Cliente Teste')
  await page.getByLabel('E-mail').fill('cliente.teste@example.com')
  await page.getByLabel('Telefone (WhatsApp)').fill('11999990000')
  await clickConfirmar(page)

  // bookAppointment redirects to /b/[slug]/confirmado?token=... on success
  // (see src/actions/book-appointment.ts) instead of rendering an inline
  // confirmation — the URL itself is what makes the guarantee below
  // (visible, copyable, survives a reload) possible: the token lives
  // server-side in the address bar, never only in client state.
  await page.waitForURL(/\/b\/barbearia-do-ze\/confirmado\?token=/)
  await expect(
    page.getByRole('heading', { name: /agendamento confirmado/i }),
  ).toBeVisible()

  // This is the whole guarantee of the product (spec §6: "o e-mail é
  // conveniência, a tela é a garantia"): the full management URL must be
  // shown as text a customer can read and copy, not just linked somewhere
  // off-screen.
  const manageUrlText = page.getByText(/\/a\//)
  await expect(manageUrlText).toBeVisible()
  const manageUrl = (await manageUrlText.textContent())?.trim()
  if (!manageUrl) throw new Error('management URL not shown on the page')

  // Copyable: click the copy button and confirm it actually wrote to the
  // clipboard (src/components/copy-link-button.tsx flips its own
  // accessible name only after navigator.clipboard.writeText resolves,
  // never on a caught failure).
  await page
    .getByRole('button', { name: /copiar link público|copiar link/i })
    .click()
  await expect(
    page.getByRole('button', { name: /link copiado/i }),
  ).toBeVisible()
  const clipboardText = await page.evaluate(() =>
    navigator.clipboard.readText(),
  )
  expect(clipboardText).toBe(manageUrl)

  // Survives a reload: the token is a URL query param resolved server-side
  // on every render, not client state that a refresh would lose.
  await page.reload()
  await expect(
    page.getByRole('heading', { name: /agendamento confirmado/i }),
  ).toBeVisible()
  await expect(page.getByText(manageUrl)).toBeVisible()

  // And the link the customer was shown must actually resolve to their
  // booking, not 404.
  await page.goto(manageUrl)
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

// Regression test for a Critical bug found (and fixed) in this same round:
// BookingFlow used to track "a day/service navigation is in flight" with a
// hand-set useState flag, armed on click and relying entirely on
// BookingFlow's own remount (its `key` changes on day/service change) to
// clear it. That reset path never fires for a second click on the SAME day
// while its own navigation is still pending — no key change has happened
// yet, so nothing remounts — which left the flag (and therefore every slot
// in the grid) permanently disabled until a hard reload. The fix
// (src/components/booking/booking-flow.tsx) replaced the hand-tracked flag
// with React's own useTransition: `isPending` is guaranteed to resolve
// once the transition it's tracking settles, no matter how many times
// startTransition is called again for the same or a different target
// while it's pending, and no matter what settles it.
//
// See also: Back-button-during-a-pending-transition is the other scenario
// this bug class covers, and this suite does NOT have a test for it.
// Confirmed deliberately, not by omission: `router.push()` inside
// startTransition does not update `location.href` synchronously (verified
// directly — clicking a day link and reading `location.href` in the very
// same synchronous script still showed the pre-click URL), so there is no
// externally observable moment between "the push was requested" and "the
// push's own history update landed" that a test could reliably act on to
// inject a Back press inside that specific window — by the time any
// Playwright action (even a raw same-tick page.evaluate()) can act again,
// the push has typically already completed. A test that merely clicks a
// day and then calls page.goBack() afterward would not exercise the
// pending case at all; it would pass whether or not the underlying fix
// works, which is worse than no test. The re-click case below IS
// deterministically drivable (a double-click's two events are guaranteed
// to both land before either one's own navigation completes) and exercises
// the same underlying guarantee (`isPending` must resolve to false once
// the transition — however many times it was (re)started — actually
// settles), which is what makes it a meaningful regression test for this
// bug class even without a dedicated Back scenario.
test('re-clicking the same day while its navigation is in flight still leaves a bookable grid', async ({
  page,
}) => {
  await page.goto('/b/barbearia-do-ze')
  await page
    .getByRole('link', { name: /^Corte\b/ })
    .first()
    .click()

  const dayLink = await findAnOpenFutureDayLink(page)

  // A double-click dispatches two real click events close together — the
  // second lands while the first's own startTransition(() =>
  // router.push(...)) may still be pending (BookingFlow's key hasn't
  // changed yet, since the new day's Server Component payload hasn't
  // arrived), which is exactly the "re-click while in flight" case: two
  // requests to navigate to the SAME day in quick succession, neither of
  // which produces a remount to fall back on for resetting anything.
  await dayLink.dblclick()

  // The grid must not come out of this permanently disabled. Playwright's
  // own auto-waiting `click()` below waits out whatever pending window is
  // left (SlotGrid's radios are genuinely `disabled` while isPending is
  // true — see slot-grid.tsx) and only clicks once a real, enabled radio
  // exists — which only happens once the transition has actually settled.
  await page.getByRole('radio').first().click()
  await page.getByLabel('Nome completo').fill('Cliente Reclique')
  await page.getByLabel('E-mail').fill('cliente.reclique@example.com')
  await page.getByLabel('Telefone (WhatsApp)').fill('11999990002')
  await clickConfirmar(page)

  // The flow must still fully advance, not just "a click was accepted".
  // Scoped to the heading, not a plain getByText — see the comment on the
  // first test's redirect assertion above for why an unscoped match also
  // resolves Next's route announcer and fails in strict mode.
  await expect(
    page.getByRole('heading', { name: /agendamento confirmado/i }),
  ).toBeVisible()
})
