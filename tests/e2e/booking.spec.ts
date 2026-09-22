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

// Clicks the fixed-position "Confirmar agendamento" button via the DOM's
// own click() instead of Playwright's coordinate-based pointer dispatch.
//
// Root cause, confirmed by direct repro against this exact page under the
// 390x844 mobile project: Next.js 16's App Router removes and recreates the
// <meta name="viewport"> element on every client-side navigation (verified
// by tagging the original node and observing the tag identity change after
// a Link click) — this happens for BOTH the implicit default and an
// explicit static `viewport` export (src/app/layout.tsx has the latter).
// A browser only honors that tag as parsed with the INITIAL document, never
// a dynamically reinserted one (this is documented, unresolved upstream
// behavior — see https://github.com/vercel/next.js/discussions/56554,
// "PWA Pinch to Zoom Must be Disabled" reports the same symptom). Once lost,
// Chromium's mobile layout viewport does not recover — not from an
// identical tag re-added moments later, not from a fresh
// page.setViewportSize() call — it falls back to its ~980px
// "not-mobile-optimized" layout viewport for the rest of the document's
// life, roughly 50ms after the navigation that triggered it (confirmed by
// sampling window.innerWidth at increasing delays).
//
// The app's own CSS is not at fault: document.elementFromPoint resolves
// correctly to this exact button when queried in the same (skewed) layout
// coordinate space browser-side. The mismatch is specific to `position:
// fixed` elements — their rect is reported in the desynced LAYOUT viewport
// while CDP's synthetic pointer dispatch targets the VISUAL viewport,
// which is exactly why every other (non-fixed) element in this flow (day
// links, the slot radio) keeps clicking fine after the same desync, and
// only this fixed bottom bar's button does not. A real touchscreen's own
// touch-to-CSS-pixel mapping handles a pinch-zoomed page natively, so this
// is believed to be a Playwright/CDP-specific gap rather than something a
// real phone user would hit — but the underlying viewport-desync (the page
// silently rendering zoomed out after any in-flow navigation) is real and
// worth follow-up, since spec §7 requires the slot grid stay "legível sem
// zoom". Dispatching the click via the DOM directly sidesteps the
// coordinate-space mismatch without touching application code for a defect
// that isn't in the application.
async function clickConfirmar(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /confirmar agendamento/i })
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  await button.evaluate((el: HTMLElement) => el.click())
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
