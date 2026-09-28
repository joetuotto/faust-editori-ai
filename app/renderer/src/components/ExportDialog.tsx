import { useState } from 'react';
import type { ExportFormat } from '../../../shared/types';
import { useStore } from '../store';
import { Dialog } from './Dialog';

const FORMATS: { format: ExportFormat; name: string; description: string }[] = [
  { format: 'manuscript', name: 'Käsikirjoitus kustantamolle (.docx)', description: 'Nimiösivu ja sanamäärä, 12 pt, riviväli 1,5, ylätunniste ja sivunumerot.' },
  { format: 'epub', name: 'E-kirja (.epub)', description: 'EPUB 3 lukulaitteille ja -sovelluksille, sisällysluettelo mukana.' },
  { format: 'docx', name: 'Word (.docx)', description: 'Kirjan näköinen taitto. Luvut alkavat uudelta sivulta.' },
  { format: 'md', name: 'Markdown (.md)', description: 'Pelkkä teksti muotoiluineen, toimii kaikkialla.' },
  { format: 'html', name: 'HTML (.html)', description: 'Luettava verkkosivu, tulostettavissa selaimesta PDF:ksi.' },
  { format: 'txt', name: 'Teksti (.txt)', description: 'Ilman muotoilua.' },
  { format: 'provenance', name: 'AI-selvitys (.md)', description: 'Kuinka suuri osa tekstistä on omaa, tekoälyn muokkaamaa tai tekoälyn kirjoittamaa, luvuittain.' }
];

export function ExportDialog() {
  const { setPanel, flush, notify } = useStore.getState();
  const [busy, setBusy] = useState(false);

  const run = async (format: ExportFormat) => {
    setBusy(true);
    await flush();
    const result = await window.faust.project.export(format);
    setBusy(false);
    if (!result) return;
    if (result.success) {
      notify(`Viety: ${result.data}`);
      setPanel('none');
    } else {
      notify(result.error, 'error');
    }
  };

  return (
    <Dialog title="Vie käsikirjoitus" onClose={() => setPanel('none')}>
      <p className="muted" style={{ marginTop: 0 }}>
        Koko käsikirjoitus sisällyksen järjestyksessä. Kohtausten väliin tulee kohtauskatko.
      </p>
      {FORMATS.map(f => (
        <div key={f.format} className="recent-item" onClick={() => !busy && void run(f.format)}>
          <div>
            <div className="name">{f.name}</div>
            <div className="path">{f.description}</div>
          </div>
          <span className="muted">→</span>
        </div>
      ))}
    </Dialog>
  );
}
