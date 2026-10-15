import * as Location from 'expo-location';

export type GPSReading = {
  latitude: number;
  longitude: number;
  accuracy_metres: number;
  captured_at: string;
};

export async function readGPS(
  maxAccuracyMetres = 50
): Promise<GPSReading> {
  if (!Number.isFinite(maxAccuracyMetres) || maxAccuracyMetres <= 0) {
    throw new Error('The site has an invalid GPS accuracy setting.');
  }

  const permission = await Location.requestForegroundPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      'Location permission is required. Enable location for Sentinel in your phone settings.'
    );
  }

  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Turn on your phone’s location services and try again.');
  }

  return new Promise<GPSReading>((resolve, reject) => {
    let subscription: Location.LocationSubscription | undefined;
    let finished = false;
    let lastProblem = 'No fresh location was received.';

    const finish = (reading?: GPSReading, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      subscription?.remove();

      if (reading) resolve(reading);
      else reject(error ?? new Error('Unable to read your location.'));
    };

    const timer = setTimeout(() => {
      finish(
        undefined,
        new Error(
          `${lastProblem} Move somewhere with a clear view of the sky and try again.`
        )
      );
    }, 25000);

    void Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (position) => {
        if (finished) return;

        const { latitude, longitude, accuracy } = position.coords;
        const timestamp = position.timestamp;
        const age = Date.now() - timestamp;

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          lastProblem = 'The phone returned invalid coordinates.';
          return;
        }

        if (
          !Number.isFinite(timestamp) ||
          age < -5000 ||
          age > 15000
        ) {
          lastProblem = 'The phone’s location reading is too old or its clock is incorrect.';
          return;
        }

        if (
          accuracy === null ||
          !Number.isFinite(accuracy) ||
          accuracy <= 0 ||
          accuracy > maxAccuracyMetres
        ) {
          lastProblem =
            `GPS is not accurate enough yet. This site requires accuracy within ${maxAccuracyMetres} metres.`;
          return;
        }

        finish({
          latitude,
          longitude,
          accuracy_metres: accuracy,
          captured_at: new Date(timestamp).toISOString(),
        });
      },
      () => {
        finish(
          undefined,
          new Error('Location updates failed. Check location services and try again.')
        );
      }
    ).then(
      (watcher) => {
        // A timeout can happen before the native watcher finishes starting.
        if (finished) watcher.remove();
        else subscription = watcher;
      },
      () => {
        finish(
          undefined,
          new Error('Could not start GPS. Check your location permission and try again.')
        );
      }
    );
  });
}
