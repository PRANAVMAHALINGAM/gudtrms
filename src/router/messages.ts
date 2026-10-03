// Fixed text the router sends (owner: Pranav). No private values ever go in these.

export const HELP =
  "Hi, this is gudtrms. I help two people who lived together split up their shared stuff, privately. " +
  'Text START to open a case, or text your case code if someone gave you one.';

export const startIntro = (code: string) =>
  'Welcome to gudtrms. You and your ex each get your own private agent, and your ex never sees what you tell yours. ' +
  `Your case code is ${code}.\n\nFirst, what's your first name?`;

export const ASK_NAME_AGAIN = "Sorry, I didn't catch that. What's your first name?";

export const askEx = (name: string) =>
  `Thanks, ${name}. What's your ex's first name and phone number? For example: Sam 734 555 1234. ` +
  "I'll send them one short invite, so you don't have to contact them.";

export const ASK_EX_PHONE = 'I need their phone number too. For example: Sam 734 555 1234.';

/** The one fixed invite (AGENTS.md section 5). A can't add anything to it. */
export const invite = (fromName: string) =>
  `${fromName} started a gudtrms case to sort out your shared stuff privately. ` +
  'Reply JOIN to take part or STOP to never hear from us again.';

export const inviteSent = (exName: string) =>
  `Invite sent to ${exName}. Waiting on them. I'll text you as soon as they join.`;

export const inviteFailed = (code: string) =>
  `I couldn't reach that number. You can give them your case code, ${code}, and they can text it to gudtrms to join.`;

/** Same text for every reason (opted out, already in a case, your own number), so A can't tell which. */
export const CANT_INVITE = "I can't send an invite to that number. Double-check it, or send a different one.";

export const stillWaiting = (exName: string | null) =>
  `Still waiting on ${exName ?? 'them'} to join. I'll text you when they do.`;

export const INVITED_REPLY = 'Reply JOIN to take part, or STOP to never hear from us again.';

export const joinedToA = (exName: string | null) => `${exName ?? 'Your ex'} joined. Let's get started.`;

export const STOPPED = "Done. gudtrms won't message you again.";
export const THEY_DIDNT_JOIN = "They didn't join, so this case is closed.";
export const CASE_ENDED = 'The other person ended this case, so it is closed.';
