// Entry point (owner: Pranav). Connects to Photon (src/messaging) and hands each
// inbound message to the router (src/router).
//
// MESSAGING_PROVIDER=terminal (default) or imessage, set in .env.

import { sendToHandle, startMessaging } from './messaging/index.ts';
import { route } from './router/index.ts';

await startMessaging(async (handle, text) => {
  try {
    await route(handle, text);
  } catch (err) {
    // Log the error, never the message text (privacy rule 6).
    console.error(`[router] failed for ${handle}:`, err);
    await sendToHandle(handle, 'Sorry, something went wrong on our side. Try again in a minute.').catch(() => {});
  }
});
