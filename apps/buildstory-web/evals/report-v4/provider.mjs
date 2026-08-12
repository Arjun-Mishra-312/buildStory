const cases = {
  "thin-evidence": { pipelineVersion: "4.0.0", complexityBand: "compact", sessionMaps: 1, citedClaims: 8, claims: 8, invalidReferences: 0, deterministicIds: true, patterns: 0, privateText: [] },
  "large-mixed-history": { pipelineVersion: "4.0.0", complexityBand: "complex", sessionMaps: 24, providers: 3, selectedProviderCoverage: 3, citedClaims: 31, claims: 31, invalidReferences: 0, deterministicIds: true, patterns: 4, privateText: [] },
  "failed-session": { pipelineVersion: "4.0.0", complexityBand: "standard", sessionMaps: 4, unresolvedSessions: 1, citedClaims: 17, claims: 17, invalidReferences: 0, deterministicIds: true, patterns: 1, privateText: [] },
  "repeated-chapter": { pipelineVersion: "4.0.0", complexityBand: "complex", sessionMaps: 12, chapters: 3, citedClaims: 27, claims: 27, invalidReferences: 0, deterministicIds: true, patterns: 3, privateText: [] },
};

export default class FrozenReportV4Provider {
  id() { return "buildstory:frozen-v4-receipts"; }
  async callApi(_prompt, context) {
    const key = context?.vars?.case;
    const receipt = cases[key];
    if (!receipt) return { error: "Unknown frozen evaluation case." };
    return { output: JSON.stringify(receipt) };
  }
}
