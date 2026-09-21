'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { authClient } from '@/lib/auth-client'

// Same message for an unknown e-mail and a wrong password: the form must
// never reveal which e-mails have accounts.
const INVALID_CREDENTIALS_MESSAGE = 'E-mail ou senha incorretos'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')

    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      })

      if (signInError) {
        setError(INVALID_CREDENTIALS_MESSAGE)
        return
      }

      router.push('/app')
    } catch {
      // A thrown error (network failure, etc.) gets the same generic
      // message as a rejected sign-in — it must never distinguish itself
      // from a wrong e-mail or password.
      setError(INVALID_CREDENTIALS_MESSAGE)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
