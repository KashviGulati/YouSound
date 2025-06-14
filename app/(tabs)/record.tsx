import React, { useEffect, useState } from 'react';
import { View, Button, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { analyzeAudio } from '../../utils/analyzeAudio';

export default function RecordScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordings, setRecordings] = useState<Array<{
    uri: string;
    duration: number;
    createdAt: string;
    analysis?: any;
  }>>([]);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    requestAudioPermission();
  }, []);

  const requestAudioPermission = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please grant audio recording permission.');
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

      const newRecording = {
        uri: uri!,
        duration,
        createdAt: new Date().toLocaleString(),
      };

      setRecordings(prev => [...prev, newRecording]);
      setRecording(null);

      // 🧠 ML: Analyze audio with AssemblyAI
      const analysis = await analyzeAudio(uri!);
      console.log('🧠 Transcript:', analysis?.text || 'No transcript available');

      // Update last recording with analysis
      setRecordings(prev => [
        ...prev.slice(0, -1),
        { ...newRecording, analysis },
      ]);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const handlePlay = async (uri: string) => {
    try {
      const { sound } = await Audio.Sound.createAsync({ uri });
      await sound.playAsync();
    } catch (error) {
      console.error('Playback failed:', error);
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>🎤 Voice Recorder</Text>

      <View style={styles.controls}>
        <Button
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
          onPress={isRecording ? stopRecording : startRecording}
          color={isRecording ? 'red' : 'green'}
        />
      </View>

      <View style={styles.recordingList}>
        {recordings.length === 0 ? (
          <Text style={styles.noRecordings}>No recordings yet</Text>
        ) : (
          recordings.map((rec, index) => (
            <View key={index} style={styles.recordItem}>
              <Text>{`🎧 Recording ${index + 1}`}</Text>
              <Text>{`🕒 Duration: ${(rec.duration / 1000).toFixed(2)}s`}</Text>
              <Text>{`📅 Time: ${rec.createdAt}`}</Text>
              {rec.analysis?.text && (
                <Text style={styles.transcript}>{`🧠 Transcript: ${rec.analysis.text}`}</Text>
              )}
              <View style={styles.buttonGroup}>
                <Button title="Play" onPress={() => handlePlay(rec.uri)} />
                <View style={{ width: 10 }} />
                <Button
                  title="Delete"
                  onPress={() => handleDelete(index)}
                  color="#cc0000"
                />
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#fff',
    flexGrow: 1,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  controls: {
    marginBottom: 30,
  },
  recordingList: {
    marginTop: 10,
  },
  recordItem: {
    marginBottom: 20,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    borderColor: '#ccc',
  },
  noRecordings: {
    textAlign: 'center',
    color: '#666',
  },
  transcript: {
    marginTop: 8,
    fontStyle: 'italic',
    color: '#333',
  },
  buttonGroup: {
    flexDirection: 'row',
    marginTop: 10,
  },
});
