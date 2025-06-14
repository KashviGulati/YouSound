import * as FileSystem from 'expo-file-system';

// ⚠️ Replace this with your actual AssemblyAI key
const API_KEY = '9a771f7606d7467b8d70f91f8015f3bf';

export async function uploadAndTranscribe(uri: string) {
  try {
    const fileBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        authorization: API_KEY,
      },
      body: Buffer.from(fileBase64, 'base64'),
    });

    const { upload_url } = await uploadRes.json();
    console.log('📤 Uploaded to:', upload_url);

    const transcribeRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        authorization: API_KEY,
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

    // Poll for status
    let status = '';
    let data;
    do {
      await new Promise((r) => setTimeout(r, 3000));
      const check = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { authorization: API_KEY },
      });
      data = await check.json();
      status = data.status;
      console.log('⌛ Status:', status);
    } while (status === 'queued' || status === 'processing');

    if (status === 'completed') {
      return data;
    } else {
      console.error('Transcript error:', data.error);
      return null;
    }
  } catch (e) {
    console.error('AssemblyAI error:', e);
    return null;
  }
}
