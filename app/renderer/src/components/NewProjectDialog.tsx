import { useState } from 'react';
import { newProject } from '../actions';
import { Dialog } from './Dialog';

export function NewProjectDialog({ onClose }: { onClose(): void }) {
  const [title, setTitle] = useState('');

  return (
    <Dialog title="Uusi projekti" onClose={onClose}>
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (await newProject(title)) onClose();
        }}
      >
        <label className="field">
          <span>Teoksen nimi</span>
          <input className="input" autoFocus value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <p className="muted">Projekti luodaan kansioksi valitsemaasi paikkaan. Jokainen luku on oma tekstitiedostonsa.</p>
        <button className="btn primary" type="submit">
          Valitse kansio ja luo
        </button>
      </form>
    </Dialog>
  );
}
