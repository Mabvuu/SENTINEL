import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { api, APIError, type ShiftPage } from './api';

let watcher: Location.LocationSubscription | undefined;
let listener: ReturnType<typeof AppState.addEventListener> | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let activeShift: number | null = null;
let message = 'Foreground sharing is off.';

export function foregroundState(shiftId: number) {
  return { enabled: activeShift === shiftId, message };
}
export function stopForegroundTracking() {
  generation += 1;
  activeShift = null;
  watcher?.remove(); watcher = undefined;
  listener?.remove(); listener = undefined;
  if (expiry) clearTimeout(expiry);
  message = 'Foreground sharing stopped.';
}
export async function startForegroundTracking(shiftId: number) {
  stopForegroundTracking();
  const current = generation;
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Allow location access in phone settings.');
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('Turn on location services.');
  let shift: ShiftPage['results'][number] | undefined;
  let page = 1;
  while (!shift) {
    const result = await api<ShiftPage>(`/api/shifts/mine/?page=${page}`);
    shift = result.results.find(item => item.id === shiftId);
    if (!result.next) break;
    page += 1;
  }
  if (!shift?.attendance || shift.attendance.clocked_out_at || shift.status !== 'scheduled' || Date.parse(shift.ends_at) <= Date.now()) {
    throw new Error('Clock into an active assigned shift first.');
  }
  if (current !== generation) return;
  let sending = false;
  let lastSent = 0;
  activeShift = shiftId;
  message = 'Keep the app open. Waiting for fresh GPS…';
  listener = AppState.addEventListener('change', state => {
    if (state !== 'active') stopForegroundTracking();
  });
  expiry = setTimeout(stopForegroundTracking, Math.min(Date.parse(shift.ends_at) - Date.now(), 2147483647));
  try {
    const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, position => {
      if (current !== generation || sending || Date.now() - lastSent < 20000) return;
      const age = Date.now() - position.timestamp;
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(age) || age < -5000 || age > 15000 || accuracy === null || !Number.isFinite(accuracy) || accuracy <= 0) {
        message = 'Waiting for a fresh usable GPS reading.'; return;
      }
      sending = true; lastSent = Date.now();
      void api<{ status: string; received_at: string }>(`/api/shifts/${shiftId}/location/`, 'POST', {
        gps: { latitude, longitude, accuracy_metres: accuracy, captured_at: new Date(position.timestamp).toISOString() },
      }).then(result => {
        if (current === generation) message = `Last accepted: ${result.status}. Accuracy ±${Math.round(accuracy)} m. ${new Date(result.received_at).toLocaleTimeString()}`;
      }).catch(error => {
        if (current !== generation) return;
        if (error instanceof APIError && [401,403,404,409].includes(error.status)) stopForegroundTracking();
        message = error instanceof Error ? error.message : 'Upload failed. Retrying.';
      }).finally(() => { sending = false; });
    }, reason => { message = reason; });
    if (current !== generation) subscription.remove();
    else watcher = subscription;
  } catch (error) { stopForegroundTracking(); throw error; }
}
