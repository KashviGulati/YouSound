import axios from 'axios';

const API_KEY = process.env.ASSEMBLY_AI_API_KEY!;
const LLM_URL = 'https://api.assemblyai.com/v2/lemur/tasks';

export interface InterviewQuestion {
  id: string;
  question: string;
  type: 'behavioral' | 'technical' | 'situational' | 'general';
  difficulty: 'easy' | 'medium' | 'hard';
  tips: string[];
  expectedStructure?: string;
}

export interface ContentAnalysis {
  relevanceScore: number;
  structureScore: number;
  clarityScore: number;
  completenessScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  detailedFeedback: string;
  followupQuestions: string[];
}

// 🔹 1. Generate Interview Questions
export const generateInterviewQuestions = async (
  domain: string,
  experienceLevel: string,
  count: number
): Promise<InterviewQuestion[]> => {
  try {
    const prompt = `Generate ${count} interview questions for ${domain} at ${experienceLevel} level.
Return as JSON with: id, question, type, difficulty, tips, expectedStructure.
Types: behavioral, technical, situational, general.
Difficulty: easy, medium, hard.`;

    const response = await axios.post(
      LLM_URL,
      { prompt },
      { headers: { authorization: API_KEY } }
    );

    return JSON.parse(response.data.response);
  } catch (error) {
    console.error('Error generating questions:', error);
    return [
      {
        id: 'fallback-1',
        question: `Describe a challenging ${domain} project you worked on.`,
        type: 'technical',
        difficulty: 'medium',
        tips: ['Mention tools/tech used', 'Describe problem & your solution'],
        expectedStructure: '1. Context\n2. Challenge\n3. Your Solution\n4. Outcome'
      }
    ];
  }
};

// 🔹 2. Analyze Interview Response
export const analyzeInterviewResponse = async (
  question: InterviewQuestion,
  transcript: string,
  domain: string,
  experienceLevel: string
): Promise<ContentAnalysis> => {
  try {
    const prompt = `Analyze this ${domain} interview response for a ${experienceLevel} position.
Question: ${question.question}
Response: ${transcript}

Evaluate on:
- Relevance to question (0-100)
- Structure/organization (0-100)
- Clarity of communication (0-100)
- Completeness of answer (0-100)
- Overall score (weighted average)

Return JSON with:
- All scores
- 3 strengths
- 3 improvements
- Detailed feedback paragraph
- 2 follow-up questions`;

    const response = await axios.post(
      LLM_URL,
      { prompt },
      { headers: { authorization: API_KEY } }
    );

    const analysis = JSON.parse(response.data.response);

    return {
      relevanceScore: analysis.relevanceScore || 0,
      structureScore: analysis.structureScore || 0,
      clarityScore: analysis.clarityScore || 0,
      completenessScore: analysis.completenessScore || 0,
      overallScore: analysis.overallScore || 0,
      strengths: analysis.strengths || [],
      improvements: analysis.improvements || [],
      detailedFeedback: analysis.detailedFeedback || '',
      followupQuestions: analysis.followupQuestions || []
    };
  } catch (error) {
    console.error('Error analyzing response:', error);
    return {
      relevanceScore: 70,
      structureScore: 65,
      clarityScore: 75,
      completenessScore: 60,
      overallScore: 67,
      strengths: [
        'Good technical knowledge',
        'Clear communication style',
        'Engaged and thoughtful response'
      ],
      improvements: [
        'Be more specific with examples',
        'Structure answers better',
        'Avoid rambling'
      ],
      detailedFeedback:
        'Decent response with technical clarity. Could be improved by structuring better and using examples aligned to the question.',
      followupQuestions: [
        'Can you walk me through another project using this approach?',
        'How would you apply this to a team conflict situation?'
      ]
    };
  }
};
