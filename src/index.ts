// Entry point (owner: Pranav). Photon hello world from the spectrum-ts quick start,
// on the terminal provider only (build plan hour 0 to 2). Next step: hand each message
// to the router (src/router).
//
// To add iMessage once SPECTRUM_PROJECT_ID/SECRET are in .env:
//   import { imessage } from 'spectrum-ts/providers/imessage';
//   const app = await Spectrum({
//     projectId: process.env.SPECTRUM_PROJECT_ID!,
//     projectSecret: process.env.SPECTRUM_PROJECT_SECRET!,
//     providers: [imessage.config(), terminal.config()],
//   });

import { Spectrum } from 'spectrum-ts';
import { terminal } from 'spectrum-ts/providers/terminal';

const app = await Spectrum({ providers: [terminal.config()] });

for await (const [space, message] of app.messages) {
  if (message.content.type === 'text') {
    await space.send('hello from gudtrms');
  }
}
