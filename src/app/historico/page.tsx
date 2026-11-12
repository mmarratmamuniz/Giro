import { redirect } from 'next/navigation'

export default async function HistoricoRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = searchParams ? await searchParams : {}
  const query = new URLSearchParams()
  query.set('tab', 'vendas')
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (k !== 'tab' && typeof v === 'string') query.set(k, v)
    })
  }
  redirect(`/relatorios?${query.toString()}`)
}
