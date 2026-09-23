'use client';

import { useState, useEffect, useRef } from 'react';
import { TeamModel, ScoutModel, SupportModel } from '@/models/types';
import { HIKE_CLASSES } from '@/models/referenceData';
import { validateTeam, getPaymentStatus } from '@/utils/validation';
import ScoutDialog from './ScoutDialog';
import SupportDialogComponent from './SupportDialog';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Banner from './ui/Banner';
import { inputClass, selectClass, fieldsetLegendClass } from './ui/form';
import { apiRequest, postJson, deleteJson, ApiError } from './ui/api';

interface Props {
  team: TeamModel;
  locked: boolean;
  adminOverride?: boolean;
  onClose: () => void;
}

export default function TeamDialog({ team, locked, adminOverride = false, onClose }: Props) {
  const [model, setModel] = useState<TeamModel>({ ...team });
  const [scouts, setScouts] = useState<ScoutModel[]>([]);
  const [support, setSupport] = useState<SupportModel[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  // Whether the *current* model has been validated - distinct from errors.length===0,
  // which is also true before Validate has ever been clicked. Reset on any change that
  // could affect validity, so a stale "Valid" banner never survives an edit.
  const [validated, setValidated] = useState(false);
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [rowPending, setRowPending] = useState<string | null>(null);
  const [showScoutDialog, setShowScoutDialog] = useState(false);
  const [editingScout, setEditingScout] = useState<ScoutModel | null>(null);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [editingSupport, setEditingSupport] = useState<SupportModel | null>(null);
  // Synchronous guard against a fast double-click on Submit, which a state-only
  // check can miss. See CODE_REVIEW_2026-08-13.md's H2.
  const submittingRef = useRef(false);

  const disabled = (model.teamSubmitted || locked) && !adminOverride;

  useEffect(() => {
    if (!team.id) { setLoadingChildren(false); return; }
    setLoadingChildren(true);
    Promise.all([
      apiRequest<ScoutModel[]>(`/api/scouts?ownerID=${team.id}`),
      apiRequest<SupportModel[]>(`/api/support?ownerID=${team.id}`),
    ])
      .then(([s, sup]) => { setScouts(s); setSupport(sup); })
      .catch(e => setApiError(e instanceof ApiError ? e.message : 'Could not load team details'))
      .finally(() => setLoadingChildren(false));
  }, [team.id]);

  const update = (field: keyof TeamModel, value: string | boolean) => {
    setModel(m => ({ ...m, [field]: value }));
    setValidated(false);
  };

  const save = async (close = true) => {
    setApiError('');
    setSaving(true);
    try {
      await postJson('/api/teams', model);
      if (close) onClose();
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Could not save team');
    } finally {
      setSaving(false);
    }
  };

  const validate = () => {
    const errs = validateTeam(model, scouts, support);
    setErrors(errs);
    setValidated(true);
    return errs.length === 0;
  };

  const submitTeam = async () => {
    if (submittingRef.current || !validate()) return;
    submittingRef.current = true;
    setApiError('');
    setSubmitting(true);
    try {
      await postJson('/api/teams', { ...model, teamSubmitted: true });
      setModel(m => ({ ...m, teamSubmitted: true }));
      onClose();
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Could not submit team');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const withdrawTeam = async () => {
    setApiError('');
    setWithdrawing(true);
    try {
      await postJson('/api/teams', { ...model, teamSubmitted: false });
      setModel(m => ({ ...m, teamSubmitted: false }));
      onClose();
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Could not withdraw team');
    } finally {
      setWithdrawing(false);
    }
  };

  const saveScout = async (scout: ScoutModel) => {
    scout.ownerID = team.id!;
    const saved = await postJson<ScoutModel>('/api/scouts', scout);
    setScouts(prev => {
      const idx = prev.findIndex(s => s.id === saved.id);
      return idx >= 0 ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved];
    });
    setValidated(false);
    setShowScoutDialog(false);
    setEditingScout(null);
  };

  const deleteScout = async (scout: ScoutModel) => {
    setApiError('');
    setRowPending(scout.id!);
    try {
      await deleteJson('/api/scouts', { ownerID: scout.ownerID, id: scout.id });
      setScouts(prev => prev.filter(s => s.id !== scout.id));
      setValidated(false);
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Could not delete scout');
    } finally {
      setRowPending(null);
    }
  };

  const saveSupportMember = async (s: SupportModel) => {
    s.ownerID = team.id!;
    const saved = await postJson<SupportModel>('/api/support', s);
    setSupport(prev => {
      const idx = prev.findIndex(x => x.id === saved.id);
      return idx >= 0 ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved];
    });
    setValidated(false);
    setShowSupportDialog(false);
    setEditingSupport(null);
  };

  const deleteSupportMember = async (s: SupportModel) => {
    setApiError('');
    setRowPending(s.id!);
    try {
      await deleteJson('/api/support', { ownerID: s.ownerID, id: s.id });
      setSupport(prev => prev.filter(x => x.id !== s.id));
      setValidated(false);
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Could not delete support contact');
    } finally {
      setRowPending(null);
    }
  };

  return (
    <Modal
      title={`Team: ${model.teamName}`}
      subtitle={`Payment: ${getPaymentStatus(model, scouts)}  ·  Submitted: ${model.teamSubmitted ? 'Yes' : 'No'}`}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
    >
      {apiError && <Banner tone="error">{apiError}</Banner>}
      {errors.length > 0 && (
        <Banner tone="error">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </Banner>
      )}
      {validated && errors.length === 0 && !model.teamSubmitted && (
        <Banner tone="success">
          <p>This team meets all the requirements for {model.hikeClass} and is ready to submit.</p>
          <div className="mt-2">
            <Button variant="success" onClick={submitTeam} loading={submitting}>Submit Team</Button>
          </div>
        </Banner>
      )}

      {loadingChildren ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading team details...</p>
      ) : (
        <>
          <fieldset disabled={disabled} className="mb-6">
            <legend className={fieldsetLegendClass}>Team Details</legend>
            <div className="grid grid-cols-2 gap-3">
              <input className={inputClass} placeholder="Team Name" value={model.teamName || ''} onChange={e => update('teamName', e.target.value)} />
              <select className={selectClass} value={model.hikeClass || ''} onChange={e => update('hikeClass', e.target.value)}>
                <option value="">Select Hike Class</option>
                {HIKE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className={inputClass} placeholder="Section" value={model.section || ''} onChange={e => update('section', e.target.value)} />
              <input className={inputClass} placeholder="Group Name" value={model.groupName || ''} onChange={e => update('groupName', e.target.value)} />
              <input className={inputClass} placeholder="District" value={model.district || ''} onChange={e => update('district', e.target.value)} />
              <input className={inputClass} placeholder="County" value={model.county || ''} onChange={e => update('county', e.target.value)} />
            </div>
          </fieldset>

          <fieldset disabled={disabled} className="mb-6">
            <legend className={fieldsetLegendClass}>Team Phones</legend>
            <div className="grid grid-cols-2 gap-3">
              <input className={inputClass} placeholder="Active Phone" value={model.activeMobile || ''} onChange={e => update('activeMobile', e.target.value)} />
              <input className={inputClass} placeholder="Backup Phone" value={model.backupMobile || ''} onChange={e => update('backupMobile', e.target.value)} />
            </div>
          </fieldset>

          <div className="mb-6">
            <h3 className={fieldsetLegendClass}>Hiking Team</h3>
            <div className="overflow-x-auto">
              <table className="mb-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-scout-field-border text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="p-1.5 font-medium">Name</th>
                    <th className="p-1.5 font-medium">DOB</th>
                    <th className="p-1.5 font-medium">Leader</th>
                    <th className="p-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {scouts.length === 0 && (
                    <tr><td colSpan={4} className="p-3 text-center text-gray-500">No scouts added yet.</td></tr>
                  )}
                  {scouts.map(s => (
                    <tr key={s.id} className="border-b border-scout-field-border/60">
                      <td className="p-1.5">{s.fullName}</td>
                      <td className="p-1.5">{s.dobEpoch ? new Date(s.dobEpoch * 86400000).toLocaleDateString('en-GB') : 'N/A'}</td>
                      <td className="p-1.5">{s.leader ? 'Yes' : 'No'}</td>
                      <td className="p-1.5 text-right space-x-2">
                        {!disabled && <>
                          <button disabled={rowPending === s.id} onClick={() => { setEditingScout(s); setShowScoutDialog(true); }} className="text-sky-400 transition hover:underline disabled:opacity-40">Edit</button>
                          <button disabled={rowPending === s.id} onClick={() => deleteScout(s)} className="text-red-400 transition hover:underline disabled:opacity-40">Delete</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!disabled && <Button variant="success" onClick={() => { setEditingScout(null); setShowScoutDialog(true); }}>Add Scout</Button>}
          </div>

          <div className="mb-6">
            <h3 className={fieldsetLegendClass}>Support Team</h3>
            <div className="overflow-x-auto">
              <table className="mb-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-scout-field-border text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="p-1.5 font-medium">Name</th>
                    <th className="p-1.5 font-medium">Phone</th>
                    <th className="p-1.5 font-medium">From</th>
                    <th className="p-1.5 font-medium">To</th>
                    <th className="p-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {support.length === 0 && (
                    <tr><td colSpan={5} className="p-3 text-center text-gray-500">No support crew added yet.</td></tr>
                  )}
                  {support.map(s => (
                    <tr key={s.id} className="border-b border-scout-field-border/60">
                      <td className="p-1.5">{s.fullName}</td>
                      <td className="p-1.5">{s.phoneNumber}</td>
                      <td className="p-1.5">{s.from}</td>
                      <td className="p-1.5">{s.to}</td>
                      <td className="p-1.5 text-right space-x-2">
                        {!disabled && <>
                          <button disabled={rowPending === s.id} onClick={() => { setEditingSupport(s); setShowSupportDialog(true); }} className="text-sky-400 transition hover:underline disabled:opacity-40">Edit</button>
                          <button disabled={rowPending === s.id} onClick={() => deleteSupportMember(s)} className="text-red-400 transition hover:underline disabled:opacity-40">Delete</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!disabled && <Button variant="success" onClick={() => { setEditingSupport(null); setShowSupportDialog(true); }}>Add Support</Button>}
          </div>

          <fieldset disabled={disabled} className="mb-6">
            <legend className={fieldsetLegendClass}>Emergency Contact</legend>
            <div className="grid grid-cols-2 gap-3">
              <input className={inputClass} placeholder="Name" value={model.emergencyContactName || ''} onChange={e => update('emergencyContactName', e.target.value)} />
              <input className={inputClass} placeholder="Email" value={model.emergencyContactEmail || ''} onChange={e => update('emergencyContactEmail', e.target.value)} />
              <input className={inputClass} placeholder="Mobile" value={model.emergencyContactMobile || ''} onChange={e => update('emergencyContactMobile', e.target.value)} />
              <input className={inputClass} placeholder="Landline" value={model.emergencyContactLandline || ''} onChange={e => update('emergencyContactLandline', e.target.value)} />
            </div>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-3">
            {!disabled && (
              <>
                <Button variant="warning" onClick={validate}>Validate</Button>
                {!model.teamSubmitted
                  ? <Button variant="success" onClick={submitTeam} loading={submitting}>Submit Team</Button>
                  : <Button variant="caution" onClick={withdrawTeam} loading={withdrawing}>Withdraw</Button>
                }
                <Button onClick={() => save(true)} loading={saving}>Save</Button>
              </>
            )}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </>
      )}

      {showScoutDialog && <ScoutDialog scout={editingScout} onSave={saveScout} onClose={() => setShowScoutDialog(false)} />}
      {showSupportDialog && <SupportDialogComponent support={editingSupport} onSave={saveSupportMember} onClose={() => setShowSupportDialog(false)} />}
    </Modal>
  );
}
