import React, { useState } from 'react';
import { SafeAreaView, View, Text, TextInput, Button } from 'react-native';
import { endpoints, setToken, setUser } from '@payulot/shared';

export default function App(){
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [status, setStatus] = useState('');

  async function login(){
    setStatus('Signing in…');
    const { ok, data } = await endpoints.login(email.trim().toLowerCase(), pw);
    if (!ok) { setStatus(data?.message || 'Login failed'); return; }
    if (data?.token) await setToken(data.token);
    if (data?.user)  await setUser(data.user);
    setStatus('OK');
  }

  return (
    <SafeAreaView style={{ flex:1, padding:16, gap:8 }}>
      <Text style={{ fontSize:22, fontWeight:'700' }}>Cardholder Login</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none"
        style={{ borderWidth:1, borderColor:'#ddd', padding:10, borderRadius:8 }} />
      <TextInput value={pw} onChangeText={setPw} placeholder="Password" secureTextEntry
        style={{ borderWidth:1, borderColor:'#ddd', padding:10, borderRadius:8 }} />
      <Button title="Sign in" onPress={login} />
      <Text>{status}</Text>
    </SafeAreaView>
  );
}
