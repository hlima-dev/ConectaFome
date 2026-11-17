import { describe, it, expect } from 'vitest'
import { bucketStarts, brtDayRange } from '../src/services/ReportService'

describe('baldes do gráfico de relatórios', () => {
  it('dia: um ponto por dia, inclusive os sem coleta', () => {
    expect(bucketStarts('2026-11-09', '2026-11-15', 'day')).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
    ])
  })

  it('semana: começa na segunda-feira, mesmo que o período comece no meio dela', () => {
    // 11/11/2026 é quarta; a semana começa na segunda 09/11
    expect(bucketStarts('2026-11-11', '2026-11-25', 'week')).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'])
  })

  it('mês: um ponto por mês, a partir do dia 1', () => {
    expect(bucketStarts('2026-01-15', '2026-04-02', 'month')).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'])
    expect(bucketStarts('2026-01-01', '2026-12-31', 'month')).toHaveLength(12)
  })

  it('período de um dia só', () => {
    expect(bucketStarts('2026-11-10', '2026-11-10', 'day')).toEqual(['2026-11-10'])
  })

  it('ano bissexto tem 366 dias', () => {
    expect(bucketStarts('2028-01-01', '2028-12-31', 'day')).toHaveLength(366)
  })

  it('o recorte em dias de Brasília: começa às 03:00 UTC e termina antes das 03:00 UTC do dia seguinte', () => {
    const { gte, lt } = brtDayRange('2026-11-10', '2026-11-12')
    expect(gte.toISOString()).toBe('2026-11-10T03:00:00.000Z')
    expect(lt.toISOString()).toBe('2026-11-13T03:00:00.000Z')
  })
})
