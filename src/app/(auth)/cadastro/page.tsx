'use client'

import { useRouter } from 'next/navigation'
import { useAction } from 'next-safe-action/hooks'
import { type FormEvent, useState } from 'react'
import { signUpBusiness } from '@/actions/tenant'
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
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-semibold">Criar conta</h1>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label htmlFor="name">Nome do negócio</label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="slug">Endereço</label>
            <input
              id="slug"
              name="slug"
              required
              value={slugInput}
              onChange={(event) => setSlugInput(event.target.value)}
            />
            <p>horario.app/b/{slugPreview || '…'}</p>
            {slugError ? <p role="alert">{slugError}</p> : null}
          </div>
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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {generalError ? <p role="alert">{generalError}</p> : null}
          <button type="submit" disabled={isExecuting}>
            {isExecuting ? 'Criando…' : 'Criar conta'}
          </button>
        </form>
      </div>
    </main>
  )
}
