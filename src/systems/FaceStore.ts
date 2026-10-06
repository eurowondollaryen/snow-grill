/**
 * 얼굴 사진(작게 압축한 data URL)을 이 기기의 localStorage 에만 보관한다. 서버로 보내지 않는다.
 */
const KEY = 'snowgrill.face.v1';
/** 저장 상한(문자 수) — 이보다 크면 저장하지 않음 */
const MAX_LEN = 400_000;

export function loadFace(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && v.startsWith('data:image/') ? v : null;
  } catch {
    return null;
  }
}

export function saveFace(dataUrl: string | null): boolean {
  try {
    if (!dataUrl) {
      localStorage.removeItem(KEY);
      return true;
    }
    if (!dataUrl.startsWith('data:image/') || dataUrl.length > MAX_LEN) return false;
    localStorage.setItem(KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function clearFace(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
