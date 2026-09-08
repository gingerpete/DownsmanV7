import { validateTeam, getEntranceFee, getPaymentStatus } from '@/utils/validation';
import { TeamModel, ScoutModel, SupportModel } from '@/models/types';
import { HIKE_DATE, ENTRY_COST, BEAVER_CLASS, BEAVER_TEAM_FEE } from '@/models/referenceData';
import { dateToEpochDay } from '@/utils/date';

// Helper: create a scout with age at hike date
function scoutWithAge(age: number, leader = false): ScoutModel {
  const dobYear = HIKE_DATE.year - age;
  const dobEpoch = dateToEpochDay({ year: dobYear, month: HIKE_DATE.month, day: HIKE_DATE.day });
  return { ownerID: 'team1', fullName: `Scout Age ${age}`, dobEpoch, leader };
}

function leaderScout(): ScoutModel {
  return { ownerID: 'team1', fullName: 'Leader', dobEpoch: 0, leader: true };
}

function supportMember(): SupportModel {
  return { ownerID: 'team1', fullName: 'Support', phoneNumber: '07777', from: 'CP1', to: 'CP2' };
}

function baseTeam(hikeClass: string): TeamModel {
  return {
    ownerID: 'user1',
    teamName: 'Test Team',
    hikeClass,
    activeMobile: '07777',
    backupMobile: '07888',
    emergencyContactName: 'EC Name',
    emergencyContactMobile: '07999',
    emergencyContactLandline: '01onal',
    emergencyContactEmail: 'ec@test.com',
    paymentAmount: 0,
    paymentRecieved: false,
    teamSubmitted: false,
    campingAtStart: false,
    committedToRun: false,
  };
}

describe('validateTeam - mandatory fields', () => {
  it('rejects empty team name', () => {
    const team = baseTeam('A-Class');
    team.teamName = '';
    const errs = validateTeam(team, [scoutWithAge(16)], [supportMember()]);
    expect(errs).toContain('Team Name Cant Be Empty');
  });

  it('rejects missing hike class', () => {
    const team = baseTeam('');
    const errs = validateTeam(team, [scoutWithAge(16)], []);
    expect(errs).toContain('Hike Class Cant Be Empty');
  });

  it('rejects missing active mobile', () => {
    const team = baseTeam('A-Class');
    team.activeMobile = '';
    const errs = validateTeam(team, [scoutWithAge(16)], [supportMember()]);
    expect(errs).toContain('Active mobile cant be empty');
  });

  it('rejects missing emergency contact info', () => {
    const team = baseTeam('A-Class');
    team.emergencyContactName = '';
    const errs = validateTeam(team, [scoutWithAge(16)], [supportMember()]);
    expect(errs).toContain('Complete emergency contact information');
  });

  it('rejects empty scouts list', () => {
    const team = baseTeam('A-Class');
    const errs = validateTeam(team, [], [supportMember()]);
    expect(errs).toContain('Missing some scouts?');
  });
});

describe('validateTeam - Open Class', () => {
  const openClass = 'Open, Bignor - Washington';

  it('accepts valid team of 3-6', () => {
    const team = baseTeam(openClass);
    const scouts = [scoutWithAge(14), scoutWithAge(15), scoutWithAge(13)];
    expect(validateTeam(team, scouts, [])).toHaveLength(0);
  });

  it('rejects team smaller than 3', () => {
    const team = baseTeam(openClass);
    const scouts = [scoutWithAge(14), scoutWithAge(15)];
    const errs = validateTeam(team, scouts, []);
    expect(errs.some(e => e.includes('team size must be between 3 and 6'))).toBe(true);
  });

  it('rejects team larger than 6', () => {
    const team = baseTeam(openClass);
    const scouts = Array(7).fill(null).map(() => scoutWithAge(14));
    const errs = validateTeam(team, scouts, []);
    expect(errs.some(e => e.includes('team size must be between 3 and 6'))).toBe(true);
  });

  it('requires leader when under 12 present', () => {
    const team = baseTeam(openClass);
    const scouts = [scoutWithAge(11), scoutWithAge(14), scoutWithAge(13)];
    const errs = validateTeam(team, scouts, []);
    expect(errs.some(e => e.includes('less than 12 you have to have a leader'))).toBe(true);
  });

  it('accepts under 12 when leader present', () => {
    const team = baseTeam(openClass);
    const scouts = [scoutWithAge(11), scoutWithAge(14), leaderScout()];
    expect(validateTeam(team, scouts, [])).toHaveLength(0);
  });
});

