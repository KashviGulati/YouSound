import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';

const ASSEMBLY_API_KEY = Constants.expoConfig?.extra?.assemblyApiKey;

interface Word {
  text: string;
  start: number;    // seconds
  end: number;      // seconds
  confidence: number;
  type?: string;    // "disfluency" indicates filler
}

interface Highlight {
  text: string;
  count: number;
  rank?: number;
  timestamps?: Array<{ start: number; end: number }>;
}

interface AnalysisResult {
  text: string;
  words: Word[];
  fillers: Word[];
  utterances: any[];
  highlights: Highlight[];
  repeatedWords: { word: string; count: number }[];
  analysis: {
    totalFillers: number;
    fillerRate: number; // fillers per minute
    mostUsedFillers: { word: string; count: number }[];
    commonFillerCounts: { [key: string]: number };
    longPauses: { start: number; end: number; duration: number }[];
    speakingPace: number; // words per minute
    confidenceScore: number;
    pronunciationIssues: { word: string; confidence: number }[];
    feedback: string[];
    recommendations: string[];
  };
}

// Common filler words to track explicitly
const COMMON_FILLERS = ['like', 'because', 'so', 'um', 'uh', 'you know'];

export async function analyzeAudio(uri: string): Promise<AnalysisResult | null> {
  try {
    console.log('🚀 Starting audio analysis...');

    // Step 1: Upload audio file
    const uploadRes = await FileSystem.uploadAsync(
      'https://api.assemblyai.com/v2/upload',
      uri,
      {
        httpMethod: 'POST',
        headers: { authorization: ASSEMBLY_API_KEY },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      }
    );

    const uploadData = JSON.parse(uploadRes.body);
    const audioUrl = uploadData.upload_url;
    console.log('📤 Audio uploaded successfully:', audioUrl);

    // Step 2: Start transcription with enhanced features
    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        authorization: ASSEMBLY_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        disfluencies: true,
        sentiment_analysis: false,
        auto_highlights: true,
        speaker_labels: false,
        format_text: true,
        punctuate: true,
        dual_channel: false,
      }),
    });

    const transcriptData = await transcriptRes.json();
    const transcriptId = transcriptData.id;
    console.log('🧠 Transcription started, ID:', transcriptId);

    // Step 3: Poll for completion
    let transcript;
    while (true) {
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { authorization: ASSEMBLY_API_KEY },
      });
      const data = await pollRes.json();

      if (data.status === 'completed') {
        transcript = data;
        break;
      } else if (data.status === 'error') {
        throw new Error(data.error);
      }

      console.log('⌛ Transcription status:', data.status);
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }

    console.log('✅ Transcription completed');

    // Step 4: Analyze the transcript
    const analysis = analyzeTranscript(transcript);

    // Step 5: Extract AI auto highlights (repeated/common phrases)
    const highlights: Highlight[] = transcript.auto_highlights_result?.results || [];
    console.log('🔦 AI detected highlights:', highlights.map(h => ({
      text: h.text,
      count: h.count,
      rank: h.rank,
      timestamps: h.timestamps?.map(t => ({ start: t.start, end: t.end })) || [],
    })));

    // Step 6: Extract repeated words manually
    const repeatedWords = getRepeatedWords(transcript.words || []);

    // Step 7: Return everything
    return {
      text: transcript.text,
      words: transcript.words || [],
      fillers: analysis.fillers,
      utterances: transcript.utterances || [],
      highlights,
      repeatedWords,
      analysis,
    };

  } catch (error) {
    console.error('❌ AssemblyAI analysis failed:', error);
    return null;
  }
}

