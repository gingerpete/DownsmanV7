/**
 * @jest-environment node
 */
// Route handlers use the Fetch API Request/Response globals, which jsdom
// (this project's default test environment) doesn't provide.
import { NextRequest } from 'next/server';

jest.mock('@/services/db', () => ({
  getTeamsByOwner: jest.fn(),
  getAllTeams: jest.fn(),
  saveTeam: jest.fn(async (t) => t),
  deleteTeam: jest.fn(),
  getTeamById: jest.fn(),
  getScoutsByOwner: jest.fn(async () => []),
  saveScout: jest.fn(async (s) => s),
  deleteScout: jest.fn(),
  getSupportByOwner: jest.fn(async () => []),
  saveSupport: jest.fn(async (s) => s),
  deleteSupport: jest.fn(),
}));

jest.mock('@/services/cognito', () => ({
  listUsers: jest.fn(),
}));

import * as db from '@/services/db';
import * as cognito from '@/services/cognito';
import { GET as teamsGet, POST as teamsPost, DELETE as teamsDelete } from '@/app/api/teams/route';
import { POST as scoutsPost } from '@/app/api/scouts/route';
import { POST as supportPost } from '@/app/api/support/route';
import { GET as adminGet } from '@/app/api/admin/route';
import { GET as adminConfigGet } from '@/app/api/admin/config/route';
import { HIKE_DATE } from '@/models/referenceData';
import { dateToEpochDay } from '@/utils/date';
import { TeamModel, ScoutModel } from '@/models/types';

function scoutWithAge(age: number): ScoutModel {
  const dobEpoch = dateToEpochDay({ year: HIKE_DATE.year - age, month: HIKE_DATE.month, day: HIKE_DATE.day });
  return { ownerID: 'team-1', fullName: `Scout ${age}`, dobEpoch, leader: false };
}

function validOpenClassTeam(overrides: Partial<TeamModel> = {}): Partial<TeamModel> {
  return {
    teamName: 'Test Team',
    hikeClass: 'Open, Bignor - Washington',
    activeMobile: '07777',
    backupMobile: '07888',
    emergencyContactName: 'EC Name',
    emergencyContactMobile: '07999',
    emergencyContactLandline: '01234',
    emergencyContactEmail: 'ec@test.com',
    teamSubmitted: true,
    ...overrides,
  };
}

function req(url: string, opts: { method?: string; groups?: string; ownerId?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.ownerId !== undefined) headers['x-user-owner-id'] = opts.ownerId;
  if (opts.groups !== undefined) headers['x-user-sub'] = 'sub-1';
  if (opts.ownerId !== undefined || opts.groups !== undefined) headers['x-user-sub'] = 'sub-1';
  if (opts.groups !== undefined) headers['x-user-groups'] = opts.groups;
  return new NextRequest(url, {
    method: opts.method || 'GET',
    headers,
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('teams route authorization', () => {
  it('POST ignores a client-supplied ownerID and uses the session identity', async () => {
    const r = req('http://localhost/api/teams', {
      method: 'POST',
      ownerId: 'real-user-id',
      groups: '',
      body: { ownerID: 'someone-elses-id', teamName: 'Test' },
    });
    await teamsPost(r);
    expect(db.saveTeam).toHaveBeenCalledWith(expect.objectContaining({ ownerID: 'real-user-id' }));
  });

  it('GET ?all=true is forbidden without the admin group', async () => {
    const r = req('http://localhost/api/teams?all=true', { ownerId: 'user-1', groups: '' });
    const res = await teamsGet(r);
    expect(res.status).toBe(403);
    expect(db.getAllTeams).not.toHaveBeenCalled();
  });

  it('GET ?all=true succeeds with the admin group', async () => {
    (db.getAllTeams as jest.Mock).mockResolvedValue([]);
    const r = req('http://localhost/api/teams?all=true', { ownerId: 'user-1', groups: 'admin' });
    const res = await teamsGet(r);
    expect(res.status).toBe(200);
    expect(db.getAllTeams).toHaveBeenCalled();
  });

  it('DELETE is forbidden when the team belongs to a different user', async () => {
    (db.getTeamById as jest.Mock).mockResolvedValue({ id: 'team-1', ownerID: 'someone-else' });
    const r = req('http://localhost/api/teams', { method: 'DELETE', ownerId: 'user-1', groups: '', body: { id: 'team-1' } });
    const res = await teamsDelete(r);
    expect(res.status).toBe(403);
    expect(db.deleteTeam).not.toHaveBeenCalled();
  });

  it('DELETE succeeds when the caller owns the team', async () => {
    (db.getTeamById as jest.Mock).mockResolvedValue({ id: 'team-1', ownerID: 'user-1' });
    const r = req('http://localhost/api/teams', { method: 'DELETE', ownerId: 'user-1', groups: '', body: { id: 'team-1' } });
    const res = await teamsDelete(r);
    expect(res.status).toBe(200);
    expect(db.deleteTeam).toHaveBeenCalledWith(expect.objectContaining({ id: 'team-1', ownerID: 'user-1' }));
  });

  it('POST rejects teamSubmitted:true when the team fails validation (CODE_REVIEW_2026-08-13.md H1)', async () => {
    // No scouts mocked (defaults to []), so validateTeam() fails with "Missing some scouts?"
    // regardless of what a bypassing client claims - this is exactly the case a direct
    // API call used to be able to sneak past, since only TeamDialog.tsx validated before.
    const r = req('http://localhost/api/teams', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: validOpenClassTeam({ id: 'team-1' }),
    });
    const res = await teamsPost(r);
    expect(res.status).toBe(400);
    expect(db.saveTeam).not.toHaveBeenCalled();
  });

  it('POST allows teamSubmitted:true when the team passes validation', async () => {
    (db.getScoutsByOwner as jest.Mock).mockResolvedValue([scoutWithAge(14), scoutWithAge(15), scoutWithAge(16)]);
    const r = req('http://localhost/api/teams', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: validOpenClassTeam({ id: 'team-1' }),
    });
    const res = await teamsPost(r);
    expect(res.status).toBe(200);
    expect(db.saveTeam).toHaveBeenCalled();
  });

  it('POST does not run validation when teamSubmitted is not true (saving a draft)', async () => {
    const r = req('http://localhost/api/teams', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: { id: 'team-1', teamName: 'Draft Team' },
    });
    const res = await teamsPost(r);
    expect(res.status).toBe(200);
    expect(db.saveTeam).toHaveBeenCalled();
  });
});

