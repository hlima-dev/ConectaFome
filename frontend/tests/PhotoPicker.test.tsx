import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoPicker } from '../src/components/PhotoPicker'

function Harness({ max = 3 }: { max?: number }) {
  const [files, setFiles] = useState<File[]>([])
  return <PhotoPicker files={files} onChange={setFiles} max={max} />
}

const img = (name: string) => new File([new Uint8Array(2048)], name, { type: 'image/jpeg' })

describe('PhotoPicker', () => {
  it('mostra miniaturas, contador e permite remover', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('(0/3)')).toBeInTheDocument()

    await user.upload(screen.getByLabelText('Escolher fotos da galeria'), [img('a.jpg'), img('b.jpg')])
    expect(await screen.findByAltText('Foto 2 selecionada')).toBeInTheDocument()
    expect(screen.getByText('(2/3)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remover foto 1' }))
    expect(screen.getByText('(1/3)')).toBeInTheDocument()
    expect(screen.queryByAltText('Foto 2 selecionada')).not.toBeInTheDocument()
  })

  it('respeita o máximo e avisa quando passa dele', async () => {
    const user = userEvent.setup()
    render(<Harness max={2} />)
    await user.upload(screen.getByLabelText('Escolher fotos da galeria'), [img('a.jpg'), img('b.jpg'), img('c.jpg')])

    expect(await screen.findByText('No máximo 2 fotos.')).toBeInTheDocument()
    expect(screen.getByText('(2/2)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tirar foto/i })).toBeDisabled()
  })

  it('o botão de câmera usa a câmera traseira (capture=environment)', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Tirar foto com a câmera')).toHaveAttribute('capture', 'environment')
    expect(screen.getByLabelText('Tirar foto com a câmera')).toHaveAttribute('accept', 'image/*')
  })

  it('exibe o erro recebido do formulário', () => {
    render(<PhotoPicker files={[]} onChange={vi.fn()} error="Tire ao menos uma foto." />)
    expect(screen.getByText('Tire ao menos uma foto.')).toBeInTheDocument()
  })
})
