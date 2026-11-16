/**
 * ErrorBoundary - keeps one broken view from blanking the whole window
 *
 * React unmounts everything above an error that is thrown while rendering,
 * unless a boundary catches it. FAUST had none, so a bad value in one dialog
 * left an empty window and took unsaved work with it.
 *
 * Two uses:
 *  - around a panel or dialog: e(ErrorBoundary, { label, onDismiss }, view)
 *    The view is replaced by a small notice; "Sulje näkymä" calls onDismiss
 *    (which should close the view) and the rest of the app keeps running.
 *  - around the app: e(ErrorBoundary, { label, root: true }, app)
 *    Last resort. The notice offers a reload; unsaved work is offered back
 *    from the recovery copy at start.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */

const e = React.createElement;

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary] ${this.props.label || 'view'} failed:`, error, info && info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children || null;

    const { label, root, onDismiss } = this.props;
    const dismiss = () => {
      if (onDismiss) onDismiss();
      this.setState({ error: null });
    };

    const card = e('div', {
      role: 'alert',
      style: {
        maxWidth: '460px',
        padding: '20px 24px',
        background: 'var(--bg-secondary, #f4efe6)',
        color: 'var(--text, #222)',
        border: '1px solid var(--border-color, rgba(128,128,128,0.4))',
        borderRadius: '8px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
        fontFamily: 'EB Garamond, Georgia, serif',
        fontSize: '15px',
        lineHeight: '1.5'
      }
    },
      e('div', { style: { fontSize: '19px', fontWeight: 600, marginBottom: '8px' } },
        root ? 'FAUSTissa tapahtui virhe' : `Näkymä ”${label}” ei auennut`),
      e('div', null, root
        ? 'Ikkunan sisältöä ei voitu näyttää. Lataa sovellus uudelleen: tallentamaton työ tarjotaan palautettavaksi käynnistyksessä.'
        : 'Näkymässä tapahtui virhe. Käsikirjoituksesi on tallessa ja muu sovellus toimii.'),
      e('div', {
        style: { marginTop: '10px', fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--text-3, #777)', wordBreak: 'break-word' }
      }, String((error && error.message) || error)),
      e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' } },
        e('button', {
          onClick: root ? () => window.location.reload() : dismiss,
          style: {
            padding: '8px 16px',
            background: 'var(--sigil, var(--bronze, #b08d57))',
            border: 'none',
            borderRadius: '4px',
            color: '#000',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '12px',
            fontWeight: 600
          }
        }, root ? 'Lataa uudelleen' : 'Sulje näkymä')
      )
    );

    return e('div', {
      style: {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: root ? 'var(--bg, #fff)' : 'rgba(0, 0, 0, 0.45)',
        zIndex: 20000
      }
    }, card);
  }
}