describe('scouts route authorization', () => {
  it('POST is forbidden when the referenced team is not owned by the caller', async () => {
    (db.getTeamById as jest.Mock).mockResolvedValue({ id: 'team-1', ownerID: 'someone-else' });
    const r = req('http://localhost/api/scouts', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: { ownerID: 'team-1', fullName: 'A Scout' },
    });
    const res = await scoutsPost(r);
    expect(res.status).toBe(403);
    expect(db.saveScout).not.toHaveBeenCalled();
  });

  it('POST succeeds when the caller owns the referenced team', async () => {
    (db.getTeamById as jest.Mock).mockResolvedValue({ id: 'team-1', ownerID: 'user-1' });
    const r = req('http://localhost/api/scouts', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: { ownerID: 'team-1', fullName: 'A Scout', dobEpoch: 12345 },
    });
    const res = await scoutsPost(r);
    expect(res.status).toBe(200);
    expect(db.saveScout).toHaveBeenCalled();
  });

  it('POST rejects a scout with no fullName (CODE_REVIEW_2026-08-13.md H1)', async () => {
    (db.getTeamById as jest.Mock).mockResolvedValue({ id: 'team-1', ownerID: 'user-1' });
    const r = req('http://localhost/api/scouts', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: { ownerID: 'team-1', fullName: '', dobEpoch: 12345 },
    });
    const res = await scoutsPost(r);
    expect(res.status).toBe(400);
    expect(db.saveScout).not.toHaveBeenCalled();
  });

  it('POST rejects a scout with a non-numeric dobEpoch', async () => {
    (db.getTeamById as jest.Mock).mockResolvedValue({ id: 'team-1', ownerID: 'user-1' });
    const r = req('http://localhost/api/scouts', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: { ownerID: 'team-1', fullName: 'A Scout', dobEpoch: 'not-a-number' },
    });
    const res = await scoutsPost(r);
    expect(res.status).toBe(400);
    expect(db.saveScout).not.toHaveBeenCalled();
  });
});

describe('support route authorization', () => {
  it('POST is forbidden when the referenced team is not owned by the caller', async () => {
    (db.getTeamById as jest.Mock).mockResolvedValue({ id: 'team-1', ownerID: 'someone-else' });
    const r = req('http://localhost/api/support', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: { ownerID: 'team-1', fullName: 'A Support', phoneNumber: '07777' },
    });
    const res = await supportPost(r);
    expect(res.status).toBe(403);
    expect(db.saveSupport).not.toHaveBeenCalled();
  });

  it('POST succeeds when the caller owns the referenced team', async () => {
    (db.getTeamById as jest.Mock).mockResolvedValue({ id: 'team-1', ownerID: 'user-1' });
    const r = req('http://localhost/api/support', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: { ownerID: 'team-1', fullName: 'A Support', phoneNumber: '07777' },
    });
    const res = await supportPost(r);
    expect(res.status).toBe(200);
    expect(db.saveSupport).toHaveBeenCalled();
  });

  it('POST rejects a support contact with no phoneNumber (CODE_REVIEW_2026-08-13.md H1)', async () => {
    (db.getTeamById as jest.Mock).mockResolvedValue({ id: 'team-1', ownerID: 'user-1' });
    const r = req('http://localhost/api/support', {
      method: 'POST',
      ownerId: 'user-1',
      groups: '',
      body: { ownerID: 'team-1', fullName: 'A Support', phoneNumber: '' },
    });
    const res = await supportPost(r);
    expect(res.status).toBe(400);
    expect(db.saveSupport).not.toHaveBeenCalled();
  });
});

describe('admin route authorization', () => {
  it('GET is forbidden without the admin group', async () => {
    const r = req('http://localhost/api/admin', { ownerId: 'user-1', groups: '' });
    const res = await adminGet(r);
    expect(res.status).toBe(403);
    expect(cognito.listUsers).not.toHaveBeenCalled();
  });

  it('GET succeeds with the admin group', async () => {
    (cognito.listUsers as jest.Mock).mockResolvedValue([]);
    const r = req('http://localhost/api/admin', { ownerId: 'user-1', groups: 'admin' });
    const res = await adminGet(r);
    expect(res.status).toBe(200);
  });
});

describe('admin config route authorization', () => {
  it('GET is forbidden without the admin group', async () => {
    const r = req('http://localhost/api/admin/config', { ownerId: 'user-1', groups: '' });
    const res = await adminConfigGet(r);
    expect(res.status).toBe(403);
  });

  it('GET succeeds with the admin group and returns every configured variable', async () => {
    const r = req('http://localhost/api/admin/config', { ownerId: 'user-1', groups: 'admin' });
    const res = await adminConfigGet(r);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'NEXT_PUBLIC_DM_HIKE_DATE' }),
      expect.objectContaining({ key: 'COGNITO_USER_POOL_ID' }),
      expect.objectContaining({ key: 'DM_BANKDETS' }),
    ]));
  });
});
