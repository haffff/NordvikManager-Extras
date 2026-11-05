/** fn(), tried again after each of delays (ms) while it fails; rejects with the last error. */
export async function retry(fn, delays = [500, 1500, 4000]) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}
