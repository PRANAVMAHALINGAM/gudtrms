# messaging (owner: Pranav)

Photon Spectrum adapter: receive messages, send replies, and text a brand-new number for the invite. See AGENTS.md section 3 ("iMessage notes").

- `index.ts` is the only file that imports spectrum-ts. It exposes `startMessaging(onMessage)`, `sendToHandle(handle, text)` and `stopMessaging()`.
- `phone.ts` has `normalizePhone()`, which turns what a person types into E.164.
- A **handle** is a phone number in E.164 (or an Apple ID email) on iMessage. On the terminal provider it's the number we texted first, or `terminal:<chat id>` for a chat you opened yourself.
- `sendToHandle` skips the leak filter. Only the fixed invite should call it directly; everything else goes through `sendTo` in `src/privacy`.
- Messages from one handle are handled in order. Different handles run in parallel, so a slow LLM call for A doesn't hold up B.

## Switching providers

Set `MESSAGING_PROVIDER` in `.env`:

- `terminal` (default): opens tuichat (downloaded on first run). Texting a new number opens a new chat window for it, so you can play both people.
- `imessage`: needs `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET` from app.photon.codes, with iMessage turned on for the project.

To check that texting first works, run `npm run dev` and send `ping <phone number>`.
