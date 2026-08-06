/**
 * Single policy seam for cloud narrative access. Everyone is entitled at
 * launch; Pro gating can be added here without changing ingestion or queue
 * behavior.
 */
export function canUseCloudNarrative(userId: string): boolean {
  void userId;
  return true;
}