function analyzeTranscript(transcript: any) {
  const words: Word[] = transcript.words || [];
  const totalDurationSeconds: number = transcript.audio_duration || 1;
  const totalDurationMinutes = totalDurationSeconds / 60;

  // Extract fillers (disfluencies) detected by AssemblyAI
  const fillers: Word[] = words.filter((word) => word.type === 'disfluency');

  // Count filler occurrences
  const fillerCounts: { [key: string]: number } = {};
  fillers.forEach((filler) => {
    const text = filler.text.toLowerCase().trim();
    fillerCounts[text] = (fillerCounts[text] || 0) + 1;
  });

  // Most used fillers top 10
  const mostUsedFillers = Object.entries(fillerCounts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Count common filler words explicitly
  const commonFillerCounts: { [key: string]: number } = {};
  COMMON_FILLERS.forEach(filler => commonFillerCounts[filler] = 0);

  words.forEach(word => {
    const w = word.text.toLowerCase();
    if (COMMON_FILLERS.includes(w)) {
      commonFillerCounts[w]++;
    }
  });

  // Pronunciation check: words with confidence < 0.6 (excluding fillers)
  const pronunciationIssues = words
    .filter(w => (w.confidence ?? 1) < 0.6 && w.type !== 'disfluency')
    .map(w => ({ word: w.text, confidence: w.confidence }));

  // Detect long pauses (greater than 2.5 seconds to reduce false positives)
  const longPauses: { start: number; end: number; duration: number }[] = [];
  for (let i = 1; i < words.length; i++) {
    const prevWord = words[i - 1];
    const currentWord = words[i];

    if (typeof prevWord.end === 'number' && typeof currentWord.start === 'number') {
      const pauseDuration = currentWord.start - prevWord.end;
      if (pauseDuration > 2.5) {  // increased threshold here
        longPauses.push({
          start: prevWord.end,
          end: currentWord.start,
          duration: pauseDuration,
        });
      }
    }
  }

  // Speaking pace (words per minute, excluding fillers)
  const totalWords = words.filter((word) => word.type !== 'disfluency').length;
  const speakingPace = totalWords / totalDurationMinutes;

  // Average confidence (excluding fillers)
  const nonFillerWords = words.filter((word) => word.type !== 'disfluency');
  const avgConfidence = nonFillerWords.length > 0
    ? nonFillerWords.reduce((sum, word) => sum + (word.confidence || 0), 0) / nonFillerWords.length
    : 0;

  // Filler rate per minute
  const fillerRate = fillers.length / totalDurationMinutes;

  // Generate feedback and recommendations
  const feedbackData = generateFeedback({
    totalFillers: fillers.length,
    fillerRate,
    longPauses,
    speakingPace,
    avgConfidence,
    totalDurationMinutes,
    mostUsedFillers,
    commonFillerCounts,
    pronunciationIssues,
  });

  return {
    totalFillers: fillers.length,
    fillerRate: Math.round(fillerRate * 10) / 10,
    mostUsedFillers,
    commonFillerCounts,
    longPauses,
    speakingPace: Math.round(speakingPace),
    confidenceScore: Math.round(avgConfidence * 100),
    pronunciationIssues,
    feedback: feedbackData.feedback,
    recommendations: feedbackData.recommendations,
    fillers,
  };
}

function getRepeatedWords(words: Word[]) {
  // Count occurrences ignoring fillers and very short words (<2 chars)
  const counts: { [word: string]: number } = {};
  words.forEach((w) => {
    if (w.type !== 'disfluency') {
      const wtext = w.text.toLowerCase();
      if (wtext.length > 1) counts[wtext] = (counts[wtext] || 0) + 1;
    }
  });

  // Return words that appear more than once, sorted descending
  return Object.entries(counts)
    .filter(([_, count]) => count > 1)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

function generateFeedback(metrics: {
  totalFillers: number;
  fillerRate: number;
  longPauses: any[];
  speakingPace: number;
  avgConfidence: number;
  totalDurationMinutes: number;
  mostUsedFillers: { word: string; count: number }[];
  commonFillerCounts?: { [key: string]: number };
  pronunciationIssues?: { word: string; confidence: number }[];
}) {
  const feedback: string[] = [];
  const recommendations: string[] = [];

  if (metrics.fillerRate < 2) {
    feedback.push("🎯 Excellent! Very few filler words detected.");
  } else if (metrics.fillerRate < 5) {
    feedback.push("👍 Good control of filler words, but there's room for improvement.");
    recommendations.push("Practice pausing instead of using filler words when you need time to think.");
  } else {
    feedback.push(`⚠️ High filler word usage detected (${metrics.fillerRate}/min). This may distract your audience.`);
    recommendations.push("Record yourself regularly and become aware of your filler word patterns.");
    recommendations.push("Practice speaking more slowly and deliberately.");
  }

  if (metrics.mostUsedFillers.length > 0) {
    const topFiller = metrics.mostUsedFillers[0];
    feedback.push(`🔍 Your most used filler word is "${topFiller.word}" (${topFiller.count} times).`);
    recommendations.push(`Be especially mindful of saying "${topFiller.word}" - try replacing it with a brief pause.`);
  }

  // Explicit common filler words feedback
  if (metrics.commonFillerCounts) {
    const usedFillers = Object.entries(metrics.commonFillerCounts)
      .filter(([_, count]) => count > 0);
    if (usedFillers.length > 0) {
      const fillersList = usedFillers.map(([word, count]) => `"${word}" (${count} times)`).join(', ');
      feedback.push(`🗣️ You used common filler words: ${fillersList}. Try to reduce them for clearer speech.`);
      recommendations.push("Practice pausing instead of using common filler words.");
    }
  }

  if (metrics.speakingPace < 120) {
    feedback.push("🐌 Your speaking pace is quite slow. Consider speaking a bit faster to maintain engagement.");
    recommendations.push("Practice speaking at 150-160 words per minute for optimal clarity and engagement.");
  } else if (metrics.speakingPace > 200) {
    feedback.push("🏃 You're speaking quite fast. Slow down to ensure clarity and comprehension.");
    recommendations.push("Take deliberate pauses between sentences to give your audience time to process.");
  } else {
    feedback.push("✅ Your speaking pace is in a good range for clear communication.");
  }

  if (metrics.longPauses.length > 0) {
    feedback.push(`⏸️ ${metrics.longPauses.length} long pause(s) detected. Some pauses can be effective, but too many may indicate hesitation.`);
    if (metrics.longPauses.length > metrics.totalDurationMinutes * 2) {
      recommendations.push("Prepare your content more thoroughly to reduce hesitation pauses.");
      recommendations.push("Practice your presentation multiple times to improve flow.");
    }
  } else {
    feedback.push("⏭️ Good flow with appropriate pausing.");
  }

  if (metrics.avgConfidence > 0.8) {
    feedback.push("🎤 Clear articulation detected - your speech is easy to understand.");
  } else if (metrics.avgConfidence > 0.6) {
    feedback.push("👌 Generally clear speech with some areas for improvement.");
    recommendations.push("Speak more clearly and ensure proper pronunciation of key words.");
  } else {
    feedback.push("🗣️ Consider speaking more clearly - some words may be difficult to understand.");
    recommendations.push("Practice articulation exercises and speak more slowly.");
  }

  // Pronunciation issues feedback
  if (metrics.pronunciationIssues && metrics.pronunciationIssues.length > 0) {
    const uniqueIssues = Array.from(new Set(metrics.pronunciationIssues.map(i => i.word.toLowerCase())));
    feedback.push(`❗ Potential pronunciation issues detected on words: ${uniqueIssues.join(', ')}.`);
    recommendations.push("Work on clear articulation and pronunciation, especially these words.");
    recommendations.push("Record yourself and compare to native speakers.");
  }

  recommendations.push("Record yourself regularly to track improvement over time.");
  recommendations.push("Practice in front of a mirror or with friends for feedback.");

  return { feedback, recommendations };
}