describe('validateTeam - S-Class', () => {
  it('requires exactly 4 scouts', () => {
    const team = baseTeam('S-Class');
    const scouts = [scoutWithAge(13), scoutWithAge(13), scoutWithAge(13)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('team size must be 4'))).toBe(true);
  });

  it('rejects leaders', () => {
    const team = baseTeam('S-Class');
    const scouts = [scoutWithAge(13), scoutWithAge(13), scoutWithAge(13), leaderScout()];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('leaders may not hike'))).toBe(true);
  });

  it('requires combined age >= 48', () => {
    const team = baseTeam('S-Class');
    const scouts = [scoutWithAge(11), scoutWithAge(11), scoutWithAge(11), scoutWithAge(11)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('combined age must be more than 48'))).toBe(true);
  });

  it('rejects max age over 14.5', () => {
    const team = baseTeam('S-Class');
    const scouts = [scoutWithAge(15), scoutWithAge(12), scoutWithAge(12), scoutWithAge(12)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('max age must be less than 14.5'))).toBe(true);
  });

  it('requires service crew', () => {
    const team = baseTeam('S-Class');
    const scouts = [scoutWithAge(13), scoutWithAge(13), scoutWithAge(12), scoutWithAge(12)];
    const errs = validateTeam(team, scouts, []);
    expect(errs.some(e => e.includes('Service crew required'))).toBe(true);
  });

  it('accepts valid S-Class team', () => {
    const team = baseTeam('S-Class');
    const scouts = [scoutWithAge(13), scoutWithAge(13), scoutWithAge(12), scoutWithAge(12)];
    expect(validateTeam(team, scouts, [supportMember()])).toHaveLength(0);
  });
});

describe('validateTeam - E-Class', () => {
  it('requires exactly 4 scouts', () => {
    const team = baseTeam('E-Class');
    const scouts = [scoutWithAge(16), scoutWithAge(15), scoutWithAge(15)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('team size must be 4'))).toBe(true);
  });

  it('requires combined age >= 48', () => {
    const team = baseTeam('E-Class');
    const scouts = [scoutWithAge(11), scoutWithAge(11), scoutWithAge(11), scoutWithAge(11)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('combined age must be more than 48'))).toBe(true);
  });

  it('requires combined age <= 62', () => {
    const team = baseTeam('E-Class');
    const scouts = [scoutWithAge(17), scoutWithAge(17), scoutWithAge(16), scoutWithAge(16)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('combined age must be less than 62'))).toBe(true);
  });

  it('rejects hikers over 18', () => {
    const team = baseTeam('E-Class');
    const scouts = [scoutWithAge(19), scoutWithAge(14), scoutWithAge(14), scoutWithAge(14)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('may not have hikers over 18'))).toBe(true);
  });

  it('requires service crew', () => {
    const team = baseTeam('E-Class');
    const scouts = [scoutWithAge(15), scoutWithAge(14), scoutWithAge(14), scoutWithAge(14)];
    const errs = validateTeam(team, scouts, []);
    expect(errs.some(e => e.includes('Service crew required'))).toBe(true);
  });

  it('accepts valid E-Class team', () => {
    const team = baseTeam('E-Class');
    const scouts = [scoutWithAge(15), scoutWithAge(14), scoutWithAge(14), scoutWithAge(14)];
    expect(validateTeam(team, scouts, [supportMember()])).toHaveLength(0);
  });
});

