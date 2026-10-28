'use client';

import { useState } from 'react';
import { Monitor, Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';

type Item = Record<string, any>;
type Action = (path: string, body?: Item, message?: string, close?: boolean) => Promise<boolean>;
const kinds: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', computer: 'Computer', 'shared-screen': 'Shared screen' };
const statuses: Record<string, string> = { untested: 'Not tested', working: 'Working', issues: 'Has issues' };

export function DeviceInventory({ data, parent, busy, act }: { data: Item; parent: boolean; busy: boolean; act: Action }) {
  const [editing, setEditing] = useState<Item | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const devices: Item[] = data.deviceInventory || [];
  return <section className="panel section-gap inventory-panel">
    <div className="panel-heading"><div><h2>Our devices <span className="count">{devices.length}</span></h2><p>Keep track of the phones, tablets and computers your family uses.</p></div>{parent && <button className="button secondary" onClick={() => setEditing({})}><Plus size={15} /> Add device</button>}</div>
    {!devices.length && <div className="inventory-empty"><Monitor size={32} /><p>No devices recorded yet.</p><small>{parent ? 'Add a device with its operating system and browser to start your family inventory.' : 'A parent can add the devices your family uses.'}</small></div>}
    <div className="inventory-list">{devices.map(device => <article className="inventory-device" key={device.id}>
      <span className="inventory-icon">{device.kind === 'phone' ? <Smartphone size={22} /> : <Monitor size={22} />}</span>
      <div><h3>{device.name}</h3><p>{kinds[device.kind]} · {device.system} · {device.browser}</p><small>{data.members.find((m: Item) => m.id === device.memberId)?.name || 'Shared household device'}</small>{device.notes && <p>{device.notes}</p>}</div>
      <span className={`inventory-status ${device.compatibility}`}>{statuses[device.compatibility]}</span>
      {parent && <div className="row-actions"><button className="icon-button" aria-label={`Edit ${device.name}`} onClick={() => { setEditing(device); setRemoving(null); }}><Pencil size={16} /></button>{removing === device.id ? <><button className="text-button danger" disabled={busy} onClick={async () => { if (await act('inventory/remove', { id: device.id }, 'Device removed.', false)) setRemoving(null); }}>Confirm removal</button><button className="text-button" onClick={() => setRemoving(null)}>Cancel</button></> : <button className="icon-button" aria-label={`Remove ${device.name}`} onClick={() => setRemoving(device.id)}><Trash2 size={16} /></button>}</div>}
    </article>)}</div>
    {parent && editing && <form className="inventory-form" key={editing.id || 'new'} onSubmit={async event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (await act('inventory/save', { ...values, ...(editing.id ? { id: editing.id } : {}) }, 'Device inventory saved.', false)) setEditing(null);
    }}>
      <h3>{editing.id ? 'Edit device' : 'Add a device'}</h3>
      <div className="form-grid"><label className="field"><span>Device name / model</span><input name="name" required maxLength={80} defaultValue={editing.name || ''} placeholder="e.g. Mum’s iPhone 14" /></label><label className="field"><span>Device type</span><select name="kind" defaultValue={editing.kind || 'phone'}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="field"><span>Operating system</span><input name="system" required maxLength={80} defaultValue={editing.system || ''} placeholder="e.g. iOS 18, Android 15, Windows 11" /></label><label className="field"><span>Browser</span><input name="browser" required maxLength={80} defaultValue={editing.browser || ''} placeholder="e.g. Safari, Chrome, Firefox" /></label>
      <label className="field"><span>Used by</span><select name="memberId" defaultValue={editing.memberId || ''}><option value="">Shared household device</option>{data.members.map((m: Item) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="field"><span>Compatibility check</span><select name="compatibility" defaultValue={editing.compatibility || 'untested'}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <label className="field"><span>Notes</span><textarea name="notes" maxLength={250} defaultValue={editing.notes || ''} placeholder="Any display, sign-in or navigation issues?" /></label>
      <p className="muted small-text">Compatibility is recorded by your family after testing. Adding a device here does not pair it or grant access.</p>
      <div className="row-actions"><button className="button primary" disabled={busy}>Save device</button><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
  </section>;
}
