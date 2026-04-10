export function getFamilySelectedResidentId(userId: string) {
  try {
    return localStorage.getItem(`family:selectedResident:${userId}`) || '';
  } catch {
    return '';
  }
}

export function setFamilySelectedResidentId(userId: string, residentId: string) {
  try {
    localStorage.setItem(`family:selectedResident:${userId}`, residentId);
  } catch {
    // ignore
  }
}

