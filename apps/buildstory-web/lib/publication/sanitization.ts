type ReplacementRule = {
  pattern: RegExp;
  marker: string;
  shouldReplace?: (value: string) => boolean;
};

function looksHighEntropy(value: string) {
  if (/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) return false;
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) return false;
  if (value.includes("REDACTED")) return false;
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return false;

  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy >= 4.3;
}

const rules: ReplacementRule[] = [
  { pattern: /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?(?:-----END(?: [A-Z0-9]+)* PRIVATE KEY-----|$)/gi, marker: "private-key" },
  { pattern: /\b(?:authorization\s*:\s*)?(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, marker: "authorization" },
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, marker: "api-key" },
  { pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}\b/g, marker: "api-key" },
  { pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, marker: "github-token" },
  { pattern: /\bglpat-[A-Za-z0-9_-]{16,}\b/g, marker: "service-token" },
  { pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, marker: "aws-key" },
  { pattern: /\b(?:xox(?:a|b|p|r|s|c|d|o)-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,})\b/g, marker: "service-token" },
  { pattern: /\b(?:AC|SK)[a-fA-F0-9]{32}\b/g, marker: "service-token" },
  { pattern: /\b(?:hf_|npm_)[A-Za-z0-9]{20,}\b/g, marker: "service-token" },
  { pattern: /\bpypi-[A-Za-z0-9_-]{20,}\b/g, marker: "service-token" },
  { pattern: /\bAIza[A-Za-z0-9_-]{25,}\b/g, marker: "service-token" },
  { pattern: /\b(?:cfoat|cfat|cfut|cfk)_[A-Za-z0-9_-]{16,}\b/g, marker: "service-token" },
  { pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, marker: "jwt" },
  { pattern: /\bAccountKey\s*=\s*[A-Za-z0-9+/=]{20,}/gi, marker: "service-token" },
  { pattern: /\b(?:oauth_token|access_token|refresh_token)\s*=\s*[^\s,;&]{8,}/gi, marker: "service-token" },
  { pattern: /\b1\/\/0[A-Za-z0-9_-]{16,}\b/g, marker: "service-token" },
  { pattern: /\b(?:api[_-]?key|secret(?:[_-]?key)?|client[_-]?secret|auth[_-]?token|token|password|passwd|pwd|private[_-]?key|database[_-]?url|connection[_-]?string)\s*(?::|=)\s*(?:"[^"\r\n]{4,}"|'[^'\r\n]{4,}'|[^\s,;&]{4,})/gi, marker: "secret-assignment" },
  { pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>()]+/gi, marker: "remote-url" },
  { pattern: /\bgit@[^\s:]+:[^\s]+/gi, marker: "remote-url" },
  { pattern: /(?:^|[\s("'`=])(?:[A-Za-z]:[\\/]|\\\\)[^\s<>()"'`]+/g, marker: "absolute-path" },
  { pattern: /(?:^|[\s("'`=])\/(?!\/)[^\s<>()"'`]+/g, marker: "absolute-path" },
  { pattern: /(?:^|[\s("'`=])(?:\.\.?[\\/]|~[\\/])[^\s<>()"'`]+/g, marker: "relative-path" },
  { pattern: /(?:^|[\s("'`=])(?:[A-Za-z0-9_.-]+[\\/])+(?:[A-Za-z0-9_.-]+\.[A-Za-z][A-Za-z0-9]{0,11})(?=$|[\s)"'`,;])/g, marker: "relative-path" },
  { pattern: /\b(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])(?::\d{1,5})?\b/gi, marker: "raw-host" },
  { pattern: /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|app|co|ai|cloud|tech|local|internal|invalid|test|example)(?::\d{1,5})?\b/gi, marker: "raw-host" },
  { pattern: /\b[A-Za-z0-9+/_=-]{32,160}\b/g, marker: "high-entropy", shouldReplace: looksHighEntropy },
];

export type SanitizedPublicText = {
  value: string;
  changed: boolean;
  findings: string[];
};

/** Defense-in-depth for creator-authored strings that may become public. */
export function sanitizePublicText(
  input: string,
  maxLength: number,
): SanitizedPublicText {
  const findings = new Set<string>();
  let value = input
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(input)) {
    findings.add("control-character");
    value = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  }
  for (const rule of rules) {
    value = value.replace(rule.pattern, (match) => {
      if (rule.shouldReplace && !rule.shouldReplace(match)) return match;
      findings.add(rule.marker);
      return `[REDACTED:${rule.marker}]`;
    });
  }
  const bounded = value.slice(0, maxLength);
  return {
    value: bounded,
    changed: findings.size > 0 || bounded !== input.trim(),
    findings: [...findings].sort(),
  };
}
