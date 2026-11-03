import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Ports } from '../src/services/infractions.js';

import './env.js';

const flows = await import('../src/services/infractions.js');

test('a shutdown waits for the turn in hand and takes no new one', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const order: string[] = [];
  const ports = {
    api: {
      removeTier: async (id: string) => {
        if (id === '123456789012345678') await gate;
        order.push('recorded');
        return { discord_id: '123456789012345678', category: 'minor', tier: 0, was_changed: false };
      },
    },
    member: async () => null,
    canGive: () => true,
    post: async () => true,
    dm: async () => true,
  } as unknown as Ports;
  const inHand = flows.removeTier(ports, '223456789012345678', '123456789012345678', 'minor');
  const drained = flows.drained().then(() => order.push('drained'));
  await assert.rejects(flows.removeTier(ports, '223456789012345678', '323456789012345678', 'minor'), /restarting/);
  release();
  await Promise.all([inHand, drained]);
  assert.deepEqual(order, ['recorded', 'drained']);
});
