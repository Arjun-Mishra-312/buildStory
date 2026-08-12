function receipt(output) {
  try { return JSON.parse(output); } catch { return null; }
}

export function privacySafe(output) {
  const value = receipt(output);
  if (!value || !Array.isArray(value.privateText) || value.privateText.length) return { pass: false, score: 0, reason: "Private text entered the evaluation receipt." };
  const serialized = output.toLowerCase();
  const forbidden = ["diff --git", "commitmessage", "toolarguments", "toolresult", "sourcebody", "http://", "https://"];
  const match = forbidden.find((token) => serialized.includes(token));
  return { pass: !match, score: match ? 0 : 1, reason: match ? `Forbidden token: ${match}` : "Content-free receipt." };
}

export function citationsResolve(output) {
  const value = receipt(output);
  const pass = Boolean(value && value.claims > 0 && value.citedClaims === value.claims && value.invalidReferences === 0);
  return { pass, score: pass ? 1 : 0, reason: pass ? "Every claim resolves." : "Citation coverage or validity failed." };
}

export function deterministicStructures(output) {
  const value = receipt(output);
  const pass = Boolean(value?.pipelineVersion === "4.0.0" && value?.deterministicIds === true && value?.sessionMaps > 0);
  return { pass, score: pass ? 1 : 0, reason: pass ? "Stable V4 structures present." : "Missing deterministic V4 structure." };
}
