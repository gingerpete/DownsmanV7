'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TeamModel, ScoutModel, SupportModel, UserModel } from '@/models/types';
import LoginDialog from '@/components/LoginDialog';
import RegisterDialog from '@/components/RegisterDialog';
import TeamDialog from '@/components/TeamDialog';
import AdminPanel from '@/components/AdminPanel';

// Refresh well before the id token's ~60 minute expiry so an open tab never
// hits a hard logout mid-session.
const SILENT_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

export default function Home() {
  const [user, setUser] = useState<Omit<UserModel, 'password'> | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [teams, setTeams] = useState<TeamModel[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamModel | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [addingTeam, setAddingTeam] = useState(false);
  const addingTeamRef = useRef(false);

  const locked = process.env.NEXT_PUBLIC_DM_LOCK === 'true';

  const loadTeams = useCallback(async () => {
    if (!user?.id) return;
    const res = await fetch(`/api/teams?ownerID=${user.id}`);
    const data: TeamModel[] = await res.json();
    setTeams(data);
    // Keep selectedTeam in sync with what was just saved. Without this, TeamDialog's
    // onClose (fired after save/submitTeam/withdrawTeam) only refreshed the `teams`
    // list, leaving selectedTeam frozen at whatever it was before the edit - so
    // reopening "Edit Team" without first re-clicking the row handed TeamDialog a
    // stale copy, and saving again silently reverted the change that was just made.
    setSelectedTeam(prev => (prev ? data.find(t => t.id === prev.id) ?? null : prev));
  }, [user?.id]);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  // Restore the session on load - without this, refreshing the page always
  // logs you out, since the only thing carrying login state used to be React
  // state with nothing behind it.
  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => (res.ok ? res.json() : null))
      .then(u => { if (u) setUser(u); })
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(async () => {
      const res = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!res.ok) { setUser(null); return; }
      setUser(await res.json());
    }, SILENT_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user]);

  const handleLogin = (u: Omit<UserModel, 'password'>) => {
    setUser(u);
    setShowLogin(false);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  const addTeam = async () => {
    // Synchronous ref guard, not just the `addingTeam` state check below - two clicks
    // landing before the first re-render would otherwise both pass a state-only check
    // and each mint a separate Team row (saveTeam() assigns a fresh uuid whenever id
    // is unset). See CODE_REVIEW_2026-08-13.md's H2.
    if (!user || addingTeamRef.current) return;
    addingTeamRef.current = true;
    setAddingTeam(true);
    try {
      const team: TeamModel = {
        ownerID: user.id!,
        teamName: 'New Team',
        leaderName: user.username,
        paymentAmount: 0,
        paymentRecieved: false,
        teamSubmitted: false,
        campingAtStart: false,
        committedToRun: false,
      };
      const res = await fetch('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(team) });
      const saved = await res.json();
      setSelectedTeam(saved);
      setShowTeamDialog(true);
      loadTeams();
    } finally {
      addingTeamRef.current = false;
      setAddingTeam(false);
    }
  };

  const deleteTeamHandler = async () => {
    if (!selectedTeam) return;
    await fetch('/api/teams', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectedTeam) });
    setSelectedTeam(null);
    loadTeams();
  };

  const editTeam = () => {
    if (selectedTeam) setShowTeamDialog(true);
  };

  if (checkingSession) {
    return <main className="max-w-4xl mx-auto p-6" />;
  }

  if (!user) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <img src="/downsman-logo.png" alt="Sussex Downsman Hike logo" className="w-16 h-16" />
          <h1 className="text-3xl font-bold">The Sussex Downsman Hike 2026 - Sign Up</h1>
        </div>
        {process.env.NEXT_PUBLIC_DM_DEV === 'true' && (
          <p className="text-yellow-400 mb-4">This is DEVELOPMENT</p>
        )}
        <div className="flex gap-4">
          <button onClick={() => setShowLogin(true)} className="bg-scout-purple px-4 py-2 rounded hover:bg-scout-purple-light">Login</button>
          <button onClick={() => setShowRegister(true)} className="bg-scout-teal-light px-4 py-2 rounded hover:bg-scout-teal">Register</button>
        </div>
        {showLogin && <LoginDialog onLogin={handleLogin} onClose={() => setShowLogin(false)} />}
        {showRegister && <RegisterDialog onClose={() => setShowRegister(false)} />}
      </main>
    );
  }

  const effectiveLocked = locked && !user.breakLock;

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/downsman-logo.png" alt="Sussex Downsman Hike logo" className="w-12 h-12" />
          <h1 className="text-2xl font-bold">The Sussex Downsman Hike 2026</h1>
        </div>
        <div className="flex items-center gap-4">
          {process.env.NEXT_PUBLIC_DM_DEV === 'true' && <span className="text-yellow-400">DEV</span>}
          {effectiveLocked && <span className="text-red-400">LOCKED</span>}
          <span>Logged in: {user.username}</span>
          {user.admin && <button onClick={() => setShowAdmin(true)} className="bg-scout-purple px-3 py-1 rounded hover:bg-scout-purple-light">Admin</button>}
          <button onClick={handleLogout} className="bg-scout-teal-light px-3 py-1 rounded hover:bg-scout-teal">Logout</button>
        </div>
      </div>

      {effectiveLocked && (
        <p className="text-red-300 mb-4">Entries have been CLOSED. If you need changes please mail web@downsman.com</p>
      )}

      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="border-b border-gray-600">
            <th className="text-left p-2">Team Name</th>
            <th className="text-left p-2">Hike Class</th>
            <th className="text-left p-2">Submitted</th>
            <th className="text-left p-2">Amount Paid</th>
            <th className="text-left p-2">Payment Received</th>
          </tr>
        </thead>
        <tbody>
          {teams.map(t => (
            <tr
              key={t.id}
              onClick={() => setSelectedTeam(t)}
              className={`border-b border-gray-700 cursor-pointer hover:bg-scout-purple/20 ${selectedTeam?.id === t.id ? 'bg-scout-purple/30' : ''}`}
            >
              <td className="p-2">{t.teamName}</td>
              <td className="p-2">{t.hikeClass || '-'}</td>
              <td className="p-2">{t.teamSubmitted ? 'Yes' : 'No'}</td>
              <td className="p-2">£{t.paymentAmount}</td>
              <td className="p-2">{t.paymentRecieved ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-4">
        <button onClick={deleteTeamHandler} disabled={!selectedTeam || effectiveLocked} className="bg-red-600 px-4 py-2 rounded disabled:opacity-50 hover:bg-red-700">Delete Team</button>
        <button onClick={editTeam} disabled={!selectedTeam} className="bg-scout-purple px-4 py-2 rounded disabled:opacity-50 hover:bg-scout-purple-light">{effectiveLocked ? 'View Team' : 'Edit Team'}</button>
        {!effectiveLocked && (
          <button onClick={addTeam} disabled={addingTeam} className="bg-green-600 px-4 py-2 rounded disabled:opacity-50 hover:bg-green-700">
            {addingTeam ? 'Adding…' : 'Add Team'}
          </button>
        )}
      </div>

      {showTeamDialog && selectedTeam && (
        <TeamDialog team={selectedTeam} locked={effectiveLocked} onClose={() => { setShowTeamDialog(false); loadTeams(); }} />
      )}

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </main>
  );
}