describe('validateTeam - B-Class', () => {
  it('requires exactly 4 scouts', () => {
    const team = baseTeam('B-Class');
    const scouts = [scoutWithAge(16), scoutWithAge(16), scoutWithAge(16)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('team size must be 4'))).toBe(true);
  });

  it('requires combined age >= 48', () => {
    const team = baseTeam('B-Class');
    const scouts = [scoutWithAge(11), scoutWithAge(11), scoutWithAge(11), scoutWithAge(11)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('combined age must be more than 48'))).toBe(true);
  });

  it('rejects hikers over 18', () => {
    const team = baseTeam('B-Class');
    const scouts = [scoutWithAge(19), scoutWithAge(14), scoutWithAge(14), scoutWithAge(14)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('may not have hikers over 18'))).toBe(true);
  });

  it('rejects leaders', () => {
    const team = baseTeam('B-Class');
    const scouts = [scoutWithAge(14), scoutWithAge(14), scoutWithAge(14), leaderScout()];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('leaders may not hike'))).toBe(true);
  });

  it('requires service crew', () => {
    const team = baseTeam('B-Class');
    const scouts = [scoutWithAge(14), scoutWithAge(14), scoutWithAge(13), scoutWithAge(13)];
    const errs = validateTeam(team, scouts, []);
    expect(errs.some(e => e.includes('Service crew required'))).toBe(true);
  });

  it('accepts valid B-Class team', () => {
    const team = baseTeam('B-Class');
    const scouts = [scoutWithAge(14), scoutWithAge(14), scoutWithAge(13), scoutWithAge(13)];
    expect(validateTeam(team, scouts, [supportMember()])).toHaveLength(0);
  });
});

describe('validateTeam - A-Class', () => {
  it('requires at least 3 scouts', () => {
    const team = baseTeam('A-Class');
    const scouts = [scoutWithAge(20), scoutWithAge(20)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('team size must be 3 or 4'))).toBe(true);
  });

  it('requires combined age >= 48', () => {
    const team = baseTeam('A-Class');
    const scouts = [scoutWithAge(15), scoutWithAge(15), scoutWithAge(15)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('combined age must be more than 48'))).toBe(true);
  });

  it('rejects leaders', () => {
    const team = baseTeam('A-Class');
    const scouts = [scoutWithAge(20), scoutWithAge(20), leaderScout()];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('leaders may not hike'))).toBe(true);
  });

  it('requires service crew', () => {
    const team = baseTeam('A-Class');
    const scouts = [scoutWithAge(20), scoutWithAge(20), scoutWithAge(20)];
    const errs = validateTeam(team, scouts, []);
    expect(errs.some(e => e.includes('Service crew required'))).toBe(true);
  });

  it('accepts valid team of 3 with combined age >= 48', () => {
    const team = baseTeam('A-Class');
    const scouts = [scoutWithAge(20), scoutWithAge(20), scoutWithAge(20)];
    expect(validateTeam(team, scouts, [supportMember()])).toHaveLength(0);
  });

  it('accepts valid team of 4', () => {
    const team = baseTeam('A-Class');
    const scouts = [scoutWithAge(18), scoutWithAge(17), scoutWithAge(17), scoutWithAge(16)];
    expect(validateTeam(team, scouts, [supportMember()])).toHaveLength(0);
  });

  it('rejects team larger than 4 (CODE_REVIEW_2026-08-13.md H3)', () => {
    const team = baseTeam('A-Class');
    const scouts = Array(5).fill(null).map(() => scoutWithAge(20));
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('team size must be 3 or 4'))).toBe(true);
  });
});

