// What the judge view renders: one case, as rows. Same shape for live (Neon) and mock data.

import type { Snapshot as LiveSnapshot } from '../../server/snapshot.ts';
import type { Allocation, Transfer } from '../../../src/shared/types.ts';

export type Snapshot = Omit<LiveSnapshot, 'source'> & { source: 'mock' | 'live' };
export type Participant = Snapshot['participants'][number];
export type ItemRow = Snapshot['items'][number];
export type Note = Snapshot['notes'][number];
export type Leak = Snapshot['leaks'][number];
export type ProposalRow = Omit<Snapshot['proposals'][number], 'allocation' | 'transfer'> & {
  allocation: Allocation;
  transfer: Transfer;
};

export type Mode = 'mock' | 'live';
