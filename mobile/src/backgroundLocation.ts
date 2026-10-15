// SENTINEL_BROWSER_GUARDS
import {Platform} from 'react-native';
import * as Location from 'expo-location';
import { stopForegroundTracking } from './foregroundLocation';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from './sessionStorage';

import { api, APIError, type User, type ShiftPage } from './api';

const TASK = 'sentinel-shift-location-v1';
const CONTEXT = 'sentinel.tracking.context';
const STATUS = 'sentinel.tracking.status';

const storageOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

type Context = {
  shiftId: number;
  userId: number;
  endsAt: string;
};

type Result = {
  status: 'inside' | 'outside' | 'uncertain';
  received_at: string;
};

let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
let lastAttempt = 0;

function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  queue = result.catch(() => undefined);
  return result;
}

async function writeStatus(message: string) {
  await SecureStore.setItemAsync(STATUS, message, storageOptions);
}

async function readContext(): Promise<Context | null> {
  const raw = await SecureStore.getItemAsync(CONTEXT);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw);
    if (
      Number.isSafeInteger(value.shiftId) &&
      Number.isSafeInteger(value.userId) &&
      Number.isFinite(Date.parse(value.endsAt))
    ) {
      return value;
    }
  } catch {}

  await SecureStore.deleteItemAsync(CONTEXT);
  return null;
}

async function stopNative() {
  if (Platform.OS === 'web') { stopForegroundTracking(); return; }
  stopForegroundTracking();
  // Remove authorization first, even if stopping the native service fails.
  await SecureStore.deleteItemAsync(CONTEXT);

  if (await TaskManager.isAvailableAsync() && await Location.hasStartedLocationUpdatesAsync(TASK)) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
}

export async function stopBackgroundTracking() {
  if (Platform.OS === 'web') { stopForegroundTracking(); return; }
  generation += 1;

  await serial(async () => {
    await stopNative();
    await writeStatus('Location sharing stopped.');
  });
}

export async function getTrackingState(shiftId: number) {
  if (Platform.OS === 'web') return {enabled:false,message:'Use Share while app is open in the browser.'};
  const context = await readContext();
  const message = await SecureStore.getItemAsync(STATUS);

  if (!context || context.shiftId !== shiftId) {
    return { enabled: false, message: message || 'Location sharing is off.' };
  }

  if (Date.now() >= Date.parse(context.endsAt)) {
    await stopBackgroundTracking();
    return { enabled: false, message: 'Shift ended. Sharing stopped.' };
  }

  const enabled = await Location.hasStartedLocationUpdatesAsync(TASK);

  return {
    enabled,
    message: enabled
      ? message || 'Waiting for a location update.'
      : 'Location service is stopped. Start sharing again.',
  };
}

export async function startBackgroundTracking(shiftId: number) {
  if (Platform.OS === 'web') throw new Error('Use Share while app is open. Background tracking requires the installed phone app.');
  return serial(async () => {
    if (!(await TaskManager.isAvailableAsync())) {
      throw new Error('Background tracking requires a phone development build.');
    }

    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) {
      throw new Error('Allow location permission to share your shift location.');
    }

    const background = await Location.requestBackgroundPermissionsAsync();
    if (!background.granted) {
      throw new Error(
        'Enable background location in phone settings: Always on iPhone, or Allow all the time on Android.'
      );
    }

    if (!(await Location.hasServicesEnabledAsync())) {
      throw new Error('Turn on your phone’s location services.');
    }

    const user = await api<User>('/api/auth/me/');
    if (user.role !== 'guard') {
      throw new Error('A guard account is required.');
    }

    // Verify attendance with the server before starting the native service.
    let page = 1;
    let selected: ShiftPage['results'][number] | undefined;

    while (!selected) {
      const result = await api<ShiftPage>(`/api/shifts/mine/?page=${page}`);
      selected = result.results.find((shift) => shift.id === shiftId);
      if (selected || !result.next) break;
      page += 1;
    }

    if (
      !selected ||
      selected.status !== 'scheduled' ||
      !selected.attendance ||
      selected.attendance.clocked_out_at ||
      Date.now() >= Date.parse(selected.ends_at)
    ) {
      throw new Error('An active, clocked-in shift is required.');
    }

    await stopNative();
    generation += 1;
    lastAttempt = 0;

    const context: Context = {
      shiftId,
      userId: user.id,
      endsAt: selected.ends_at,
    };

    await SecureStore.setItemAsync(
      CONTEXT,
      JSON.stringify(context),
      storageOptions
    );

    try {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 20000,
        distanceInterval: 0,
        deferredUpdatesInterval: 20000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Sentinel shift location',
          notificationBody: 'Location sharing is active for your shift.',
          notificationColor: '#f4a15a',
        },
      });

      await writeStatus('Sharing enabled. Waiting for a fresh GPS reading.');
    } catch (error) {
      await stopNative();
      throw error;
    }
  });
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    TASK,
    async ({ data, error }) => {
      const taskGeneration = generation;

      await serial(async () => {
        if (taskGeneration !== generation) return;

        try {
          const context = await readContext();

          if (!context || Date.now() >= Date.parse(context.endsAt)) {
            await stopNative();
            await writeStatus('Location sharing is stopped.');
            return;
          }

          if (error) {
            await writeStatus(`Location unavailable: ${error.message}`);
            return;
          }

          const position = data?.locations
            ?.slice()
            .sort((a, b) => b.timestamp - a.timestamp)[0];

          if (!position) return;

          const age = Date.now() - position.timestamp;
          const { latitude, longitude, accuracy } = position.coords;

          if (
            !Number.isFinite(age) ||
            age < -5000 ||
            age > 15000 ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180 ||
            accuracy === null ||
            !Number.isFinite(accuracy) ||
            accuracy <= 0 ||
            accuracy > 100000
          ) {
            await writeStatus('Waiting for a fresh, usable GPS reading.');
            return;
          }

          if (Date.now() - lastAttempt < 20000) return;
          lastAttempt = Date.now();

          const user = await api<User>('/api/auth/me/');

          if (user.id !== context.userId || user.role !== 'guard') {
            await stopNative();
            await writeStatus('Account changed. Location sharing stopped.');
            return;
          }

          if (
            taskGeneration !== generation ||
            Date.now() >= Date.parse(context.endsAt)
          ) {
            return;
          }

          // Avoid sending a reading that became stale during authentication.
          if (Date.now() - position.timestamp > 25000) {
            await writeStatus('Connection was slow. Waiting for fresh GPS.');
            return;
          }

          const result = await api<Result>(
            `/api/shifts/${context.shiftId}/location/`,
            'POST',
            {
              gps: {
                latitude,
                longitude,
                accuracy_metres: accuracy,
                captured_at: new Date(position.timestamp).toISOString(),
              },
            }
          );

          const label = {
            inside: 'Inside site',
            outside: 'Outside site',
            uncertain: 'Location uncertain',
          }[result.status];

          await writeStatus(
            `Last accepted reading: ${label}. Server receipt: ${
              new Date(result.received_at).toLocaleTimeString()
            }.`
          );
        } catch (err) {
          if (
            err instanceof APIError &&
            [401, 403, 404, 409].includes(err.status)
          ) {
            await stopNative();
          }

          await writeStatus(
            err instanceof Error ? err.message : 'Location upload failed.'
          );
        }
      }).catch(() => {
        // Do not crash a headless task if native storage is unavailable.
        // The server must treat missing updates as stale.
      });
    }
  );
}
