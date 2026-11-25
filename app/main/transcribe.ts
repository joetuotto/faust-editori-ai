/**
 * Dictation: recorded speech to text. Uses OpenAI's transcription model when
 * an OpenAI key is set, otherwise Gemini (audio input). The audio is sent only
 * when the writer stops a recording and is not stored anywhere.
 */
import OpenAI, { toFile } from 'openai';
import { GoogleGenAI } from '@google/genai';
import { getKey } from './keys';

export interface TranscribeResult {
  success: boolean;
  text?: string;
  error?: string;
  /** Which service did the transcription */
  service?: string;
}

const LANGUAGE_NAMES: Record<string, string> = { fi: 'suomeksi', sv: 'ruotsiksi', en: 'englanniksi' };

async function withOpenAI(apiKey: string, audio: Buffer, mime: string, language: string): Promise<TranscribeResult> {
  const client = new OpenAI({ apiKey });
  const file = await toFile(audio, `sanelu.${mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: mime });
  for (const model of ['gpt-4o-transcribe', 'whisper-1']) {
    try {
      const result = await client.audio.transcriptions.create({ file, model, language });
      return { success: true, text: result.text.trim(), service: `OpenAI ${model}` };
    } catch (error) {
      // An account without the newer model still has whisper-1
      if (model === 'whisper-1' || !/model/i.test((error as Error).message)) throw error;
    }
  }
  return { success: false, error: 'Litterointi epäonnistui.' };
}

async function withGemini(apiKey: string, audio: Buffer, mime: string, language: string): Promise<TranscribeResult> {
  const client = new GoogleGenAI({ apiKey });
  const model = 'gemini-2.5-flash';
  const response = await client.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: mime.split(';')[0], data: audio.toString('base64') } },
          {
            text: `Litteroi tämä sanelu sanatarkasti ${LANGUAGE_NAMES[language] ?? ''}. Lisää välimerkit ja isot alkukirjaimet. Palauta pelkkä teksti ilman selityksiä.`
          }
        ]
      }
    ],
    config: { temperature: 0 }
  });
  return { success: true, text: (response.text ?? '').trim(), service: `Gemini ${model}` };
}

export async function transcribe(audio: Buffer, mime: string, language = 'fi'): Promise<TranscribeResult> {
  if (audio.length === 0) return { success: false, error: 'Nauhoitus oli tyhjä.' };
  try {
    const openaiKey = await getKey('openai');
    if (openaiKey) return await withOpenAI(openaiKey, audio, mime, language);
    const geminiKey = await getKey('gemini');
    if (geminiKey) return await withGemini(geminiKey, audio, mime, language);
    return { success: false, error: 'Sanelu tarvitsee OpenAI- tai Google Gemini -avaimen. Lisää avain Asetuksissa.' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
