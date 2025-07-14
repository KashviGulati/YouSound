import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import { analyzeAudio } from '../../utils/analyzeAudio';
import { generateInterviewQuestions, analyzeInterviewResponse } from '../../utils/aiInterviewHelper';

interface InterviewQuestion {
  id: string;
  question: string;
  type: 'behavioral' | 'technical' | 'situational' | 'general';
  difficulty: 'easy' | 'medium' | 'hard';
  tips: string[];
  expectedStructure?: string;
}

interface QuestionResponse {
  questionId: string;
  question: string;
  audioUri: string;
  duration: number;
  transcript: string;
  speechAnalysis: any;
  contentAnalysis: {
    relevanceScore: number;
    structureScore: number;
    clarityScore: number;
    completenessScore: number;
    overallScore: number;
    strengths: string[];
    improvements: string[];
    detailedFeedback: string;
    followupQuestions: string[];
  };
  recordedAt: string;
}

interface InterviewSession {
  id: string;
  domain: string;
  experienceLevel: string;
  questions: InterviewQuestion[];
  responses: QuestionResponse[];
  createdAt: string;
  completedAt?: string;
  overallScore?: number;
}

const DOMAINS = [
  'Software Engineering',
  'Data Science',
  'Product Management',
  'Digital Marketing',
  'Sales',
  'Finance',
  'Human Resources',
  'Design (UI/UX)',
  'Consulting',
  'Healthcare',
  'Education',
  'Operations',
  'Customer Service',
  'General/Other'
];

const EXPERIENCE_LEVELS = [
  'Entry Level (0-2 years)',
  'Mid Level (2-5 years)', 
  'Senior Level (5-10 years)',
  'Leadership (10+ years)'
];

