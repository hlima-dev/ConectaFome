import { describe, expect, it } from 'vitest'
import { defaultCustom, granularityFor, includesToday, isFuture, periodLabel, pointTitle, previousRange, rangeFor, shiftRef, tickLabel, toDay } from '../src/utils/period'

// 11/11/2026 é uma quarta-feira.
const ref = new Date(2026, 10, 11)

describe('períodos dos relatórios', () => {
  it('semana vai de segunda a domingo e a escala é por dia', () => {
    expect(rangeFor('semana', ref)).toEqual({ from: '2026-11-09', to: '2026-11-15', granularity: 'day' })
    // domingo ainda pertence à semana que começou na segunda anterior
    expect(rangeFor('semana', new Date(2026, 10, 15))).toMatchObject({ from: '2026-11-09', to: '2026-11-15' })
    expect(rangeFor('semana', new Date(2026, 10, 16))).toMatchObject({ from: '2026-11-16', to: '2026-11-22' })
  })

  it('a semana atravessa a virada de mês e de ano', () => {
    expect(rangeFor('semana', new Date(2026, 9, 31))).toMatchObject({ from: '2026-10-26', to: '2026-11-01' })
    expect(rangeFor('semana', new Date(2027, 0, 1))).toMatchObject({ from: '2026-12-28', to: '2027-01-03' })
  })

  it('mês completo, por dia (inclusive fevereiro de ano bissexto)', () => {
    expect(rangeFor('mes', ref)).toEqual({ from: '2026-11-01', to: '2026-11-30', granularity: 'day' })
    expect(rangeFor('mes', new Date(2028, 1, 10))).toMatchObject({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('ano completo, por mês', () => {
    expect(rangeFor('ano', ref)).toEqual({ from: '2026-01-01', to: '2026-12-31', granularity: 'month' })
  })

  it('personalizado: escala conforme o tamanho (dia, semana ou mês)', () => {
    expect(granularityFor('2026-11-01', '2026-11-30')).toBe('day')
    expect(granularityFor('2026-09-01', '2026-11-30')).toBe('week')
    expect(granularityFor('2026-01-01', '2026-12-31')).toBe('month')
    expect(rangeFor('personalizado', ref, { from: '2026-10-01', to: '2026-12-31' }).granularity).toBe('week')
  })

  it('o padrão do personalizado são os últimos 30 dias, incluindo hoje', () => {
    expect(defaultCustom(ref)).toEqual({ from: '2026-10-13', to: '2026-11-11' })
  })

  it('setas: semana ±7 dias, mês e ano ±1, sem pular nem repetir', () => {
    expect(toDay(shiftRef('semana', ref, -1))).toBe('2026-11-04')
    expect(toDay(shiftRef('mes', new Date(2026, 2, 31), -1))).toBe('2026-02-01') // 31/03 → fevereiro, sem estourar para março
    expect(toDay(shiftRef('mes', new Date(2026, 11, 15), 1))).toBe('2027-01-01')
    expect(toDay(shiftRef('ano', ref, -1))).toBe('2025-01-01')
  })

  it('período anterior para comparar', () => {
    expect(previousRange('semana', ref, rangeFor('semana', ref))).toMatchObject({ from: '2026-11-02', to: '2026-11-08' })
    expect(previousRange('mes', ref, rangeFor('mes', ref))).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
    expect(previousRange('ano', ref, rangeFor('ano', ref))).toMatchObject({ from: '2025-01-01', to: '2025-12-31' })
    // personalizado: mesmo número de dias, logo antes
    const custom = { from: '2026-11-10', to: '2026-11-16', granularity: 'day' as const }
    expect(previousRange('personalizado', ref, custom)).toMatchObject({ from: '2026-11-03', to: '2026-11-09' })
  })

  it('sabe se o período está no futuro e se contém hoje', () => {
    expect(isFuture(rangeFor('semana', new Date(2026, 10, 18)), ref)).toBe(true)
    expect(isFuture(rangeFor('semana', ref), ref)).toBe(false)
    expect(includesToday(rangeFor('mes', ref), ref)).toBe(true)
    expect(includesToday(rangeFor('mes', new Date(2026, 9, 1)), ref)).toBe(false)
  })

  it('rótulos em português', () => {
    expect(periodLabel('mes', rangeFor('mes', ref))).toBe('novembro de 2026')
    expect(periodLabel('ano', rangeFor('ano', ref))).toBe('2026')
    expect(periodLabel('semana', rangeFor('semana', ref))).toBe('9 a 15 nov 2026')
    expect(periodLabel('semana', rangeFor('semana', new Date(2026, 9, 31)))).toBe('26 out a 1 nov 2026')
    expect(periodLabel('personalizado', { from: '2026-10-01', to: '2026-10-31', granularity: 'day' })).toBe('01/10/2026 a 31/10/2026')
  })

  it('rótulos do eixo e do tooltip', () => {
    expect(tickLabel('2026-11-10', 'day', 'semana')).toBe('ter 10')
    expect(tickLabel('2026-11-10', 'day', 'mes')).toBe('10')
    expect(tickLabel('2026-11-09', 'week', 'personalizado')).toBe('09/11')
    expect(tickLabel('2026-03-01', 'month', 'ano')).toBe('mar')
    expect(pointTitle('2026-11-10', 'day')).toBe('terça-feira, 10 de novembro de 2026')
    expect(pointTitle('2026-11-09', 'week')).toBe('Semana de 9 de nov a 15 de nov')
    expect(pointTitle('2026-11-01', 'month')).toBe('novembro de 2026')
  })
})
