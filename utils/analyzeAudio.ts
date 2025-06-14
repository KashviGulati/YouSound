import * as FileSystem from 'expo-file-system';

const ASSEMBLY_API_KEY = '9a771f7606d7467b8d70f91f8015f3bf';

export async function analyzeAudio(uri: string) {
  try {
    // Upload audio file directly
    const uploadRes = await FileSystem.uploadAsync(
      'https://api.assemblyai.com/v2/upload',
      uri,
      {
        httpMethod: 'POST',
        headers: {
          authorization: ASSEMBLY_API_KEY,
        },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      }
    );

    const uploadData = JSON.parse(uploadRes.body);
    const audioUrl = uploadData.upload_url;

    // Start transcription
    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        authorization: ASSEMBLY_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ audio_url: audioUrl }),
    });

    const transcriptData = await transcriptRes.json();

    // Poll for transcription result
    let transcript;
    while (true) {
      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptData.id}`, {
        headers: { authorization: ASSEMBLY_API_KEY },
      });

      const data = await res.json();

      if (data.status === 'completed') {
        transcript = data;
        break;
      } else if (data.status === 'error') {
        throw new Error(data.error);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return { text: transcript.text };
  } catch (error) {
    console.error('❌ AssemblyAI analysis failed:', error);
    return null;
  }
}
