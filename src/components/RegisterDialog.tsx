'use client';

import { useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Banner from './ui/Banner';
import { inputClass } from './ui/form';
import { postJson, ApiError } from './ui/api';

interface Props { onClose: () => void; }

export default function RegisterDialog({ onClose }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (!/^[^\s]+$/.test(username)) { setError('Username cannot contain spaces'); return; }
    setError('');
    setLoading(true);
    try {
      await postJson('/api/auth', { action: 'register', username, password, email, mobile });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Modal title="Success!" onClose={onClose}>
        <p className="mb-5 text-sm text-gray-300">User {username} registered. You can now login.</p>
        <div className="flex justify-end">
          <Button onClick={onClose}>OK</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Register" onClose={onClose}>
      {error && <Banner tone="error">{error}</Banner>}
      <div className="space-y-3">
         <div>
          <input className={inputClass} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <p className="mt-1 text-xs text-gray-400">No spaces - use a single word, e.g. johnsmith</p>
        </div>
        <input className={inputClass} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className={inputClass} placeholder="Phone" value={mobile} onChange={e => setMobile(e.target.value)} />
        <input className={inputClass} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        <input className={inputClass} type="password" placeholder="Confirm Password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={loading}>Register</Button>
      </div>
    </Modal>
  );
}
