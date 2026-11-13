import { useQuery } from '@tanstack/react-query'
import { getStoredUser, me } from '../services/auth'
import type { User } from '../types/auth'

// Usuário logado, atualizado do servidor: o cadastro pode ter sido aprovado
// depois do login, então a situação (em análise / aprovado) não pode depender
// só do que ficou guardado no navegador. Enquanto está em análise, reconsulta
// a cada minuto.
export function useCurrentUser(): User | null {
  const stored = getStoredUser()
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const fresh = await me()
      localStorage.setItem('@conectfome:user', JSON.stringify({ ...getStoredUser(), ...fresh }))
      return fresh
    },
    enabled: !!stored,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.approvalStatus === 'PENDENTE' ? 60_000 : false),
  })
  return data ? ({ ...stored, ...data } as User) : stored
}
