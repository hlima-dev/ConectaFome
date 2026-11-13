// CPF e CNPJ: só dígitos, com conferência dos dois dígitos verificadores.
// Isso não prova que o documento é da pessoa (só a administração pode
// conferir isso), mas barra erro de digitação e números inventados.

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function checkDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0)
  const rest = sum % 11
  return rest < 2 ? 0 : 11 - rest
}

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const nums = d.split('').map(Number)
  const first = checkDigit(nums.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = checkDigit(nums.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return first === nums[9] && second === nums[10]
}

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const nums = d.split('').map(Number)
  const first = checkDigit(nums.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = checkDigit(nums.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return first === nums[12] && second === nums[13]
}

export function isValidDocument(value: string): boolean {
  return isValidCpf(value) || isValidCnpj(value)
}

// Formata para exibição/armazenamento padronizado.
export function formatDocument(value: string): string {
  const d = onlyDigits(value)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return value
}
