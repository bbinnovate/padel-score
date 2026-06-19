const DEVICE_KEY = "padel-player-code";
const ORIGINAL_KEY = "padel-original-code";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getPlayerCode(): string {
  if (typeof window === "undefined") return "";
  let code = localStorage.getItem(DEVICE_KEY);
  if (!code) {
    code = generateCode();
    localStorage.setItem(DEVICE_KEY, code);
    localStorage.setItem(ORIGINAL_KEY, code);
  }
  return code;
}

export function getOriginalCode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ORIGINAL_KEY) ?? getPlayerCode();
}

export function setPlayerCode(code: string): void {
  const trimmed = code.toUpperCase().trim();
  // Persist original on first-ever set so we can always restore it
  if (!localStorage.getItem(ORIGINAL_KEY)) {
    localStorage.setItem(ORIGINAL_KEY, localStorage.getItem(DEVICE_KEY) ?? trimmed);
  }
  localStorage.setItem(DEVICE_KEY, trimmed);
}

export function restoreOriginalCode(): string {
  const original = getOriginalCode();
  localStorage.setItem(DEVICE_KEY, original);
  return original;
}
