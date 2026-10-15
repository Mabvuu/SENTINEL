import { api } from './api';
import { readGPS } from './gps';

export type AttendanceResult = {
  id: number;
  shift: number;
  clocked_in_at: string;
  clocked_out_at: string | null;
  clock_out_gps_verified: boolean;
  clock_out_note: string;
};

function checkShiftId(shiftId: number) {
  if (!Number.isSafeInteger(shiftId) || shiftId <= 0) {
    throw new Error('Select a valid shift.');
  }
}

export async function clockIn(
  shiftId: number,
  maxAccuracyMetres: number
): Promise<AttendanceResult> {
  checkShiftId(shiftId);
  const gps = await readGPS(maxAccuracyMetres);

  return api<AttendanceResult>(
    `/api/shifts/${shiftId}/clock-in/`,
    'POST',
    { gps }
  );
}

export async function clockOutWithGPS(
  shiftId: number,
  maxAccuracyMetres: number
): Promise<AttendanceResult> {
  checkShiftId(shiftId);
  const gps = await readGPS(maxAccuracyMetres);

  return api<AttendanceResult>(
    `/api/shifts/${shiftId}/clock-out/`,
    'POST',
    { gps }
  );
}

export async function clockOutWithoutGPS(
  shiftId: number,
  reason: string
): Promise<AttendanceResult> {
  checkShiftId(shiftId);
  const note = reason.trim();

  if (!note) {
    throw new Error('Enter why you are clocking out without GPS.');
  }

  if (note.length > 500) {
    throw new Error('Keep the explanation within 500 characters.');
  }

  // Explicitly unverified. Never fabricate a location.
  return api<AttendanceResult>(
    `/api/shifts/${shiftId}/clock-out/`,
    'POST',
    { note }
  );
}
