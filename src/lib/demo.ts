// Single source of truth for the seeded demo tenant's address. scripts/seed.ts
// creates the tenant under exactly this slug, the landing page's "Ver
// demonstração" CTA links to it, and tests assert against it — keeping all
// three in one place means they can never drift apart.
export const DEMO_TENANT_SLUG = 'barbearia-do-ze'
