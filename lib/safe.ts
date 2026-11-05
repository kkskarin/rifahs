export type Result = { ok: boolean; message?: string };

/** Run a server action from a button; a network/timeout failure becomes a message, not a crash. */
export async function safe<T>(fn: () => Promise<T>): Promise<T | Result> {
  try {
    return await fn();
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (/Server Action|failed to find/i.test(msg)) {
      return { ok: false, message: "The app was just updated — reload the page and try again." };
    }
    return { ok: false, message: "That took too long or the connection dropped. Please try again." };
  }
}
