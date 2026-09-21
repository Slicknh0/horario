import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

// This test reads the token values straight out of globals.css and checks
// real WCAG contrast ratios via an oklch -> sRGB -> relative-luminance
// conversion implemented here (no extra dependency). It is the only thing
// keeping the palette honest: `pnpm dev` cannot run in this environment
// (no Postgres/Docker), so devtools contrast inspection is not an option.
// If a pair fails, the fix is to adjust the token in globals.css, never to
// lower the thresholds below.

const GLOBALS_CSS_PATH = path.resolve(__dirname, '../../src/app/globals.css')

type Oklch = { l: number; c: number; h: number }

function readTokens(): Record<string, Oklch> {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8')
  const tokenPattern =
    /--color-([a-z-]+):\s*oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/g

  const tokens: Record<string, Oklch> = {}
  for (const match of css.matchAll(tokenPattern)) {
    const [, name, l, c, h] = match
    if (!name || l === undefined || c === undefined || h === undefined) {
      continue
    }
    tokens[name] = { l: Number(l), c: Number(c), h: Number(h) }
  }
  return tokens
}

// oklch -> OKLab -> linear sRGB (Björn Ottosson's reference matrices).
// The linear r/g/b produced here are exactly the "linearized" components
// WCAG's relative-luminance formula wants, so no separate gamma step is
// needed before applying the 0.2126/0.7152/0.0722 weights.
function oklchToLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const L = l / 100
  const hueRad = (h * Math.PI) / 180
  const a = c * Math.cos(hueRad)
  const b = c * Math.sin(hueRad)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const bb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  return [r, g, bb]
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

// WCAG 2.x relative luminance, computed directly from the linear-light
// components (i.e. before sRGB gamma encoding), since that is the space
// the formula's R/G/B terms are already defined in.
function relativeLuminance(oklch: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(oklch).map(clamp01)
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

// WCAG 2.x contrast ratio: (L1 + 0.05) / (L2 + 0.05), lighter over darker.
function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

const AA_NORMAL_TEXT = 4.5

describe('design tokens: WCAG contrast', () => {
  const tokens = readTokens()

  test('globals.css exposes every token this test checks', () => {
    for (const name of [
      'bg',
      'surface',
      'surface-raised',
      'fg',
      'fg-muted',
      'accent',
      'accent-fg',
    ]) {
      expect(
        tokens[name],
        `--color-${name} missing from globals.css`,
      ).toBeDefined()
    }
  })

  test('fg on bg >= 4.5:1', () => {
    const fg = tokens.fg
    const bg = tokens.bg
    if (!fg || !bg) throw new Error('tokens not loaded')
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  test('fg-muted on surface >= 4.5:1', () => {
    const fgMuted = tokens['fg-muted']
    const surface = tokens.surface
    if (!fgMuted || !surface) throw new Error('tokens not loaded')
    expect(contrastRatio(fgMuted, surface)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    )
  })

  test('accent-fg on accent >= 4.5:1', () => {
    const accentFg = tokens['accent-fg']
    const accent = tokens.accent
    if (!accentFg || !accent) throw new Error('tokens not loaded')
    expect(contrastRatio(accentFg, accent)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    )
  })

  test('fg on surface-raised >= 4.5:1', () => {
    const fg = tokens.fg
    const surfaceRaised = tokens['surface-raised']
    if (!fg || !surfaceRaised) throw new Error('tokens not loaded')
    expect(contrastRatio(fg, surfaceRaised)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    )
  })
})

describe('oklch -> linear sRGB conversion sanity checks', () => {
  test('pure white converts to (1, 1, 1)', () => {
    const [r, g, b] = oklchToLinearSrgb({ l: 100, c: 0, h: 0 })
    expect(r).toBeCloseTo(1, 5)
    expect(g).toBeCloseTo(1, 5)
    expect(b).toBeCloseTo(1, 5)
  })

  test('pure black converts to (0, 0, 0)', () => {
    const [r, g, b] = oklchToLinearSrgb({ l: 0, c: 0, h: 0 })
    expect(r).toBeCloseTo(0, 5)
    expect(g).toBeCloseTo(0, 5)
    expect(b).toBeCloseTo(0, 5)
  })

  test('white on black is the maximum possible contrast ratio (21:1)', () => {
    const white = { l: 100, c: 0, h: 0 }
    const black = { l: 0, c: 0, h: 0 }
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1)
  })
})
