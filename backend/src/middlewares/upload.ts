import { NextFunction, Request, Response } from 'express'
import multer, { MulterError } from 'multer'
import { ValidationError } from '../utils/AppError'

export const MAX_UPLOAD_MB = 8

// Recebe fotos (multipart) em memória. O tamanho e a quantidade são limitados
// aqui; o tipo real é conferido depois, pelo conteúdo (utils/image.ts).
export function photoUpload(field = 'photos', maxFiles = 5) {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: maxFiles, fields: 12, parts: maxFiles + 12 },
  }).array(field, maxFiles)

  return (req: Request, res: Response, next: NextFunction): void => {
    parser(req, res, (error: unknown) => {
      if (!(error instanceof MulterError)) return next(error)
      if (error.code === 'LIMIT_FILE_SIZE') return next(new ValidationError(`Foto grande demais (máximo ${MAX_UPLOAD_MB} MB)`))
      if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') return next(new ValidationError(`Envie no máximo ${maxFiles} fotos de uma vez`))
      return next(new ValidationError('Não foi possível ler o envio das fotos'))
    })
  }
}

export function uploadedBuffers(req: Request): Buffer[] {
  return ((req.files as Express.Multer.File[] | undefined) ?? []).map((file) => file.buffer)
}
