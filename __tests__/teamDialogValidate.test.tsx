import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TeamDialog from '@/components/TeamDialog';
import { TeamModel, ScoutModel, SupportModel } from '@/models/types';
import { HIKE_DATE } from '@/models/referenceData';
import { dateToEpochDay } from '@/utils/date';

function scoutWithAge(age: number): ScoutModel {
  const dobEpoch = dateToEpochDay({ year: HIKE_DATE.year - age, month: HIKE_DATE.month, day: HIKE_DATE.day });
  return { id: `s-${age}`, ownerID: 'team-1', fullName: `Scout ${age}`, dobEpoch, leader: false };
}

function validTeam(): TeamModel {
  return {
    id: 'team-1',
    ownerID: 'user-1',
    teamName: 'Test Team',
    hikeClass: 'Open, Bignor - Washington',
    activeMobile: '07777',
    backupMobile: '07888',
    emergencyContactName: 'EC Name',
    emergencyContactMobile: '07999',
    emergencyContactLandline: '01234',
    emergencyContactEmail: 'ec@test.com',
    paymentAmount: 0,
    paymentRecieved: false,
    teamSubmitted: false,
    campingAtStart: false,
    committedToRun: false,
  };
}

function mockFetch(scouts: ScoutModel[], support: SupportModel[]) {
  return jest.fn(async (url: string) => {
    if (url.startsWith('/api/scouts')) return { ok: true, json: async () => scouts };
    if (url.startsWith('/api/support')) return { ok: true, json: async () => support };
    if (url === '/api/teams') return { ok: true, json: async () => validTeam() };
    throw new Error(`Unhandled fetch in test: ${url}`);
  });
}

describe('TeamDialog - Validate feedback', () => {
  it('shows a success banner with a Submit Team action when the team is valid', async () => {
    global.fetch = mockFetch([scoutWithAge(14), scoutWithAge(15), scoutWithAge(16)], []) as unknown as typeof fetch;

    render(<TeamDialog team={validTeam()} locked={false} onClose={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Validate' }));

    expect(await screen.findByText(/meets all the requirements/i)).toBeInTheDocument();
    // Two "Submit Team" buttons now exist: the one in the button row, and the new
    // one inside the success banner.
    expect(screen.getAllByRole('button', { name: 'Submit Team' })).toHaveLength(2);
  });

  it('shows only the error banner (no success banner) when the team is invalid', async () => {
    global.fetch = mockFetch([], []) as unknown as typeof fetch;

    render(<TeamDialog team={validTeam()} locked={false} onClose={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Missing some scouts?')).toBeInTheDocument();
    expect(screen.queryByText(/meets all the requirements/i)).not.toBeInTheDocument();
  });

  it('clears the success banner if a field is edited after validating', async () => {
    global.fetch = mockFetch([scoutWithAge(14), scoutWithAge(15), scoutWithAge(16)], []) as unknown as typeof fetch;

    render(<TeamDialog team={validTeam()} locked={false} onClose={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Validate' }));
    expect(await screen.findByText(/meets all the requirements/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Team Name'), { target: { value: 'Renamed Team' } });
    expect(screen.queryByText(/meets all the requirements/i)).not.toBeInTheDocument();
  });
});
