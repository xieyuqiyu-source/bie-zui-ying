export function nowIso() {
  return new Date().toISOString();
}

export function addMinutesIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

