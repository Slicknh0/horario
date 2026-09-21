// Rendered server-side via renderToStaticMarkup (see src/lib/email.ts) into
// the HTML body Resend sends — never shipped to a browser, so this is the
// one place in the codebase allowed to ignore Tailwind and the app's own
// stylesheet. E-mail clients (Outlook's Word rendering engine, Gmail's
// sanitizer, mobile mail apps) strip <style> blocks, ignore flex/grid, and
// cannot load next/font's self-hosted files, so every rule here is inline,
// layout is nested <table>s, and text uses only fonts every OS already
// ships. The hex values are the same tokens app/globals.css defines in
// oklch — converted once by hand (see the design-token → sRGB conversion in
// tests/design/contrast.test.ts for the math) so this file needs no build
// step and no network access to the app's own CSS to match its identity.
const COLOR_BG = '#0c0806'
const COLOR_SURFACE = '#15110e'
const COLOR_BORDER = '#322d29'
const COLOR_FG = '#f7f5f1'
const COLOR_FG_MUTED = '#aaa39d'
const COLOR_ACCENT = '#f5a32f'
const COLOR_ACCENT_FG = '#1a0f03'

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

export type ConfirmationEmailProps = {
  tenantName: string
  serviceName: string
  when: string
  manageUrl: string
}

export function ConfirmationEmail({
  tenantName,
  serviceName,
  when,
  manageUrl,
}: ConfirmationEmailProps) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>Agendamento confirmado</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: COLOR_BG,
          fontFamily: FONT_STACK,
        }}
      >
        {/* Preheader: the line inbox list views show next to the subject.
            Hidden in the rendered message itself via a near-zero box
            rather than display:none, which some clients strip along with
            the text it's hiding. */}
        <div
          style={{
            display: 'none',
            overflow: 'hidden',
            lineHeight: '1px',
            opacity: 0,
            maxHeight: 0,
            maxWidth: 0,
          }}
        >
          {`Seu agendamento em ${tenantName} está confirmado — ${serviceName}, ${when}.`}
        </div>

        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ backgroundColor: COLOR_BG, width: '100%' }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: '32px 16px' }}>
                <table
                  role="presentation"
                  width={480}
                  cellPadding={0}
                  cellSpacing={0}
                  style={{ width: '480px', maxWidth: '100%' }}
                >
                  <tbody>
                    <tr>
                      <td style={{ paddingBottom: '28px' }}>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            color: COLOR_FG_MUTED,
                          }}
                        >
                          Horário
                        </span>
                      </td>
                    </tr>

                    <tr>
                      <td style={{ paddingBottom: '8px' }}>
                        <h1
                          style={{
                            margin: 0,
                            fontSize: '22px',
                            lineHeight: '28px',
                            fontWeight: 700,
                            color: COLOR_FG,
                          }}
                        >
                          Agendamento confirmado
                        </h1>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ paddingBottom: '24px' }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '15px',
                            lineHeight: '22px',
                            color: COLOR_FG_MUTED,
                          }}
                        >
                          {tenantName}
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td style={{ paddingBottom: '28px' }}>
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{
                            width: '100%',
                            backgroundColor: COLOR_SURFACE,
                            border: `1px solid ${COLOR_BORDER}`,
                            borderRadius: '8px',
                          }}
                        >
                          <tbody>
                            <tr>
                              <td style={{ padding: '20px' }}>
                                <p
                                  style={{
                                    margin: '0 0 6px',
                                    fontSize: '16px',
                                    fontWeight: 600,
                                    color: COLOR_FG,
                                  }}
                                >
                                  {serviceName}
                                </p>
                                {/* fontVariantNumeric: 'tabular-nums' is this
                                    template's equivalent of the app's .tnum
                                    utility class — a class from a stylesheet
                                    the mail client never loads would render
                                    as nothing. */}
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: '15px',
                                    color: COLOR_FG_MUTED,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {when}
                                </p>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    <tr>
                      <td align="center" style={{ paddingBottom: '20px' }}>
                        <table
                          role="presentation"
                          cellPadding={0}
                          cellSpacing={0}
                        >
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  backgroundColor: COLOR_ACCENT,
                                  borderRadius: '8px',
                                }}
                              >
                                <a
                                  href={manageUrl}
                                  style={{
                                    display: 'inline-block',
                                    padding: '12px 24px',
                                    fontSize: '15px',
                                    fontWeight: 600,
                                    color: COLOR_ACCENT_FG,
                                    textDecoration: 'none',
                                  }}
                                >
                                  Ver ou cancelar agendamento
                                </a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    <tr>
                      <td align="center" style={{ paddingBottom: '28px' }}>
                        {/* The button above is the primary path, but a
                            forwarded e-mail or a client that drops the
                            anchor's styling still needs a working link —
                            the same guarantee the confirmation screen makes
                            with its copyable link, repeated here. */}
                        <p
                          style={{
                            margin: 0,
                            fontSize: '13px',
                            lineHeight: '20px',
                            color: COLOR_FG_MUTED,
                            wordBreak: 'break-all',
                          }}
                        >
                          Ou copie e cole este link:
                          <br />
                          <a href={manageUrl} style={{ color: COLOR_FG_MUTED }}>
                            {manageUrl}
                          </a>
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td
                        style={{
                          borderTop: `1px solid ${COLOR_BORDER}`,
                          paddingTop: '16px',
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: '12px',
                            lineHeight: '18px',
                            color: COLOR_FG_MUTED,
                          }}
                        >
                          Guarde este e-mail: o link acima é a única forma de
                          ver ou cancelar seu agendamento, sem precisar criar
                          conta.
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
