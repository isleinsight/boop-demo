import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState('');

  const onSubmit = async () => {
    setErr('');
    if (!email || !password) {
      setErr('Enter email and password');
      return;
    }
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={{ flex: 1, backgroundColor: '#0b1220' }}>
      <View style={styles.container}>
        <Text style={styles.brand}>Payulot</Text>
        <Text style={styles.title}>Sign in</Text>

        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor="#8ea0bf"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#8ea0bf"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {!!err && <Text style={styles.error}>{err}</Text>}

        <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]} onPress={onSubmit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continue</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  brand: { color: '#eaf0ff', fontSize: 24, marginBottom: 6, fontWeight: '700' },
  title: { color: '#cbd5e1', fontSize: 16, marginBottom: 16 },
  input: {
    width: '100%',
    backgroundColor: '#10192d',
    borderColor: '#26344f',
    borderWidth: 1,
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12
  },
  btn: { width: '100%', backgroundColor: '#2f80ed', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  error: { color: '#ffb4b4', marginBottom: 10 }
});
