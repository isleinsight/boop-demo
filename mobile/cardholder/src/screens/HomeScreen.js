import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen() {
  const { logout, user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>
        Welcome {user?.first_name || 'Cardholder'}!
      </Text>
      <Button title="Logout" onPress={logout} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  welcome: {
    fontSize: 20,
    marginBottom: 20,
  },
});
