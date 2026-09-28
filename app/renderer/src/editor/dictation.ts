/**
 * Dictation: record from the microphone, transcribe when the writer stops,
 * insert the text at the cursor. Dictated text is the writer's own words, so
 * it carries no AI provenance mark.
 */
import { useStore } from '../store';
import { getFocusedEditor } from './activeEditor';

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

function pickMime(): string {
  for (const type of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

async function start() {
  const { notify } = useStore.getState();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    notify('Mikrofonia ei saatu käyttöön.', 'error');
    return;
  }
  const mime = pickMime();
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  chunks = [];
  recorder.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
  recorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    void finish(new Blob(chunks, { type: recorder?.mimeType || mime || 'audio/webm' }));
    recorder = null;
  };
  recorder.start(1000);
  useStore.setState({ dictation: { state: 'recording', since: Date.now() } });
}

async function finish(audio: Blob) {
  const { notify, project, activeId } = useStore.getState();
  useStore.setState({ dictation: { state: 'transcribing', since: Date.now() } });
  const result = await window.faust.ai.transcribe(new Uint8Array(await audio.arrayBuffer()), audio.type, project?.manifest.language ?? 'fi');
  useStore.setState({ dictation: null });
  if (!result.success) return notify(result.error ?? 'Litterointi epäonnistui.', 'error');
  const text = result.text?.trim();
  if (!text) return notify('Nauhoituksesta ei tunnistettu puhetta.');

  const target = getFocusedEditor(activeId);
  if (!target) {
    void navigator.clipboard.writeText(text);
    return notify('Teksti kopioitiin leikepöydälle, koska dokumenttia ei ollut auki.');
  }
  const { editor } = target;
  const { from } = editor.state.selection;
  const before = editor.state.doc.textBetween(Math.max(0, from - 1), from);
  const spaced = before && !/\s/.test(before) ? ` ${text}` : text;
  editor.chain().focus().insertContent({ type: 'text', text: spaced }).run();
}

/** Start or stop dictation (menu ⌥⌘D and the status bar button) */
export function toggleDictation() {
  const state = useStore.getState().dictation?.state;
  if (state === 'transcribing') return;
  if (recorder && recorder.state === 'recording') recorder.stop();
  else void start();
}
