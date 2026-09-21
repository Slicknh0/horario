'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { type FormEvent, useState } from 'react'
import { signUpBusiness } from '@/actions/tenant'
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
import { normalizeSlug } from '@/domain/slug'
import { messageFor } from '@/lib/errors'

const SLUG_ERROR_CODES = [
  'SLUG_TAKEN',
  'SLUG_RESERVED',
  'SLUG_INVALID',
] as const

function isSlugErrorCode(
  code: string,
): code is (typeof SLUG_ERROR_CODES)[number] {
  return (SLUG_ERROR_CODES as readonly string[]).includes(code)
}

export default function CadastroPage() {
  const router = useRouter()
  const [slugInput, setSlugInput] = useState('')
  const { execute, result, isExecuting } = useAction(signUpBusiness, {
    onSuccess: ({ data }) => {
      if (data.ok) router.push('/app')
    },
  })

  const slugPreview = normalizeSlug(slugInput)
  const actionError =
    result.data && !result.data.ok ? result.data.error : undefined
  const slugError =
    actionError && isSlugErrorCode(actionError)
      ? messageFor(actionError)
      : undefined
  const generalError =
    actionError === 'SIGNUP_FAILED'
      ? messageFor(actionError)
      : result.serverError
        ? messageFor('SIGNUP_FAILED')
        : undefined

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    execute({
      name: String(formData.get('name') ?? ''),
      slug: String(formData.get('slug') ?? ''),
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    })
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="gap-1.5 p-6 pb-2">
        <CardTitle className="text-xl">Criar conta</CardTitle>
        <CardDescription>
          Grátis para começar. Sem cartão de crédito.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-4">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nome do negócio</Label>
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Barbearia do Zé"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Endereço</Label>
            <Input
              id="slug"
              name="slug"
              required
              value={slugInput}
              onChange={(event) => setSlugInput(event.target.value)}
              aria-invalid={slugError ? true : undefined}
            />
            <p className="text-sm text-fg-muted">
              horario.app/b/
              <span className="text-fg">{slugPreview || '…'}</span>
            </p>
            {slugError ? (
              <p role="alert" className="text-sm text-danger">
                {slugError}
              </p>
            ) : null}
          </div>
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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {generalError ? (
            <p role="alert" className="text-sm text-danger">
              {generalError}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isExecuting}
          >
            {isExecuting ? 'Criando…' : 'Criar conta'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center border-t border-border p-6 pt-4">
        <p className="text-sm text-fg-muted">
          Já tem conta?{' '}
          <Link
            href="/login"
            className="rounded-sm font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Entrar
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
