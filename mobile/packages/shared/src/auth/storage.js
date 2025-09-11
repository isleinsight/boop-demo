import AsyncStorage from '@react-native-async-storage/async-storage';
const TOKEN_KEY = 'boop_jwt';
const USER_KEY = 'boopUser';

export async function setToken(t){ return AsyncStorage.setItem(TOKEN_KEY, t || ''); }
export async function getToken(){ return AsyncStorage.getItem(TOKEN_KEY); }
export async function clearToken(){ return AsyncStorage.removeItem(TOKEN_KEY); }

export async function setUser(u){ return AsyncStorage.setItem(USER_KEY, JSON.stringify(u || {})); }
export async function getUser(){ const s = await AsyncStorage.getItem(USER_KEY); try { return JSON.parse(s||'{}'); } catch { return {}; } }
export async function clearUser(){ return AsyncStorage.removeItem(USER_KEY); }

export async function signOutAll(){ await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]); }
