import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ID } from './env.js';

const { memberOrNull, movedRolesOf, nextRoles } = await import('../src/services/roles.js');

const member = (...held: string[]) => ({ id: '123456789012345678', roles: { cache: new Map(held.map((id) => [id, true])), set: async () => undefined } });

test('only the moved roles a member holds are kept on the record', () => {
  assert.deepEqual(movedRolesOf(member(ID.ROLE_CIV6!, '999999999999999990', ID.ROLE_CPL_COACH!)), [ID.ROLE_CIV6, ID.ROLE_CPL_COACH]);
});

test('a role write keeps every other role the member has', () => {
  assert.deepEqual(nextRoles(['a', 'b', 'c'], ['b'], ['s']), ['a', 'c', 's']);
  assert.deepEqual(nextRoles(['a', 's'], ['s'], ['a', 'b']), ['a', 'b']);
});

test('only Discord saying the member is gone reads as absent', async () => {
  assert.equal(await memberOrNull(async () => Promise.reject(Object.assign(new Error('Unknown Member'), { code: 10007 }))), null);
  await assert.rejects(memberOrNull(async () => Promise.reject(Object.assign(new Error('Service Unavailable'), { code: 0 }))), /Service Unavailable/);
});
