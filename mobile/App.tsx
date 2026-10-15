import DutyPanel from './src/DutyPanel';
import LocationCheck from './src/LocationCheck';
import WelcomeLock from './src/WelcomeLock';
import RoundsPanel from './src/RoundsPanel';
import { stopBackgroundTracking } from './src/backgroundLocation';
import LiveLocation from './src/LiveLocation';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  api,
  APIError,
  clearSession,
  getSession,
  login,
  logout,
  type Shift as BaseShift,
  type User,
} from './src/api';

import {
  clockIn,
  clockOutWithGPS,
  clockOutWithoutGPS,
} from './src/attendance';

type Shift = BaseShift & {completed_rounds?:number;required_rounds?:number};

type ShiftPage = {
  count: number;
  next: string | null;
  results: Shift[];
};

export default function App() {
  const [history,setHistory]=useState(false);
  const [section,setSection]=useState<'duty'|'patrol'|'report'>('duty');
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reasonShift, setReasonShift] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [welcome,setWelcome]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const lock = useRef(false);
  const [actionShift,setActionShift] = useState<number|null>(null);
  const [opened,setOpened] = useState<number|null>(null);
  const [now,setNow] = useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);},[]);

  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await task();
    } catch (err) {
      if (err instanceof APIError && err.status === 401) {
        await stopBackgroundTracking();
        setUser(null);
        setShifts([]);
        try {
          await clearSession();
        } catch {
          // The next login will replace the saved session.
        }
      }

      setError(
        err instanceof Error ? err.message : 'Something went wrong. Try again.'
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function loadShifts(targetPage = 1, showHistory = history) {
    const result = await api<ShiftPage>(
      `/api/duty/mine/?page=${targetPage}&history=${showHistory?1:0}`
    );
    setShifts(result.results);
    setPage(targetPage);
    setHasNext(Boolean(result.next));
  }

  async function restore() {
    if (!(await getSession())) return;

    const currentUser = await api<User>('/api/auth/me/');

    if (currentUser.role !== 'guard') {
      await stopBackgroundTracking();
                await logout();
      throw new Error('Use a guard account here. Administrators use the dashboard.');
    }

    setUser(currentUser);
    await loadShifts();
  }

  useEffect(() => {
    void run(restore);
  }, []);

  async function signIn() {
    if (!username.trim() || !password) {
      throw new Error('Enter your username and password.');
    }

    await stopBackgroundTracking();
    await login(username.trim(), password);
    setPassword('');
    await restore();
    setWelcome(true);
  }

  async function refreshAfterAttendance(successMessage: string) {
    setReasonShift(null);
    setReason('');
    setMessage(successMessage);

    try {
      await loadShifts(page);
    } catch {
      setError(
        'Attendance was saved, but the shift list could not refresh. Tap Refresh.'
      );
    }
  }

  function submitAttendance(
    shift: Shift,
    action: 'in' | 'out' | 'unverified'
  ) {
    setActionShift(shift.id);
    void run(async () => {
      if (action === 'in') {
        await clockIn(shift.id, shift.site.max_accuracy_metres);
        setOpened(shift.id);setSection('patrol');
        await refreshAfterAttendance('You are clocked in. Enable location sharing, then start your scheduled round below.');
      } else if (action === 'out') {
        await clockOutWithGPS(shift.id, shift.site.max_accuracy_metres);
        await stopBackgroundTracking();
        setHistory(true);setSection('report');await loadShifts(1,true);const completedShift=await api<Shift>('/api/duty/mine/?shift='+shift.id);setShifts(rows=>rows.some(s=>s.id===shift.id)?rows: [...rows,completedShift]);setMessage('Shift complete. Review and submit your report.');
      } else {
        await clockOutWithoutGPS(shift.id, reason);
        await stopBackgroundTracking();
        setHistory(true);setSection('report');await loadShifts(1,true);const completedShift=await api<Shift>('/api/duty/mine/?shift='+shift.id);setShifts(rows=>rows.some(s=>s.id===shift.id)?rows: [...rows,completedShift]);setMessage('Shift complete — clock-out location unverified. Submit your report.');
      }
    });
  }

  function confirmUnverified(shift: Shift) {
    if (!reason.trim()) {
      setError('Enter your reason first.');
      return;
    }

    if(Platform.OS==='web'){if(globalThis.confirm('Clock out with an unverified location? Your reason will be saved.'))submitAttendance(shift,'unverified');return;}
    Alert.alert(
      'Clock out without GPS?',
      'Your clock-out and reason will be recorded as GPS unverified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm clock-out',
          onPress: () => submitAttendance(shift, 'unverified'),
        },
      ]
    );
  }

  function button(
    label: string,
    onPress: () => void,
    secondary = false
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onPress}
        style={[
          styles.button,
          secondary && styles.secondary,
          busy && styles.disabled,
        ]}
      >
        <Text style={[styles.buttonText, secondary && styles.lightText]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  const formatDate = (value: string) => new Date(value).toLocaleString('en-GB',{timeZone:'Africa/Harare',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      {welcome&&user&&<WelcomeLock name={user.first_name||user.username} onDone={()=>setWelcome(false)}/>}
      <ScrollView
        contentContainerStyle={[styles.container,!user&&styles.loginContainer]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>SENTINEL</Text>
        <Text style={styles.subtitle}>YOUR SHIFT. YOUR PATROL.</Text>

        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}

        {!!message && (
          <Text accessibilityRole="alert" style={styles.success}>
            {message}
          </Text>
        )}

        {busy && (
          <View style={styles.loading}>
            <ActivityIndicator color="#f4a15a" />
            <Text style={styles.muted}>
              {user?'Please wait. Location checks may take a few seconds.':'Checking your account…'}
            </Text>
          </View>
        )}

        {!user ? (
          <View style={styles.card}>
            <View style={styles.lockBadge}><Text style={styles.lockLetter}>S</Text></View>
            <Text style={styles.eyebrow}>GUARD ACCESS</Text>
            <Text style={styles.heading}>Welcome back.</Text>
            <Text style={styles.muted}>Sign in with the guard account your supervisor gave you.</Text>

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              textContentType="username"
              placeholder="Your username"
              placeholderTextColor="#8292aa"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              editable={!busy}
              textContentType="password"
              placeholder="Your password"
              placeholderTextColor="#8292aa"
            />

            <Pressable accessibilityRole="button" onPress={()=>setShowPassword(v=>!v)} style={{paddingVertical:10,marginBottom:12}}><Text style={styles.muted}>{showPassword?'Hide password':'Show password'}</Text></Pressable>
            {button(busy?'Signing in…':'Sign in to my shift', () => void run(signIn))}
            <Text style={styles.muted}>Need access? Ask your supervisor for your guard username and password.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.heading}>
              Hello, {user.first_name || user.username}.
            </Text>

            <View style={styles.hero}><Text style={styles.heroLabel}>YOUR DUTY DESK</Text><Text style={styles.heroTitle}>{shifts.some(s=>s.attendance&&!s.attendance.clocked_out_at)?'On duty. Stay connected.':'Your day, organised.'}</Text><Text style={styles.heroText}>Open your shift to clock in. Your supervisor sees your attendance after it is saved.</Text></View>
            <View style={styles.tabs}>{button(history?'Upcoming shifts':'● Upcoming',()=>{setHistory(false);void run(()=>loadShifts(1,false));},true)}{button(history?'● History':'Shift history',()=>{setHistory(true);void run(()=>loadShifts(1,true));},true)}</View>
            {button('Refresh shifts', () => void run(() => loadShifts(page)), true)}

            {shifts.length === 0 && (
              <Text style={styles.muted}>No shifts assigned yet. Ask your supervisor to assign your site and shift, then tap Refresh shifts.</Text>
            )}

            <Text style={styles.muted}>1. Clock in at your site   2. Complete your rounds   3. Clock out</Text>
            {[...shifts].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)||a.id-b.id).map((shift) => {
              const attendance = shift.attendance;
              const active = Boolean(attendance && !attendance.clocked_out_at);
              const completed = Boolean(attendance?.clocked_out_at);

              const label = active
                ? 'ON DUTY'
                : completed
                  ? 'SHIFT COMPLETE'
                  : shift.status.toUpperCase();

              const expanded = opened === shift.id;
              const opensAt = Date.parse(shift.starts_at) - 15 * 60 * 1000;
              const endsAt = Date.parse(shift.ends_at);
              const canClockIn =
                !attendance &&
                shift.status === 'scheduled' &&
                now >= opensAt &&
                now < endsAt;

              return (
                <View key={shift.id} style={styles.card}>
                  <Text style={[styles.badge,active&&{color:'#13805c'},completed&&{color:'#315c97'}]}>{label}</Text>
                  <Text style={styles.heading}>{shift.site.name}</Text>
                  <Text style={styles.muted}>{formatDate(shift.starts_at)} – {formatDate(shift.ends_at)}</Text>
                  <Text style={styles.muted}>{shift.completed_rounds??0} / {shift.required_rounds??0} patrol rounds completed</Text>
                  {button(active?'Open active shift →':'View shift →',()=>{setOpened(shift.id);setSection(active?'patrol':completed?'report':'duty');setError('');setMessage('');},true)}
                  {expanded && <Modal visible transparent animationType="fade" onRequestClose={()=>{if(!busy)setOpened(null);}}>
                    <View style={styles.overlay}><View style={styles.dialog}>
                    {button('Close',()=>setOpened(null),true)}
                    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:16}}>
                    <Text style={styles.heading}>{shift.site.name}</Text>
                    <Text style={styles.muted}>{shift.site.address}</Text>
                    {actionShift===shift.id&&busy&&<View style={styles.loading}><ActivityIndicator color="#db751b"/><Text style={styles.text}>Checking location and saving attendance… Allow location when asked. This can take up to 30 seconds.</Text></View>}
                    {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                    {!!message&&<Text accessibilityRole="alert" style={styles.success}>{message}</Text>}
                    <View style={styles.tabs}>{button('Duty',()=>setSection('duty'),section!=='duty')}{button('Patrol',()=>setSection('patrol'),section!=='patrol')}{button('Report',()=>setSection('report'),section!=='report')}</View>
                    {section==='duty'&&<Text style={styles.muted}>Location must be near this site and accurate within {shift.site.max_accuracy_metres}m. Laptop location may be too approximate; a phone is better for the walking test.</Text>}
                  {section==='duty'&&<>
                  <Text style={styles.badge}>SHIFT TIMES · ZIMBABWE</Text>
                  <Text style={styles.text}>
                    Starts: {formatDate(shift.starts_at)}
                  </Text>
                  <Text style={styles.text}>
                    Ends: {formatDate(shift.ends_at)}
                  </Text>

                  {!!shift.notes && (
                    <Text style={styles.muted}>{shift.notes}</Text>
                  )}

                  {!!attendance && (
                    <Text style={styles.text}>
                      Clocked in: {formatDate(attendance.clocked_in_at)}
                    </Text>
                  )}

                  {completed && attendance?.clocked_out_at && (
                    <>
                      <Text style={styles.text}>
                        Clocked out: {formatDate(attendance.clocked_out_at)}
                      </Text>
                      <Text style={styles.muted}>
                        {attendance.clock_out_gps_verified
                          ? 'Clock-out GPS verified'
                          : 'Clock-out GPS unverified'}
                      </Text>
                    </>
                  )}

                  {!attendance&&<LocationCheck site={shift.site}/>}
                  {canClockIn &&
                    button('Clock in with GPS', () =>
                      submitAttendance(shift, 'in')
                    )}

                  {!attendance && shift.status === 'scheduled' && !canClockIn && (
                    <Text style={styles.muted}>
                      Clock-in opens 15 minutes before the shift and closes when
                      the shift ends. Tap Refresh when it is time.
                    </Text>
                  )}

                  {active && (
                    <>
                      <LiveLocation
                        shiftId={shift.id}
                        endsAt={shift.ends_at}
                        paused={busy}
                      />


                      <Text style={styles.heading}>End your shift</Text>
                      {button('Clock out with GPS', () =>
                        submitAttendance(shift, 'out')
                      )}

                      {button(
                        'GPS unavailable? Clock out with a reason',
                        () => {
                          setReasonShift(shift.id);
                          setReason('');
                          setError('');
                        },
                        true
                      )}

                      {reasonShift === shift.id && (
                        <View>
                          <Text style={styles.label}>
                            Why is GPS unavailable?
                          </Text>
                          <TextInput
                            style={[styles.input, styles.reason]}
                            value={reason}
                            onChangeText={setReason}
                            placeholder="Explain what happened"
                            placeholderTextColor="#8292aa"
                            multiline
                            maxLength={500}
                            editable={!busy}
                          />
                          {button('Save unverified clock-out', () =>
                            confirmUnverified(shift)
                          )}
                          {button(
                            'Cancel',
                            () => {
                              setReasonShift(null);
                              setReason('');
                            },
                            true
                          )}
                        </View>
                      )}
                    </>
                  )}
                  </>}
                  {section==='patrol'&&(active?<RoundsPanel shiftId={shift.id} paused={busy}/>:<Text style={styles.muted}>{completed?'Shift complete. View your report for recorded totals.':'Clock in on the Duty tab first. Your scheduled patrols will appear here.'}</Text>)}
                  {section==='report'&&<DutyPanel shiftId={shift.id} paused={busy}/>}
                  </ScrollView></View></View></Modal>}
                </View>
              );
            })}

            {page > 1 &&
              button('Previous page', () => void run(() => loadShifts(page - 1)), true)}

            {hasNext &&
              button('Next page', () => void run(() => loadShifts(page + 1)), true)}

            {button(
              'Sign out',
              () => void run(async () => {
                await stopBackgroundTracking();
                await logout();
                setUser(null);
                setShifts([]);
                setPassword('');
                setReason('');
                setReasonShift(null);
              }),
              true
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tabs:{flexDirection:"row",flexWrap:"wrap",gap:8,marginVertical:8},
  hero:{backgroundColor:'#182d45',borderRadius:20,padding:22,marginBottom:20,borderLeftWidth:4,borderLeftColor:'#ef942f'},
  heroLabel:{color:'#ffc57f',fontSize:10,letterSpacing:2,marginBottom:12,fontWeight:'600'},
  heroTitle:{color:'#fff',fontSize:19,fontWeight:'600',marginBottom:10},
  heroText:{color:'#d0dbe7',fontSize:13,lineHeight:20},
  overlay:{flex:1,backgroundColor:'rgba(13,28,46,0.55)',justifyContent:'center',alignItems:'center',padding:16},
  dialog:{width:'100%',maxWidth:560,maxHeight:'90%',backgroundColor:'#fff',borderRadius:20,padding:20},
  loginContainer:{maxWidth:470,paddingTop:48},
  lockBadge:{width:52,height:52,borderRadius:16,backgroundColor:'#203b58',alignItems:'center',justifyContent:'center',marginBottom:22},
  lockLetter:{fontSize:27,color:'#f5b56e',fontWeight:'700'},
  eyebrow:{fontSize:10,letterSpacing:2,color:'#a46220',marginBottom:10,fontWeight:'600'},
  root: { flex: 1, backgroundColor: '#f5f7fa' },
  container: { padding: 20, paddingTop: 28, paddingBottom: 48, width: '100%', maxWidth: 560, alignSelf: 'center' },
  brand: { color: '#f4a15a', fontSize: 18, fontWeight: '700', letterSpacing: 2 },
  subtitle: { color: '#63748a', marginTop: 6, marginBottom: 26 },
  heading: { color: '#203b58', fontSize: 15, fontWeight: '600', marginBottom: 12 },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#dce4ed',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  label: { color: '#34465b', marginBottom: 8, marginTop: 10 },
  text: { fontSize:13, color: '#34465b', marginBottom: 9, lineHeight: 22 },
  muted: { fontSize:12, color: '#63748a', marginBottom: 12, lineHeight: 21 },
  input: {
    color: '#203b58',
    backgroundColor: '#f5f7fa',
    borderColor: '#dce4ed',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    fontSize: 13,
  },
  reason: { minHeight: 100, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#f4a15a',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondary: { backgroundColor: '#edf2f7' },
  buttonText: { color: '#203b58', fontWeight: '600', fontSize: 13 },
  lightText: { color: '#203b58' },
  disabled: { opacity: 0.5 },
  badge: { color: '#f4a15a', fontSize: 12, fontWeight: '700', marginBottom: 12 },
  loading: { gap: 10, marginBottom: 16 },
  error: {
    color: '#9f1239',
    backgroundColor: '#fff1f2',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  success: {
    color: '#166534',
    backgroundColor: '#ecfdf5',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
});
