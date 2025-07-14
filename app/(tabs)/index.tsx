import { View, Text, Button, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎙️ Welcome to YouSound!</Text>

      <Link href="/record" asChild>
        <Button title="Go to Recorder" />
      </Link>

      <View style={{ marginTop: 20 }}>
        <Link href="/interview" asChild>
          <Button title="AI Interview Assistant" />
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
});
