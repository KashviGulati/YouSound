import React, { useEffect, useState } from 'react';
import { 
  View, 
  Button, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Alert,
  TouchableOpacity,
  Modal,
  Dimensions
} from 'react-native';
import { Audio } from 'expo-av';
import { analyzeAudio } from '../../utils/analyzeAudio';

let soundObject: Audio.Sound | null = null;

interface Recording {
  uri: string;
  duration: number;
  createdAt: string;
  analysis?: {
    text: string;
    analysis: {
      totalFillers: number;
      fillerRate: number;
      mostUsedFillers: { word: string; count: number }[];
      longPauses: { start: number; end: number; duration: number }[];
      speakingPace: number;
      confidenceScore: number;
      feedback: string[];
      recommendations: string[];
    };
    fillers: any[];
    highlights?: any[]; // Add this to handle AssemblyAI highlights
  };
}

export default function RecordScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    requestAudioPermission();
    configureAudio();
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
      if (!recording) return;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      const { sound, status } = await recording.createNewLoadedSoundAsync();
      if (!status.isLoaded) {
        console.warn('Failed to load recording for playback.');
        return;
      }

      const duration = (status as any).durationMillis ?? 0;

      const newRecording: Recording = {
        uri: uri!,
        duration,
        createdAt: new Date().toLocaleString(),
      };

      setRecordings(prev => [...prev, newRecording]);
      setRecording(null);

      // Start analysis
      setIsAnalyzing(true);
      try {
        const analysis = await analyzeAudio(uri!);
        console.log('🧠 Analysis completed:', JSON.stringify(analysis, null, 2));

        if (analysis) {
          // Update the recording with analysis, making sure we handle the structure properly
          setRecordings(prev => [
            ...prev.slice(0, -1),
            { ...newRecording, analysis },
          ]);
        }
      } catch (error) {
        console.error('Analysis failed:', error);
        Alert.alert('Analysis Error', 'Failed to analyze the recording. Please try again.');
      } finally {
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsRecording(false);
    }
  };

  const handlePlay = async (uri: string) => {
    try {
      if (soundObject) {
        await soundObject.unloadAsync();
        soundObject = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );

      soundObject = sound;
      await sound.playAsync();
    } catch (error) {
      console.error('❌ Playback failed:', error);
      Alert.alert('Playback Error', 'Could not play the audio.');
    }
  };

  const handleDelete = (index: number) => {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            setRecordings(prev => prev.filter((_, i) => i !== index)),
        },
      ]
    );
  };

  const openAnalysis = (recording: Recording) => {
    setSelectedRecording(recording);
    setShowAnalysis(true);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4CAF50'; // Green
    if (score >= 60) return '#FF9800'; // Orange
    return '#F44336'; // Red
  };

  // Helper function to safely get analysis data
  const getAnalysisData = (recording: Recording) => {
    const defaultAnalysis = {
      totalFillers: 0,
      fillerRate: 0,
      mostUsedFillers: [],
      longPauses: [],
      speakingPace: 0,
      confidenceScore: 0,
      feedback: ['Analysis data not available'],
      recommendations: ['Please try recording again for detailed analysis'],
    };

    if (!recording.analysis) return defaultAnalysis;

    // If analysis.analysis exists, use it directly
    if (recording.analysis.analysis) {
      const analysis = recording.analysis.analysis;
      
      // Calculate total fillers from commonFillerCounts
      const commonFillers = analysis.commonFillerCounts || {};
      const totalFromCommon = Object.values(commonFillers).reduce((sum: number, count: number) => sum + count, 0);
      
      // Get most used fillers from commonFillerCounts
      const mostUsedFillers = Object.entries(commonFillers)
        .filter(([word, count]) => count > 0)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count);

      return {
        totalFillers: totalFromCommon,
        fillerRate: analysis.fillerRate || Math.round(totalFromCommon / (recording.duration / 60000)), // per minute
        mostUsedFillers,
        longPauses: analysis.longPauses || [],
        speakingPace: analysis.speakingPace || 0,
        confidenceScore: analysis.confidenceScore || 0,
        feedback: analysis.feedback || [],
        recommendations: analysis.recommendations || [],
      };
    }

    return defaultAnalysis;
  };

  const renderAnalysisModal = () => {
    if (!selectedRecording?.analysis) return null;

    const analysis = getAnalysisData(selectedRecording);
    const transcript = selectedRecording.analysis.text || 'Transcript not available';
    const rawAnalysis = selectedRecording.analysis.analysis;
    const pronunciationIssues = rawAnalysis?.pronunciationIssues || [];
    const commonFillers = rawAnalysis?.commonFillerCounts || {};

    return (
      <Modal
        visible={showAnalysis}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📊 Speech Analysis Report</Text>
            <TouchableOpacity
              onPress={() => setShowAnalysis(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Quick Overview Banner */}
            <View style={styles.overviewBanner}>
              <Text style={styles.overviewTitle}>📋 Quick Overview</Text>
              <Text style={styles.overviewText}>
                Overall Performance: <Text style={[styles.overviewScore, { color: getScoreColor(analysis.confidenceScore) }]}>
                  {analysis.confidenceScore >= 80 ? 'Excellent' : analysis.confidenceScore >= 60 ? 'Good' : 'Needs Work'}
                </Text>
              </Text>
            </View>

            {/* Key Metrics Cards */}
            <View style={styles.statsContainer}>
              <View style={[styles.statCard, styles.primaryStat]}>
                <Text style={styles.statValue}>{analysis.totalFillers}</Text>
                <Text style={styles.statLabel}>Total Fillers</Text>
                <Text style={styles.statSubtext}>
                  {analysis.totalFillers <= 2 ? '🎉 Great!' : analysis.totalFillers <= 5 ? '👍 Good' : '⚠️ Focus area'}
                </Text>
              </View>
              <View style={[styles.statCard, styles.primaryStat]}>
                <Text style={styles.statValue}>{analysis.fillerRate}</Text>
                <Text style={styles.statLabel}>Fillers/Min</Text>
                <Text style={styles.statSubtext}>
                  {analysis.fillerRate <= 3 ? '🎯 Excellent' : '📈 Can improve'}
                </Text>
              </View>
              <View style={[styles.statCard, styles.primaryStat]}>
                <Text style={styles.statValue}>{analysis.speakingPace}</Text>
                <Text style={styles.statLabel}>Words/Min</Text>
                <Text style={styles.statSubtext}>
                  {analysis.speakingPace >= 120 && analysis.speakingPace <= 160 ? '✅ Perfect' : '⚡ Adjust pace'}
                </Text>
              </View>
              <View style={[styles.statCard, styles.primaryStat]}>
                <Text style={[styles.statValue, { color: getScoreColor(analysis.confidenceScore) }]}>
                  {analysis.confidenceScore}%
                </Text>
                <Text style={styles.statLabel}>Clarity Score</Text>
                <Text style={styles.statSubtext}>
                  {analysis.confidenceScore >= 90 ? '🌟 Crystal clear' : '🔧 Room to grow'}
                </Text>
              </View>
            </View>

            {/* Detailed Filler Analysis */}
            {Object.keys(commonFillers).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎯 Filler Words Breakdown</Text>
                <View style={styles.fillerGrid}>
                  {Object.entries(commonFillers).map(([word, count], index) => (
                    <View key={index} style={[
                      styles.fillerGridItem,
                      count > 0 ? styles.fillerUsed : styles.fillerUnused
                    ]}>
                      <Text style={styles.fillerGridWord}>"{word}"</Text>
                      <Text style={styles.fillerGridCount}>{count}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Most Used Fillers (Top Offenders) */}
            {analysis.mostUsedFillers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🚨 Top Filler Words</Text>
                {analysis.mostUsedFillers.map((filler, index) => (
                  <View key={index} style={styles.topFillerItem}>
                    <View style={styles.fillerRank}>
                      <Text style={styles.fillerRankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.fillerDetails}>
                      <Text style={styles.fillerWord}>"{filler.word}"</Text>
                      <Text style={styles.fillerDescription}>Used {filler.count} time{filler.count !== 1 ? 's' : ''}</Text>
                    </View>
                    <View style={styles.fillerCount}>
                      <Text style={styles.fillerCountText}>{filler.count}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Pronunciation Issues */}
            {pronunciationIssues.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🗣️ Pronunciation Insights</Text>
                {pronunciationIssues.map((issue, index) => (
                  <View key={index} style={styles.pronunciationItem}>
                    <Text style={styles.pronunciationWord}>"{issue.word}"</Text>
                    <View style={styles.confidenceBar}>
                      <View style={[
                        styles.confidenceBarFill, 
                        { 
                          width: `${issue.confidence * 100}%`,
                          backgroundColor: getScoreColor(issue.confidence * 100)
                        }
                      ]} />
                    </View>
                    <Text style={styles.confidenceText}>{Math.round(issue.confidence * 100)}%</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Long Pauses Timeline */}
            {analysis.longPauses.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>⏸️ Pause Analysis ({analysis.longPauses.length} detected)</Text>
                <View style={styles.pauseTimeline}>
                  {analysis.longPauses.map((pause, index) => (
                    <View key={index} style={styles.pauseTimelineItem}>
                      <View style={styles.pauseMarker} />
                      <View style={styles.pauseContent}>
                        <Text style={styles.pauseTime}>
                          {(pause.start / 1000).toFixed(1)}s - {(pause.end / 1000).toFixed(1)}s
                        </Text>
                        <Text style={styles.pauseDuration}>
                          {(pause.duration / 1000).toFixed(1)}s pause
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* AI Feedback */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💬 AI Feedback</Text>
              {analysis.feedback.map((item, index) => (
                <View key={index} style={styles.feedbackItem}>
                  <Text style={styles.feedbackText}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Personalized Recommendations */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💡 Personalized Recommendations</Text>
              {analysis.recommendations.map((item, index) => (
                <View key={index} style={styles.recommendationItem}>
                  <View style={styles.recommendationBullet} />
                  <Text style={styles.recommendationText}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Transcript with Word Timing */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📝 Full Transcript</Text>
              <View style={styles.transcriptContainer}>
                <Text style={styles.transcriptText}>{transcript}</Text>
              </View>
            </View>

            {/* Performance Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>🎯 Performance Summary</Text>
              <Text style={styles.summaryText}>
                You spoke for {(selectedRecording.duration / 1000).toFixed(1)} seconds with {analysis.totalFillers} filler words, 
                maintaining a pace of {analysis.speakingPace} words per minute. 
                {analysis.confidenceScore >= 85 
                  ? " Excellent work on clarity and articulation! 🌟" 
                  : " Keep practicing to improve your clarity and reduce fillers. 💪"
                }
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>🎤 Interview Prep Recorder</Text>
      <Text style={styles.subtitle}>Practice and analyze your speech patterns</Text>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording ? styles.stopButton : styles.startButton]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={isAnalyzing}
        >
          <Text style={styles.recordButtonText}>
            {isRecording ? '⏹️ Stop Recording' : '🎙️ Start Recording'}
          </Text>
        </TouchableOpacity>
      </View>

      {isAnalyzing && (
        <View style={styles.analyzingContainer}>
          <Text style={styles.analyzingText}>🧠 Analyzing your speech...</Text>
          <Text style={styles.analyzingSubtext}>This may take a moment</Text>
        </View>
      )}

      <View style={styles.recordingList}>
        {recordings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🎯</Text>
            <Text style={styles.emptyStateText}>No recordings yet</Text>
            <Text style={styles.emptyStateSubtext}>Start practicing your presentation skills!</Text>
          </View>
        ) : (
          recordings.map((rec, index) => {
            const analysisData = getAnalysisData(rec);
            
            return (
              <View key={index} style={styles.recordItem}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordTitle}>🎧 Recording {index + 1}</Text>
                  <Text style={styles.recordTime}>{rec.createdAt}</Text>
                </View>
                
                <Text style={styles.recordDuration}>
                  Duration: {(rec.duration / 1000).toFixed(2)}s
                </Text>

                {rec.analysis && (
                  <View style={styles.quickStats}>
                    <View style={styles.quickStat}>
                      <Text style={styles.quickStatValue}>{analysisData.totalFillers}</Text>
                      <Text style={styles.quickStatLabel}>Fillers</Text>
                    </View>
                    <View style={styles.quickStat}>
                      <Text style={styles.quickStatValue}>{analysisData.speakingPace}</Text>
                      <Text style={styles.quickStatLabel}>WPM</Text>
                    </View>
                    <View style={styles.quickStat}>
                      <Text style={[
                        styles.quickStatValue, 
                        { color: getScoreColor(analysisData.confidenceScore) }
                      ]}>
                        {analysisData.confidenceScore}%
                      </Text>
                      <Text style={styles.quickStatLabel}>Clarity</Text>
                    </View>
                  </View>
                )}

                <View style={styles.buttonGroup}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handlePlay(rec.uri)}
                  >
                    <Text style={styles.actionButtonText}>▶️ Play</Text>
                  </TouchableOpacity>
                  
                  {rec.analysis && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.analysisButton]}
                      onPress={() => openAnalysis(rec)}
                    >
                      <Text style={styles.actionButtonText}>📊 Analysis</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDelete(index)}
                  >
                    <Text style={styles.actionButtonText}>🗑️ Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {renderAnalysisModal()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#f8f9fa',
    flexGrow: 1,
  },
  heading: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#2c3e50',
  },
  subtitle: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 30,
  },
  controls: {
    marginBottom: 30,
    alignItems: 'center',
  },
  recordButton: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 200,
    alignItems: 'center',
  },
  startButton: {
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
  analyzingContainer: {
    backgroundColor: '#3498db',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  analyzingText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  analyzingSubtext: {
    color: 'white',
    fontSize: 14,
    opacity: 0.8,
  },
  recordingList: {
    marginTop: 10,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 5,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#7f8c8d',
  },
  recordItem: {
    marginBottom: 20,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recordTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  recordTime: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  recordDuration: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 15,
  },
  quickStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
    paddingVertical: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  quickStat: {
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 5,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#3498db',
  },
  analysisButton: {
    backgroundColor: '#9b59b6',
  },
  deleteButton: {
    backgroundColor: '#e74c3c',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e74c3c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryStat: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 5,
  },
  statSubtext: {
    fontSize: 10,
    color: '#95a5a6',
    marginTop: 2,
    textAlign: 'center',
  },
  overviewBanner: {
    backgroundColor: '#3498db',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  overviewTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  overviewText: {
    color: 'white',
    fontSize: 14,
  },
  overviewScore: {
    fontWeight: 'bold',
  },
  fillerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  fillerGridItem: {
    width: '48%',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  fillerUsed: {
    backgroundColor: '#fff3cd',
    borderWidth: 2,
    borderColor: '#ffc107',
  },
  fillerUnused: {
    backgroundColor: '#e8f5e8',
    borderWidth: 2,
    borderColor: '#4caf50',
  },
  fillerGridWord: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  fillerGridCount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  topFillerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fillerRank: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffc107',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fillerRankText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  fillerDetails: {
    flex: 1,
  },
  fillerDescription: {
    fontSize: 12,
    color: '#856404',
    marginTop: 2,
  },
  pronunciationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  pronunciationWord: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1565c0',
    minWidth: 80,
  },
  confidenceBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1565c0',
    minWidth: 35,
  },
  pauseTimeline: {
    paddingLeft: 10,
  },
  pauseTimelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pauseMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff9800',
    marginRight: 12,
  },
  pauseContent: {
    flex: 1,
  },
  pauseTime: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e65100',
  },
  pauseDuration: {
    fontSize: 12,
    color: '#f57c00',
    marginTop: 2,
  },
  recommendationBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff9800',
    marginRight: 12,
    marginTop: 8,
  },
  transcriptContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  summaryCard: {
    backgroundColor: '#e8f5e8',
    padding: 20,
    borderRadius: 15,
    marginTop: 10,
    marginBottom: 20,
    borderLeftWidth: 5,
    borderLeftColor: '#4caf50',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 15,
    color: '#2e7d32',
    lineHeight: 22,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 15,
  },
  fillerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  fillerWord: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
  },
  fillerCount: {
    backgroundColor: '#ffc107',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  fillerCountText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  pauseItem: {
    backgroundColor: '#e3f2fd',
    padding: 10,
    borderRadius: 6,
    marginBottom: 5,
    color: '#1565c0',
    fontSize: 14,
  },
  feedbackItem: {
    backgroundColor: '#e8f5e8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  feedbackText: {
    fontSize: 15,
    color: '#2e7d32',
    lineHeight: 20,
  },
  recommendationItem: {
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
  },
  recommendationText: {
    fontSize: 15,
    color: '#e65100',
    lineHeight: 20,
  },
  transcriptText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#2c3e50',
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
  },
});