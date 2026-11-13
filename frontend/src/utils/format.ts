// Peso em quilogramas no padrão brasileiro: vírgula decimal, no máximo 2 casas,
// sem zeros sobrando ("80,5 kg", "20 kg"). Aceita número ou o texto decimal
// que a API devolve para colunas numéricas do banco ("18.50").
export function formatKg(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`
}

// Número curto da doação: DOA-00042.
export function donationCode(number: number | null | undefined): string {
  return number === null || number === undefined ? '—' : `DOA-${String(number).padStart(5, '0')}`
}
