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

    // The notice is a small dialog panel (styles/faust-components.css, section 9). Around the
    // whole app nothing is left to dim, so the scrim is transparent on the page surface.
    const card = e('div', {
      role: 'alert',
      className: 'faust-dialog faust-dialog--sm faust-dialog--plain',
      style: { '--dialog-w': '460px' }
    },
      e('div', { className: 'faust-dialog__title' },
        root ? 'FAUSTissa tapahtui virhe' : `Näkymä ”${label}” ei auennut`),
      e('div', { className: 'faust-serif' }, root
        ? 'Ikkunan sisältöä ei voitu näyttää. Lataa sovellus uudelleen: tallentamaton työ tarjotaan palautettavaksi käynnistyksessä.'
        : 'Näkymässä tapahtui virhe. Käsikirjoituksesi on tallessa ja muu sovellus toimii.'),
      e('div', {
        className: 'faust-meta',
        style: { marginTop: 'var(--sp-3)', overflowWrap: 'anywhere' }
      }, String((error && error.message) || error)),
      e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' } },
        e('button', {
          type: 'button',
          className: 'faust-btn faust-btn--lg faust-btn--primary',
          onClick: root ? () => window.location.reload() : dismiss
        }, root ? 'Lataa uudelleen' : 'Sulje näkymä')
      )
    );

    return e('div', {
      className: root ? 'faust-scrim is-stacked' : 'faust-scrim',
      style: { zIndex: 'var(--z-fatal)' }
    }, card);
  }
}
