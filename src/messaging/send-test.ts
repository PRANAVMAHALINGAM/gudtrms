// Dev script: texts one number first over the configured provider, then exits.
//   npm run msg:test -- +17345551234 ["optional text"]
// Uses MESSAGING_PROVIDER from .env (set it to imessage to test Photon for real).

import { messagingProvider, sendToHandle, startMessaging, stopMessaging } from './index.ts';
import { normalizePhone } from './phone.ts';

const to = normalizePhone(process.argv[2] ?? '');
if (!to) {
  console.error('Usage: npm run msg:test -- <phone number> ["text"]');
  process.exit(1);
}
const text = process.argv[3] ?? 'gudtrms test: texting first works.';

// startMessaging only resolves when the stream ends, so run it in the background.
startMessaging(async () => {}).catch((err) => {
  console.error('[send-test] connection failed:', err);
  process.exit(1);
});

// sendToHandle needs the connection; retry until startMessaging has connected.
for (let i = 0; ; i++) {
  try {
    await sendToHandle(to, text);
    break;
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith('Messaging is not started')) || i >= 50) throw err;
    await new Promise((r) => setTimeout(r, 200));
  }
}
console.log(`[send-test] sent via ${messagingProvider()} to ${to}`);
await stopMessaging();
process.exit(0);
