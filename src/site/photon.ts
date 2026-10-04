// Photon Spectrum management API (owner: Pranav): adds a person as a user of our Photon project.
// On the Free/Pro shared pool, our line only texts project users, and each user gets their own
// pool number (`assignedPhoneNumber`) to text. See AGENTS.md section 3 and section 10.
// API docs: https://spectrum.photon.codes/openapi/json (Basic auth = project id : project secret).

const API = 'https://spectrum.photon.codes';
const TIMEOUT_MS = 10_000;

export interface PhotonUser {
  id: string;
  phoneNumber: string;
  /** The gudtrms line this person texts. */
  assignedPhoneNumber: string;
  firstName: string | null;
}

export interface NewSharedUser {
  phoneNumber: string;
  firstName: string;
  lastName: string | null;
  email: string;
}

export class PhotonError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function credentials(): { projectId: string; auth: string } {
  const projectId = process.env.SPECTRUM_PROJECT_ID;
  const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
  if (!projectId || !projectSecret) {
    throw new PhotonError(0, 'SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET must be set in .env.');
  }
  return { projectId, auth: `Basic ${Buffer.from(`${projectId}:${projectSecret}`).toString('base64')}` };
}

/**
 * Creates a shared-pool user, or returns the existing one for that phone number
 * (Photon is idempotent on phoneNumber and updates the name and email we send).
 */
export async function createSharedUser(user: NewSharedUser): Promise<PhotonUser> {
  const { projectId, auth } = credentials();
  const res = await fetch(`${API}/projects/${projectId}/users/`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'shared', ...user }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as { data?: PhotonUser; message?: string } | null;
  if (!res.ok || !body?.data?.assignedPhoneNumber) {
    throw new PhotonError(res.status, body?.message ?? `Photon returned ${res.status}`);
  }
  return body.data;
}
