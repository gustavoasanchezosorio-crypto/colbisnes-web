// lib/tiempos.ts
export function nowDate(): Date {
  return new Date();
}

export function addMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60 * 1000);
}