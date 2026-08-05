function shouldUseDurableStore() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.BUILDSTORY_STORE === "d1"
  );
}

export async function exportAccountData(userId: string) {
  if (shouldUseDurableStore()) {
    const { exportAccountData: run } = await import("./d1-store");
    return run(userId);
  }
  const { exportAccountData: run } = await import("./mock-store");
  return run(userId);
}

export async function deleteAccount(userId: string) {
  if (shouldUseDurableStore()) {
    const { deleteAccount: run } = await import("./d1-store");
    return run(userId);
  }
  const { deleteAccount: run } = await import("./mock-store");
  return run(userId);
}
