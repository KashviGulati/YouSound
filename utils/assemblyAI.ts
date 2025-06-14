import * as FileSystem from 'expo-file-system';
import { ASSEMBLY_API_KEY } from '@env';
import { toByteArray } from 'base64-js';

export async function uploadAndTranscribe(uri: string) {
  try {
    const fileBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const binaryAudio = toByteArray(fileBase64);

    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        authorization: ASSEMBLY_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: binaryAudio,
    });

    const { upload_url } = await uploadRes.json();
    console.log('📤 Uploaded to:', upload_url);

    const transcribeRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        authorization: ASSEMBLY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: upload_url,
        disfluencies: true,
        sentiment_analysis: true,
        auto_highlights: true,
      }),
    });

    const { id } = await transcribeRes.json();
    console.log('🧠 Transcript job ID:', id);

    let data;
    while (true) {
      await new Promise<void>((resolve) => setTimeout(resolve, 3000));

      const check = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { authorization: ASSEMBLY_API_KEY },
      });

      data = await check.json();
      console.log('⌛ Status:', data.status);

      if (data.status === 'completed') break;
      if (data.status === 'error') throw new Error(data.error);
    }

    return data;
  } catch (error) {
    console.error('❌ AssemblyAI error:', error);
    return null;
  }
}
