import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { getTrackingState, startBackgroundTracking, stopBackgroundTracking } from './backgroundLocation';
import { foregroundState, startForegroundTracking } from './foregroundLocation';

type Props = { shiftId: number; endsAt: string; paused: boolean };
export default function LiveLocation({ shiftId, endsAt, paused }: Props) {
  const [advanced,setAdvanced]=useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Choose how to share your location.');
  useEffect(() => {
    let alive = true;
    let checking = false;
    async function refresh() {
      if (checking) return;
      checking = true;
      try {
        const foreground = foregroundState(shiftId);
        const state = foreground.enabled ? foreground : await getTrackingState(shiftId);
        if (alive) { setEnabled(state.enabled); setMessage(state.message); }
      } catch (error) { if (alive) setMessage(error instanceof Error ? error.message : 'Could not read sharing status.'); }
      finally { checking = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [shiftId]);
  async function change(mode: 'foreground' | 'background' | 'stop') {
    setBusy(true);
    try {
      await stopBackgroundTracking();
      if (mode !== 'stop') {
        if (Date.now() >= Date.parse(endsAt)) throw new Error('This shift has ended.');
        if (mode === 'foreground') await startForegroundTracking(shiftId);
        else await startBackgroundTracking(shiftId);
      }
      setEnabled(mode !== 'stop');
      setMessage(mode === 'stop' ? 'Sharing stopped.' : 'Sharing started. Waiting for a GPS upload.');
    } catch (error) { setEnabled(false); setMessage(error instanceof Error ? error.message : 'Could not start sharing.'); }
    finally { setBusy(false); }
  }
  function button(title: string, mode: 'foreground' | 'background' | 'stop') {
    return <Pressable accessibilityRole="button" disabled={busy || paused}
      style={{ backgroundColor: '#293b53', padding: 14, borderRadius: 8, marginTop: 10, opacity: busy || paused ? 0.5 : 1 }}
      onPress={() => mode === 'stop' ? void change(mode) : Alert.alert('Share your location?', mode === 'foreground'
        ? 'Your location will be sent during this shift while the app is open. Switching apps or locking the phone stops this mode.'
        : 'Share during this shift even when the screen is locked. Requires an installed development build and background location permission. You can stop sharing at any time.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Start sharing', onPress: () => void change(mode) }])}>
      <Text style={{ color: '#fff', textAlign: 'center' }}>{busy ? 'Please wait…' : title}</Text>
    </Pressable>;
  }
  return <View style={{ padding: 16, backgroundColor: '#eff5fa', borderRadius: 10, marginBottom: 14 }}>
    <Text style={{ color: '#203b58', fontWeight: '600', marginBottom: 10 }}>Shift GPS sharing</Text>
    <Text style={{ color: '#34465b', lineHeight: 21 }}>{message}</Text>
    {enabled ? button('Stop sharing', 'stop') : <>{button('Share while app is open', 'foreground')}<Pressable accessibilityRole="button" onPress={()=>setAdvanced(a=>!a)} style={{paddingVertical:14}}><Text style={{color:'#34465b'}}>Advanced location options {advanced?'−':'+'}</Text></Pressable>{advanced&&button('Share in background (installed build)', 'background')}</>}
  </View>;
}
