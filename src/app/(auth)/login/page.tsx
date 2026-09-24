'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { messageFor, messageForSignInError } from '@/lib/errors'

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
        // Unknown e-mail and wrong password share one message; anything
        // else is not the user's password and is not reported as such.
        setError(messageForSignInError(signInError))
        return
      }

      router.push('/app')
    } catch {
      // A thrown error (network failure) happens whether or not the account
      // exists, so reporting it honestly reveals nothing about accounts.
      setError(messageFor('UNEXPECTED_ERROR'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="gap-1.5 p-6 pb-2">
        <CardTitle className="text-xl">Entrar</CardTitle>
        <CardDescription>Acesse a agenda do seu negócio.</CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-4">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center border-t border-border p-6 pt-4">
        <p className="text-sm text-fg-muted">
          Ainda não tem conta?{' '}
          <Link
            href="/cadastro"
            className="rounded-sm font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Criar conta
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
