// Entry point (owner: Pranav). Connects to Photon (src/messaging) and hands each
// inbound message to the router.
//
// MESSAGING_PROVIDER=terminal (default) or imessage, set in .env.
//
// The router isn't built yet, so for now this echoes, plus one dev command:
//   ping <phone number>   texts that number first, the same path B's invite will use.
//                         On the terminal provider it opens a new chat window for that number.

import { sendToHandle, startMessaging } from './messaging/index.ts';
import { normalizePhone } from './messaging/phone.ts';

await startMessaging(async (handle, text) => {
  const ping = text.match(/^ping\s+(.+)$/i);
  if (ping) {
    const to = normalizePhone(ping[1] ?? '');
    if (!to) {
      await sendToHandle(handle, "That doesn't look like a phone number.");
      return;
    }
    await sendToHandle(to, 'gudtrms test: texting first works.');
    await sendToHandle(handle, `Sent a test message to ${to}.`);
    return;
  }
  await sendToHandle(handle, `gudtrms heard you (from ${handle}).`);
});
