import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DonationFormModal } from '../src/pages/donations/DonationFormModal'

const mutateAsync = vi.hoisted(() => vi.fn())
const uploadPhotos = vi.hoisted(() => vi.fn())
vi.mock('../src/services/photos', () => ({ uploadPhotos }))
vi.mock('../src/hooks/useDonations', () => ({ useCreateDonation: () => ({ mutateAsync }) }))
vi.mock('../src/hooks/useDonors', () => ({ useDonors: () => ({ data: [] }) }))
vi.mock('../src/services/auth', () => ({ getStoredUser: () => ({ id: 'u1', role: 'DOADOR' }) }))

// A foto da oferta é obrigatória: anexa uma pela galeria.
async function addPhoto() {
  const file = new File([new Uint8Array(10)], 'alimento.jpg', { type: 'image/jpeg' })
  await userEvent.upload(screen.getByLabelText('Escolher fotos da galeria'), file)
  await screen.findByAltText('Foto 1 selecionada')
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Iogurtes do dia' } })
  fireEvent.change(screen.getByLabelText('Quantidade estimada (kg)'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('Coleta a partir de'), { target: { value: '2026-11-01T10:00' } })
  fireEvent.change(screen.getByLabelText('Coleta até'), { target: { value: '2026-11-01T12:00' } })
}

describe('DonationFormModal', () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    mutateAsync.mockResolvedValue({ id: 'don1' })
    uploadPhotos.mockReset()
    uploadPhotos.mockResolvedValue([])
  })

  it('não envia sem a declaração de que o alimento está próprio para consumo', async () => {
    const user = userEvent.setup()
    render(<DonationFormModal onClose={() => {}} />)
    fillRequiredFields()

    await user.click(screen.getByRole('button', { name: /salvar/i }))

    expect(await screen.findByText(/confirme que o alimento está próprio para consumo/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('exige a condição de armazenamento para alimentos perecíveis', async () => {
    const user = userEvent.setup()
    render(<DonationFormModal onClose={() => {}} />)
    fillRequiredFields()
    await user.selectOptions(screen.getByLabelText('Categoria'), 'PERECIVEL')
    await user.click(screen.getByLabelText(/declaro que este alimento/i))

    await user.click(screen.getByRole('button', { name: /salvar/i }))

    expect(await screen.findByText(/informe como o alimento fica armazenado/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('para categorias não perecíveis a condição é opcional', async () => {
    const user = userEvent.setup()
    render(<DonationFormModal onClose={() => {}} />)
    fillRequiredFields()
    await user.click(screen.getByLabelText(/declaro que este alimento/i))
    await addPhoto()

    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ acceptTerms: true, storageCondition: undefined })
  })

  it('envia a condição escolhida junto com a declaração', async () => {
    const user = userEvent.setup()
    render(<DonationFormModal onClose={() => {}} />)
    fillRequiredFields()
    await user.selectOptions(screen.getByLabelText('Categoria'), 'PERECIVEL')
    await user.selectOptions(screen.getByLabelText(/armazenamento até a coleta/i), 'REFRIGERADO')
    await user.click(screen.getByLabelText(/declaro que este alimento/i))
    await addPhoto()

    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      category: 'PERECIVEL',
      storageCondition: 'REFRIGERADO',
      acceptTerms: true,
    })
  })

  it('exige ao menos uma foto do alimento antes de registrar', async () => {
    const user = userEvent.setup()
    render(<DonationFormModal onClose={() => {}} />)
    fillRequiredFields()
    await user.click(screen.getByLabelText(/declaro que este alimento/i))

    await user.click(screen.getByRole('button', { name: /salvar/i }))

    expect(await screen.findByText(/ao menos uma foto do alimento/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('depois de criar a doação, envia as fotos como OFERTA', async () => {
    const user = userEvent.setup()
    render(<DonationFormModal onClose={() => {}} />)
    fillRequiredFields()
    await user.click(screen.getByLabelText(/declaro que este alimento/i))
    await addPhoto()
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(uploadPhotos).toHaveBeenCalledTimes(1))
    const [donationId, files, kind] = uploadPhotos.mock.calls[0]
    expect(donationId).toBe('don1')
    expect(files).toHaveLength(1)
    expect(kind).toBe('OFERTA')
  })

  it('se o envio da foto falhar, a doação já criada não é perdida e o usuário é avisado', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    uploadPhotos.mockRejectedValue(new Error('sem rede'))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<DonationFormModal onClose={onClose} />)
    fillRequiredFields()
    await user.click(screen.getByLabelText(/declaro que este alimento/i))
    await addPhoto()
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('a foto não foi enviada'))
    alert.mockRestore()
  })
})
