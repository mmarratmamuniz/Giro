import { redirect } from 'next/navigation'

export default async function ComprasRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = searchParams ? await searchParams : {}
  const query = new URLSearchParams()
  query.set('tab', 'compras')
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (k !== 'tab' && typeof v === 'string') query.set(k, v)
    })
  }
  redirect(`/estoque?${query.toString()}`)
}