export default function InterviewPrepScreen() {
  const [currentSession, setCurrentSession] = useState<InterviewSession | null>(null);
  const [pastSessions, setPastSessions] = useState<InterviewSession[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<QuestionResponse | null>(null);
  
  // Setup form state
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedExperience, setSelectedExperience] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);

  useEffect(() => {
    requestAudioPermission();
    configureAudio();
    loadPastSessions();
  }, []);

  const requestAudioPermission = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant audio recording permission.');
    }
  };

  const configureAudio = async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  };

  const loadPastSessions = () => {
    // In real app, load from AsyncStorage
    // For now, we'll start with empty array
    setPastSessions([]);
  };

  const startNewSession = async () => {
    const domain = selectedDomain === 'General/Other' ? customDomain : selectedDomain;
    
    if (!domain || !selectedExperience) {
      Alert.alert('Missing Information', 'Please select domain and experience level.');
      return;
    }

    setIsGeneratingQuestions(true);
    
    try {
      const questions = await generateInterviewQuestions(domain, selectedExperience, numQuestions);
      
      const newSession: InterviewSession = {
        id: Date.now().toString(),
        domain,
        experienceLevel: selectedExperience,
        questions,
        responses: [],
        createdAt: new Date().toISOString(),
      };

      setCurrentSession(newSession);
      setCurrentQuestionIndex(0);
      setShowSetup(false);
      setShowQuestionModal(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate questions. Please try again.');
      console.error('Question generation failed:', error);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      if (!recording || !currentSession) return;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (!uri) return;

      const { sound, status } = await recording.createNewLoadedSoundAsync();
      const duration = (status as any).durationMillis ?? 0;

      setRecording(null);
      setIsAnalyzing(true);

      try {
        // Analyze speech using existing function
        const speechAnalysis = await analyzeAudio(uri);
        
        if (!speechAnalysis) {
          throw new Error('Speech analysis failed');
        }

        // Analyze content using AI
        const currentQuestion = currentSession.questions[currentQuestionIndex];
        const contentAnalysis = await analyzeInterviewResponse(
          currentQuestion,
          speechAnalysis.text,
          selectedDomain,
          selectedExperience
        );

        const newResponse: QuestionResponse = {
          questionId: currentQuestion.id,
          question: currentQuestion.question,
          audioUri: uri,
          duration,
          transcript: speechAnalysis.text,
          speechAnalysis,
          contentAnalysis,
          recordedAt: new Date().toISOString(),
        };

        // Update session with new response
        const updatedSession = {
          ...currentSession,
          responses: [...currentSession.responses, newResponse],
        };

        setCurrentSession(updatedSession);
        setSelectedResponse(newResponse);
        setShowQuestionModal(false);
        setShowResultsModal(true);

      } catch (error) {
        console.error('Analysis failed:', error);
        Alert.alert('Analysis Error', 'Failed to analyze your response. Please try again.');
      } finally {
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsRecording(false);
    }
  };

  const moveToNextQuestion = () => {
    setShowResultsModal(false);
    
    if (currentQuestionIndex < currentSession!.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setShowQuestionModal(true);
    } else {
      // Interview complete
      completeSession();
    }
  };

  const completeSession = () => {
    if (!currentSession) return;

    const overallScore = Math.round(
      currentSession.responses.reduce((sum, r) => sum + r.contentAnalysis.overallScore, 0) / 
      currentSession.responses.length
    );

    const completedSession = {
      ...currentSession,
      completedAt: new Date().toISOString(),
      overallScore,
    };

    setPastSessions(prev => [completedSession, ...prev]);
    setCurrentSession(null);
    setShowSetup(true);
    setCurrentQuestionIndex(0);

    Alert.alert(
      'Interview Complete!',
      `Your overall score: ${overallScore}%. Great job! Review your detailed feedback to improve.`
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#F44336';
  };

  const renderSetupScreen = () => (
    <ScrollView style={styles.setupContainer}>
      <Text style={styles.setupTitle}>🎯 AI Interview Preparation</Text>
      <Text style={styles.setupSubtitle}>Get personalized questions and AI-powered feedback</Text>

      <View style={styles.formSection}>
        <Text style={styles.formLabel}>Select Your Domain</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.domainScroll}>
          {DOMAINS.map((domain) => (
            <TouchableOpacity
              key={domain}
              style={[
                styles.domainChip,
                selectedDomain === domain && styles.domainChipSelected,
              ]}
              onPress={() => setSelectedDomain(domain)}
            >
              <Text style={[
                styles.domainChipText,
                selectedDomain === domain && styles.domainChipTextSelected,
              ]}>
                {domain}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {selectedDomain === 'General/Other' && (
          <TextInput
            style={styles.customDomainInput}
            placeholder="Enter your specific domain..."
            value={customDomain}
            onChangeText={setCustomDomain}
          />
        )}
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formLabel}>Experience Level</Text>
        {EXPERIENCE_LEVELS.map((level) => (
          <TouchableOpacity
            key={level}
            style={[
              styles.experienceOption,
              selectedExperience === level && styles.experienceOptionSelected,
            ]}
            onPress={() => setSelectedExperience(level)}
          >
            <View style={[
              styles.experienceRadio,
              selectedExperience === level && styles.experienceRadioSelected,
            ]} />
            <Text style={styles.experienceText}>{level}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formLabel}>Number of Questions</Text>
        <View style={styles.questionCountContainer}>
          {[3, 5, 7, 10].map((count) => (
            <TouchableOpacity
              key={count}
              style={[
                styles.questionCountButton,
                numQuestions === count && styles.questionCountButtonSelected,
              ]}
              onPress={() => setNumQuestions(count)}
            >
              <Text style={[
                styles.questionCountText,
                numQuestions === count && styles.questionCountTextSelected,
              ]}>
                {count}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.startButton, (!selectedDomain || !selectedExperience) && styles.startButtonDisabled]}
        onPress={startNewSession}
        disabled={!selectedDomain || !selectedExperience || isGeneratingQuestions}
      >
        {isGeneratingQuestions ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.startButtonText}>🚀 Start Interview Prep</Text>
        )}
      </TouchableOpacity>

      {pastSessions.length > 0 && (
        <View style={styles.pastSessionsSection}>
          <Text style={styles.pastSessionsTitle}>📊 Past Sessions</Text>
          {pastSessions.slice(0, 3).map((session) => (
            <TouchableOpacity key={session.id} style={styles.pastSessionItem}>
              <View style={styles.pastSessionHeader}>
                <Text style={styles.pastSessionDomain}>{session.domain}</Text>
                <Text style={[
                  styles.pastSessionScore,
                  { color: getScoreColor(session.overallScore || 0) }
                ]}>
                  {session.overallScore}%
                </Text>
              </View>
              <Text style={styles.pastSessionDate}>
                {new Date(session.createdAt).toLocaleDateString()}
              </Text>
              <Text style={styles.pastSessionStats}>
                {session.responses.length} questions completed
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderQuestionModal = () => {
    if (!currentSession) return null;
    
    const currentQuestion = currentSession.questions[currentQuestionIndex];
    
    return (
      <Modal visible={showQuestionModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.questionModalContainer}>
          <View style={styles.questionHeader}>
            <Text style={styles.questionProgress}>
              Question {currentQuestionIndex + 1} of {currentSession.questions.length}
            </Text>
            <View style={styles.questionTypeContainer}>
              <Text style={styles.questionType}>{currentQuestion.type.toUpperCase()}</Text>
              <Text style={styles.questionDifficulty}>{currentQuestion.difficulty.toUpperCase()}</Text>
            </View>
          </View>

          <ScrollView style={styles.questionContent}>
            <Text style={styles.questionText}>{currentQuestion.question}</Text>
            
            {currentQuestion.tips.length > 0 && (
              <View style={styles.tipsSection}>
                <Text style={styles.tipsTitle}>💡 Tips for answering:</Text>
                {currentQuestion.tips.map((tip, index) => (
                  <Text key={index} style={styles.tipText}>• {tip}</Text>
                ))}
              </View>
            )}

            {currentQuestion.expectedStructure && (
              <View style={styles.structureSection}>
                <Text style={styles.structureTitle}>🎯 Recommended Structure:</Text>
                <Text style={styles.structureText}>{currentQuestion.expectedStructure}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.recordingControls}>
            {isAnalyzing ? (
              <View style={styles.analyzingContainer}>
                <ActivityIndicator size="large" color="#3498db" />
                <Text style={styles.analyzingText}>🧠 Analyzing your response...</Text>
                <Text style={styles.analyzingSubtext}>Please wait while we evaluate your answer</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.recordButton, isRecording ? styles.stopButton : styles.startRecordButton]}
                onPress={isRecording ? stopRecording : startRecording}
              >
                <Text style={styles.recordButtonText}>
                  {isRecording ? '⏹️ Stop Recording' : '🎙️ Start Recording'}
                </Text>
                {isRecording && (
                  <Text style={styles.recordingIndicator}>Recording in progress...</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  const renderResultsModal = () => {
    if (!selectedResponse) return null;

    const { contentAnalysis, speechAnalysis } = selectedResponse;

    return (
      <Modal visible={showResultsModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.resultsModalContainer}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>📊 Response Analysis</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowResultsModal(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.resultsContent}>
            {/* Overall Score Banner */}
            <View style={[styles.scoresBanner, { backgroundColor: getScoreColor(contentAnalysis.overallScore) }]}>
              <Text style={styles.overallScoreText}>Overall Score</Text>
              <Text style={styles.overallScoreValue}>{contentAnalysis.overallScore}%</Text>
            </View>

            {/* Detailed Scores */}
            <View style={styles.detailedScores}>
              <View style={styles.scoreRow}>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>Content Relevance</Text>
                  <Text style={[styles.scoreValue, { color: getScoreColor(contentAnalysis.relevanceScore) }]}>
                    {contentAnalysis.relevanceScore}%
                  </Text>
                </View>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>Answer Structure</Text>
                  <Text style={[styles.scoreValue, { color: getScoreColor(contentAnalysis.structureScore) }]}>
                    {contentAnalysis.structureScore}%
                  </Text>
                </View>
              </View>
              
              <View style={styles.scoreRow}>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>Clarity</Text>
                  <Text style={[styles.scoreValue, { color: getScoreColor(contentAnalysis.clarityScore) }]}>
                    {contentAnalysis.clarityScore}%
                  </Text>
                </View>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>Completeness</Text>
                  <Text style={[styles.scoreValue, { color: getScoreColor(contentAnalysis.completenessScore) }]}>
                    {contentAnalysis.completenessScore}%
                  </Text>
                </View>
              </View>
            </View>

            {/* Speech Analysis */}
            <View style={styles.speechAnalysisSection}>
              <Text style={styles.sectionTitle}>🎤 Speech Analysis</Text>
              <View style={styles.speechStats}>
                <View style={styles.speechStat}>
                  <Text style={styles.speechStatValue}>{speechAnalysis?.analysis?.totalFillers || 0}</Text>
                  <Text style={styles.speechStatLabel}>Filler Words</Text>
                </View>
                <View style={styles.speechStat}>
                  <Text style={styles.speechStatValue}>{speechAnalysis?.analysis?.speakingPace || 0}</Text>
                  <Text style={styles.speechStatLabel}>Words/Min</Text>
                </View>
                <View style={styles.speechStat}>
                  <Text style={[
                    styles.speechStatValue,
                    { color: getScoreColor(speechAnalysis?.analysis?.confidenceScore || 0) }
                  ]}>
                    {speechAnalysis?.analysis?.confidenceScore || 0}%
                  </Text>
                  <Text style={styles.speechStatLabel}>Clarity</Text>
                </View>
              </View>
            </View>

            {/* Strengths */}
            <View style={styles.feedbackSection}>
              <Text style={styles.sectionTitle}>💪 Strengths</Text>
              {contentAnalysis.strengths.map((strength, index) => (
                <View key={index} style={styles.strengthItem}>
                  <Text style={styles.strengthText}>✅ {strength}</Text>
                </View>
              ))}
            </View>

            {/* Improvements */}
            <View style={styles.feedbackSection}>
              <Text style={styles.sectionTitle}>🎯 Areas for Improvement</Text>
              {contentAnalysis.improvements.map((improvement, index) => (
                <View key={index} style={styles.improvementItem}>
                  <Text style={styles.improvementText}>🔧 {improvement}</Text>
                </View>
              ))}
            </View>

            {/* Detailed Feedback */}
            <View style={styles.feedbackSection}>
              <Text style={styles.sectionTitle}>🧠 AI Detailed Feedback</Text>
              <View style={styles.detailedFeedbackContainer}>
                <Text style={styles.detailedFeedbackText}>{contentAnalysis.detailedFeedback}</Text>
              </View>
            </View>

            {/* Follow-up Questions */}
            {contentAnalysis.followupQuestions.length > 0 && (
              <View style={styles.feedbackSection}>
                <Text style={styles.sectionTitle}>❓ Potential Follow-up Questions</Text>
                {contentAnalysis.followupQuestions.map((question, index) => (
                  <View key={index} style={styles.followupItem}>
                    <Text style={styles.followupText}>• {question}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Transcript */}
            <View style={styles.feedbackSection}>
              <Text style={styles.sectionTitle}>📝 Your Response Transcript</Text>
              <View style={styles.transcriptContainer}>
                <Text style={styles.transcriptText}>{selectedResponse.transcript}</Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.resultsFooter}>
            <TouchableOpacity
              style={styles.nextButton}
              onPress={moveToNextQuestion}
            >
              <Text style={styles.nextButtonText}>
                {currentQuestionIndex < currentSession!.questions.length - 1 
                  ? '➡️ Next Question' 
                  : '🎉 Complete Interview'
                }
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  if (showSetup) {
    return renderSetupScreen();
  }

  return (
    <View style={styles.container}>
      {renderQuestionModal()}
      {renderResultsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  setupContainer: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  setupTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 8,
  },
  setupSubtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 30,
  },
  formSection: {
    marginBottom: 25,
  },
  formLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12,
  },
  domainScroll: {
    marginBottom: 10,
  },
  domainChip: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 2,
    borderColor: '#ecf0f1',
  },
  domainChipSelected: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  domainChipText: {
    color: '#2c3e50',
    fontWeight: '500',
  },
  domainChipTextSelected: {
    color: 'white',
  },
  customDomainInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginTop: 10,
  },
  experienceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#ecf0f1',
  },
  experienceOptionSelected: {
    borderColor: '#3498db',
    backgroundColor: '#e3f2fd',
  },
  experienceRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#bdc3c7',
    marginRight: 12,
  },
  experienceRadioSelected: {
    borderColor: '#3498db',
    backgroundColor: '#3498db',
  },
  experienceText: {
    fontSize: 16,
    color: '#2c3e50',
  },
  questionCountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  questionCountButton: {
    flex: 1,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 5,
    borderWidth: 2,
    borderColor: '#ecf0f1',
  },
  questionCountButtonSelected: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  questionCountText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  questionCountTextSelected: {
    color: 'white',
  },
  startButton: {
    backgroundColor: '#27ae60',
    padding: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginVertical: 20,
  },
  startButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  startButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pastSessionsSection: {
    marginTop: 20,
  },
  pastSessionsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  pastSessionItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pastSessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pastSessionDomain: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  pastSessionScore: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  pastSessionDate: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  pastSessionStats: {
    fontSize: 14,
    color: '#95a5a6',
  },
  questionModalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  questionHeader: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  questionProgress: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 10,
  },
  questionTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  questionType: {
    backgroundColor: '#3498db',
    color: 'white',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 'bold',
  },
  questionDifficulty: {
    backgroundColor: '#e74c3c',
    color: 'white',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 'bold',
  },
  questionContent: {
    flex: 1,
    padding: 20,
  },
  questionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    lineHeight: 28,
    marginBottom: 20,
  },
  tipsSection: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 10,
  },
  tipText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
    marginBottom: 5,
  },
  structureSection: {
    backgroundColor: '#e8f5e8',
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  structureTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 10,
  },
  structureText: {
    fontSize: 14,
    color: '#2e7d32',
    lineHeight: 20,
  },
  recordingControls: {
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  recordButton: {
    padding: 18,
    borderRadius: 15,
    alignItems: 'center',
  },
  startRecordButton: {
    backgroundColor: '#27ae60',
  },
  stopButton: {
    backgroundColor: '#e74c3c',
  },
  recordButtonText: {
        color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  recordingIndicator: {
    color: 'white',
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
  analyzingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  analyzingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 15,
  },
  analyzingSubtext: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 5,
  },
  resultsModalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  resultsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#7f8c8d',
  },
  resultsContent: {
    flex: 1,
    padding: 20,
  },
  scoresBanner: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  overallScoreText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  overallScoreValue: {
    color: 'white',
    fontSize: 48,
    fontWeight: 'bold',
    marginTop: 5,
  },
  detailedScores: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  scoreItem: {
    flex: 1,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 5,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  speechAnalysisSection: {
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  speechStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  speechStat: {
    alignItems: 'center',
    flex: 1,
  },
  speechStatValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#3498db',
  },
  speechStatLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 5,
  },
  feedbackSection: {
    marginBottom: 20,
  },
  strengthItem: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  strengthText: {
    color: '#2e7d32',
    fontSize: 14,
  },
  improvementItem: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  improvementText: {
    color: '#c62828',
    fontSize: 14,
  },
  detailedFeedbackContainer: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
  },
  detailedFeedbackText: {
    color: '#2c3e50',
    fontSize: 14,
    lineHeight: 20,
  },
  followupItem: {
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  followupText: {
    color: '#e65100',
    fontSize: 14,
  },
  transcriptContainer: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
  },
  transcriptText: {
    color: '#2c3e50',
    fontSize: 14,
    lineHeight: 20,
  },
  resultsFooter: {
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  nextButton: {
    backgroundColor: '#3498db',
    padding: 18,
    borderRadius: 15,
    alignItems: 'center',
  },
  nextButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});