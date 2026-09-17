'use client';

import { useState, useEffect, useCallback } from 'react';
import { TeamModel, UserModel } from '@/models/types';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Banner from './ui/Banner';
import { apiRequest, postJson, ApiError } from './ui/api';
import SystemConfig from './SystemConfig';

interface Props { onClose: () => void; }

const actionLinkClass = 'transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-scout-purple-light disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline';

export default function AdminPanel({ onClose }: Props) {
  const [tab, setTab] = useState<'users' | 'teams'>('users');
  const [users, setUsers] = useState<Omit<UserModel, 'password'>[]>([]);
  const [teams, setTeams] = useState<TeamModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [u, t] = await Promise.all([
        apiRequest<Omit<UserModel, 'password'>[]>('/api/admin'),
        apiRequest<TeamModel[]>('/api/teams?all=true'),
      ]);
      setUsers(u);
      setTeams(t);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const adminAction = async (key: string, action: string, data: Record<string, unknown>) => {
    setPending(key);
    setError('');
    try {
      const result = await postJson<{ tempPassword?: string }>('/api/admin', { action, ...data });
      if (action === 'resetPassword' && result.tempPassword && typeof data.username === 'string') {
        setTempPassword({ username: data.username, password: result.tempPassword });
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setPending(null);
    }
  };

  return (
    <Modal title="Admin Panel" onClose={onClose} maxWidthClass="max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={() => setTab('users')} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'users' ? 'bg-scout-purple text-white' : 'bg-scout-field text-gray-300 hover:bg-scout-field-border'}`}>Users</button>
          <button onClick={() => setTab('teams')} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'teams' ? 'bg-scout-purple text-white' : 'bg-scout-field text-gray-300 hover:bg-scout-field-border'}`}>Teams</button>
        </div>
        <div className="flex gap-2">
          {tab === 'teams' && <Button variant="secondary" onClick={() => window.open('/api/admin/export', '_blank')}>Export CSV</Button>}
          {tab === 'teams' && (
            <Button
              variant="secondary"
              onClick={() => {
                if (confirm('This includes every walker\'s name, date of birth and medical notes. The file will be a password-protected zip - only proceed if you have a genuine need for this (e.g. event safety), and share the password separately from the file itself.')) {
                  window.open('/api/admin/export?full=true', '_blank');
                }
              }}
            >
              Full Export (incl. medical)
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowConfig(true)}>System Config</Button>
        </div>
      </div>

      {error && <Banner tone="error">{error}</Banner>}
      {tempPassword && (
        <Banner tone="success">
          <p>Temporary password for <strong>{tempPassword.username}</strong>: <span className="font-mono">{tempPassword.password}</span></p>
          <p className="text-emerald-400/80">Share this with them directly - they&apos;ll be asked to set a new password on next login.</p>
        </Banner>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          {tab === 'users' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-scout-field-border text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="p-2 font-medium">Username</th>
                  <th className="p-2 font-medium">Admin</th>
                  <th className="p-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={3} className="p-4 text-center text-gray-500">No users yet.</td></tr>
                )}
                {users.map(u => {
                  const key = u.username;
                  const busy = pending === key;
                  return (
                    <tr key={u.username} className="border-b border-scout-field-border/60">
                      <td className="p-2">{u.username}</td>
                      <td className="p-2">{u.admin ? 'Yes' : 'No'}</td>
                      <td className="p-2 text-right space-x-3">
                        <button disabled={busy} onClick={() => adminAction(key, 'toggleAdmin', { username: u.username })} className={`${actionLinkClass} text-sky-400`}>Toggle Admin</button>
                        <button disabled={busy} onClick={() => adminAction(key, 'resetPassword', { username: u.username })} className={`${actionLinkClass} text-amber-400`}>Reset Password</button>
                        <button disabled={busy} onClick={() => adminAction(key, 'deleteUser', { username: u.username })} className={`${actionLinkClass} text-red-400`}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {tab === 'teams' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-scout-field-border text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="p-2 font-medium">Leader</th>
                  <th className="p-2 font-medium">Team</th>
                  <th className="p-2 font-medium">Class</th>
                  <th className="p-2 font-medium">Paid</th>
                  <th className="p-2 font-medium">Submitted</th>
                  <th className="p-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-gray-500">No teams yet.</td></tr>
                )}
                {teams.map(t => {
                  const key = t.id!;
                  const busy = pending === key;
                  return (
                    <tr key={t.id} className="border-b border-scout-field-border/60">
                      <td className="p-2">{t.leaderName}</td>
                      <td className="p-2">{t.teamName}</td>
                      <td className="p-2">{t.hikeClass || '-'}</td>
                      <td className="p-2">{t.paymentRecieved ? 'Yes' : `£${t.paymentAmount}`}</td>
                      <td className="p-2">{t.teamSubmitted ? 'Yes' : 'No'}</td>
                      <td className="p-2 text-right space-x-3">
                        <button disabled={busy} onClick={() => adminAction(key, 'togglePaid', { team: t })} className={`${actionLinkClass} text-sky-400`}>Toggle Paid</button>
                        <button disabled={busy} onClick={() => adminAction(key, 'toggleSubmitted', { team: t })} className={`${actionLinkClass} text-amber-400`}>Toggle Submitted</button>
                        <button disabled={busy} onClick={() => adminAction(key, 'deleteTeam', { team: t })} className={`${actionLinkClass} text-red-400`}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showConfig && <SystemConfig onClose={() => setShowConfig(false)} />}
    </Modal>
  );
}
