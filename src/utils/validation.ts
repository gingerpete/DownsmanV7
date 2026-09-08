import { ScoutModel, TeamModel, SupportModel } from '../models/types';
import { HIKE_DATE, BEAVER_CLASS, ENTRY_COST, BEAVER_TEAM_FEE } from '../models/referenceData';
import { calculateAge } from './date';

function nullOrEmpty(s: string | undefined | null): boolean {
  return !s || s.trim().length === 0;
}

export function validateTeam(model: TeamModel, scouts: ScoutModel[], support: SupportModel[]): string[] {
  const results: string[] = [];

  if (nullOrEmpty(model.teamName)) results.push('Team Name Cant Be Empty');
  if (nullOrEmpty(model.hikeClass)) results.push('Hike Class Cant Be Empty');
  if (nullOrEmpty(model.activeMobile)) results.push('Active mobile cant be empty');
  if (nullOrEmpty(model.backupMobile)) results.push('Backup mobile cant be empty');
  if (nullOrEmpty(model.emergencyContactLandline) || nullOrEmpty(model.emergencyContactEmail) ||
      nullOrEmpty(model.emergencyContactName) || nullOrEmpty(model.emergencyContactMobile)) {
    results.push('Complete emergency contact information');
  }
  if (!scouts || scouts.length === 0) results.push('Missing some scouts?');

  if (results.length > 0) {
    results.push('Missing mandatory fields fix these before validation can be completed');
    return results;
  }

  const hikeClass = model.hikeClass;
  if (!hikeClass) return results;

  const teamSize = scouts.length;
  let leader = false;
  const intAges: number[] = [];

  for (const s of scouts) {
    if (s.leader) { leader = true; }
    else { intAges.push(Math.floor(calculateAge(s.dobEpoch, HIKE_DATE))); }
  }

  const intCombinedAge = intAges.reduce((a, b) => a + b, 0);
  const minAge = intAges.length > 0 ? Math.min(...intAges) : 0;
  const maxAge = intAges.length > 0 ? Math.max(...intAges) : 0;
  const serviceCrew = support.length > 0;

  if (minAge === 0 && intAges.length > 0) {
    results.push('Please ensure date of birth is entered for all (non leader) hikers');
  }

  const openClasses = [
    'Open, Bignor - Washington', 'Open, Bignor - Steyning',
    'Open, Plumpton - Firle', 'Open, Plumpton - Itford', 'Open, Itford - Eastbourne',
    BEAVER_CLASS,
  ];

  if (openClasses.includes(hikeClass)) {
    if (teamSize < 3 || teamSize > 6) results.push('For Open, team size must be between 3 and 6');
    if (minAge < 12 && !leader) results.push('For Open, if min age is less than 12 you have to have a leader hiking');
  } else if (hikeClass === 'B-Class') {
    if (teamSize !== 4) results.push(`For B-Class team size must be 4 your team is ${teamSize}`);
    if (leader) results.push('For B-Class leaders may not hike');
    if (intCombinedAge < 48) results.push(`For B-Class combined age must be more than 48 your combined age is ${intCombinedAge}`);
    if (!serviceCrew) results.push('Service crew required for B-Class');
    if (maxAge > 18) results.push(`For B-Class may not have hikers over 18 your max age is ${maxAge}`);
  } else if (hikeClass === 'A-Class') {
    if (teamSize < 3 || teamSize > 4) results.push(`For A-Class team size must be 3 or 4 your team is ${teamSize}`);
    if (leader) results.push('For A-Class leaders may not hike');
    if (intCombinedAge < 48) results.push(`For A-Class combined age must be more than 48 your combined age is ${intCombinedAge}`);
    if (!serviceCrew) results.push('Service crew required for A-Class');
  } else if (hikeClass === 'V-Class') {
    if (teamSize < 3 || teamSize > 4) results.push(`For V-Class team size must be 3 or 4 your team size is ${teamSize}`);
    if (leader) results.push('For V-Class leaders may not hike');
    if (teamSize === 3 && intCombinedAge < 100) results.push(`For V-Class team of three combined age must be more than 100 your combined age is ${intCombinedAge}`);
    if (teamSize === 4 && intCombinedAge < 133) results.push(`For V-Class team of four combined age must be more than 133 your combined age is ${intCombinedAge}`);
    if (!serviceCrew) results.push('Service crew required for V-Class');
  } else if (hikeClass === 'S-Class' || hikeClass === 'S-Class walk') {
    if (teamSize !== 4) results.push(`For S-Class team size must be 4 your team size is ${teamSize}`);
    if (leader) results.push('For S-Class leaders may not hike');
    if (intCombinedAge < 48) results.push(`For S-Class combined age must be more than 48 your combined age is ${intCombinedAge}`);
    if (maxAge > 14.5) results.push(`For S-Class max age must be less than 14.5 your max age is ${maxAge}`);
    if (!serviceCrew) results.push('Service crew required for S-Class');
  } else if (hikeClass === 'E-Class') {
    if (teamSize !== 4) results.push(`For E-Class team size must be 4 your team size is ${teamSize}`);
    if (leader) results.push('For E-Class leaders may not hike');
    if (intCombinedAge < 48) results.push(`For E-Class combined age must be more than 48 your combined age is ${intCombinedAge}`);
    if (intCombinedAge > 62) results.push(`For E-Class combined age must be less than 62 your combined age is ${intCombinedAge}`);
    if (!serviceCrew) results.push('Service crew required for E-Class');
    if (maxAge > 18) results.push(`For E-Class may not have hikers over 18 your max age is ${maxAge}`);
  }

  return results;
}

export function getEntranceFee(hikeClass: string | undefined, scouts: ScoutModel[]): number {
  if (hikeClass === BEAVER_CLASS) return BEAVER_TEAM_FEE;
  return scouts.filter(s => !s.leader).length * ENTRY_COST;
}

export function getPaymentStatus(team: TeamModel, scouts: ScoutModel[]): string {
  if (team.paymentRecieved) return 'Paid';
  if (team.paymentAmount > 0) return `Partial (£${team.paymentAmount} of £${getEntranceFee(team.hikeClass, scouts)})`;
  return 'Unpaid';
}
