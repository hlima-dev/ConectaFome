import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

// O formulário público tem um limite de inscrições por hora e por IP.
process.env.APPLY_RATE_LIMIT_MAX = '3'

let server: Server
let base: string
let prisma: typeof import('../../src/config/prisma').prisma

describe('limite de inscrições de voluntário', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../../src/config/prisma'))
    const { app } = await import('../../src/app')
    await prisma.$executeRawUnsafe('TRUNCATE TABLE notifications, volunteer_applications, volunteers, users RESTART IDENTITY CASCADE')
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await prisma.$disconnect()
  })

  it('depois do limite, devolve 429 e não grava mais nada', async () => {
    const send = (i: number) =>
      fetch(`${base}/api/v1/public/volunteers/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Pessoa Teste', phone: `(15) 95555-00${String(i).padStart(2, '0')}`, city: 'Sorocaba', availability: ['SEMANA_TARDE'], hasVehicle: false, consent: true }),
      })
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) statuses.push((await send(i)).status)
    expect(statuses).toEqual([201, 201, 201, 429, 429])
    expect(await prisma.volunteerApplication.count()).toBe(3)
  })
})
