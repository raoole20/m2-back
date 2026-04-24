import { ContentType } from '@prisma/client';

export const IMAGE_PROMPT = `Analiza la imagen y describe con precisión su contenido. Si incluye texto visible (carteles, capturas, documentos, etiquetas), transcríbelo íntegramente y de forma fiel. No añadas suposiciones ni opiniones: limítate a describir lo observable.`;

export const AUDIO_PROMPT = `Transcribe fielmente este audio al idioma original en el que está hablado. Mantén la puntuación natural. Si hay múltiples hablantes, indícalo como "Hablante 1:", "Hablante 2:", etc. Si hay ruido o partes inaudibles, anótalo como [inaudible].`;

export const VIDEO_PROMPT = `Describe la escena principal del video (qué ocurre, quiénes aparecen, contexto visual). Si hay audio hablado, transcríbelo fielmente en el idioma original. Si hay texto sobreimpreso, inclúyelo. Estructura: "Descripción visual:" seguido de "Transcripción de audio:" si aplica.`;

export const DOCUMENT_PROMPT = `Extrae el contenido completo y estructurado de este documento. Preserva jerarquía (títulos, secciones, listas, tablas) usando markdown. Si es un formulario o tabla, mantén la relación campo-valor. No resumas: transcribe fielmente.`;

export const STICKER_PROMPT = `Describe brevemente qué representa este sticker (personaje, emoción, texto si contiene). Máximo una oración.`;

export const PROMPT_BY_CONTENT_TYPE: Partial<Record<ContentType, string>> = {
  [ContentType.IMAGE]: IMAGE_PROMPT,
  [ContentType.AUDIO]: AUDIO_PROMPT,
  [ContentType.VIDEO]: VIDEO_PROMPT,
  [ContentType.DOCUMENT]: DOCUMENT_PROMPT,
  [ContentType.STICKER]: STICKER_PROMPT,
};
