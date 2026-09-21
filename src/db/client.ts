import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from './schema'

const client = postgres(env.DATABASE_URL, { max: 10 })
export const db = drizzle(client, { schema })

// The type of the callback's `tx` parameter, derived from `db.transaction`
// itself rather than hand-assembled from drizzle-orm's generics — so a
// query helper can accept "db or a transaction" and stay correct if the
// driver or schema ever changes.
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