describe('validateTeam - V-Class', () => {
  it('requires at least 3 scouts', () => {
    const team = baseTeam('V-Class');
    const scouts = [scoutWithAge(40), scoutWithAge(40)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('team size must be 3 or 4'))).toBe(true);
  });

  it('team of 3 requires combined age >= 100', () => {
    const team = baseTeam('V-Class');
    const scouts = [scoutWithAge(30), scoutWithAge(30), scoutWithAge(30)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('combined age must be more than 100'))).toBe(true);
  });

  it('team of 4 requires combined age >= 133', () => {
    const team = baseTeam('V-Class');
    const scouts = [scoutWithAge(30), scoutWithAge(30), scoutWithAge(30), scoutWithAge(30)];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('combined age must be more than 133'))).toBe(true);
  });

  it('rejects leaders', () => {
    const team = baseTeam('V-Class');
    const scouts = [scoutWithAge(40), scoutWithAge(40), leaderScout()];
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('leaders may not hike'))).toBe(true);
  });

  it('requires service crew', () => {
    const team = baseTeam('V-Class');
    const scouts = [scoutWithAge(40), scoutWithAge(40), scoutWithAge(40)];
    const errs = validateTeam(team, scouts, []);
    expect(errs.some(e => e.includes('Service crew required'))).toBe(true);
  });

  it('accepts valid V-Class team of 3', () => {
    const team = baseTeam('V-Class');
    const scouts = [scoutWithAge(40), scoutWithAge(35), scoutWithAge(35)];
    expect(validateTeam(team, scouts, [supportMember()])).toHaveLength(0);
  });

  it('accepts valid V-Class team of 4', () => {
    const team = baseTeam('V-Class');
    const scouts = [scoutWithAge(40), scoutWithAge(35), scoutWithAge(35), scoutWithAge(35)];
    expect(validateTeam(team, scouts, [supportMember()])).toHaveLength(0);
  });

  it('rejects team larger than 4 (CODE_REVIEW_2026-08-13.md H3)', () => {
    const team = baseTeam('V-Class');
    const scouts = Array(5).fill(null).map(() => scoutWithAge(40));
    const errs = validateTeam(team, scouts, [supportMember()]);
    expect(errs.some(e => e.includes('team size must be 3 or 4'))).toBe(true);
  });
});

describe('getEntranceFee', () => {
  it('charges per non-leader scout at the standard rate', () => {
    const scouts = [scoutWithAge(14), scoutWithAge(14), scoutWithAge(14)];
    expect(getEntranceFee('A-Class', scouts)).toBe(3 * ENTRY_COST);
  });

  it('does not charge for leaders', () => {
    const scouts = [scoutWithAge(14), scoutWithAge(14), leaderScout()];
    expect(getEntranceFee('A-Class', scouts)).toBe(2 * ENTRY_COST);
  });

  it('returns 0 for empty team', () => {
    expect(getEntranceFee('A-Class', [])).toBe(0);
  });

  it('charges a flat £10 per Beaver team, regardless of team size', () => {
    const twoScouts = [scoutWithAge(7), scoutWithAge(7)];
    const fourScouts = [scoutWithAge(7), scoutWithAge(7), scoutWithAge(8), scoutWithAge(6)];
    expect(getEntranceFee(BEAVER_CLASS, twoScouts)).toBe(BEAVER_TEAM_FEE);
    expect(getEntranceFee(BEAVER_CLASS, fourScouts)).toBe(BEAVER_TEAM_FEE);
  });
});

describe('getPaymentStatus', () => {
  it('returns Paid when payment received', () => {
    const team = { ...baseTeam('A-Class'), paymentRecieved: true, paymentAmount: 30 };
    expect(getPaymentStatus(team, [scoutWithAge(14)])).toBe('Paid');
  });

  it('returns Partial when some payment made', () => {
    const team = { ...baseTeam('A-Class'), paymentAmount: 10 };
    const scouts = [scoutWithAge(14), scoutWithAge(14), scoutWithAge(14)];
    expect(getPaymentStatus(team, scouts)).toContain('Partial');
  });

  it('returns Unpaid when no payment', () => {
    const team = baseTeam('A-Class');
    expect(getPaymentStatus(team, [scoutWithAge(14)])).toBe('Unpaid');
  });
});
