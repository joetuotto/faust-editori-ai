/**
 * VoiceInput - Web Speech API wrapper for voice recognition
 *
 * Supports:
 * - Finnish (fi-FI)
 * - English (en-US)
 * - Swedish (sv-SE)
 *
 * Browser support:
 * - Chrome/Edge: Excellent
 * - Safari: Good
 * - Firefox: Limited (not recommended)
 */

class VoiceInput {
  constructor(language = 'fi-FI') {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('Web Speech API not supported in this browser');
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = language;
    this.recognition.continuous = false; // Stop after user stops talking
    this.recognition.interimResults = false; // Only final results
    this.recognition.maxAlternatives = 1;

    this.isListening = false;
    this.onStateChange = null; // Callback for state changes
  }

  /**
   * Start listening for voice input
   * @returns {Promise<{transcript: string, confidence: number}>}
   */
  async listen() {
    if (this.isListening) {
      console.warn('[VoiceInput] Already listening');
      return null;
    }

    return new Promise((resolve, reject) => {
      this.recognition.onstart = () => {
        this.isListening = true;
        if (this.onStateChange) this.onStateChange('listening');
        console.log('[VoiceInput] Listening started');
      };

      this.recognition.onresult = (event) => {
        const result = event.results[0][0];
        const transcript = result.transcript;
        const confidence = result.confidence;

        console.log('[VoiceInput] Transcript:', transcript);
        console.log('[VoiceInput] Confidence:', confidence);

        this.isListening = false;
        if (this.onStateChange) this.onStateChange('processing');

        resolve({ transcript, confidence });
      };

      this.recognition.onerror = (event) => {
        console.error('[VoiceInput] Error:', event.error);
        this.isListening = false;
        if (this.onStateChange) this.onStateChange('error');

        let errorMessage = 'Tuntematon äänivirhe';

        switch (event.error) {
          case 'no-speech':
            errorMessage = 'Ei havaittu puhetta. Yritä uudelleen.';
            break;
          case 'audio-capture':
            errorMessage = 'Mikrofonia ei löytynyt.';
            break;
          case 'not-allowed':
            errorMessage = 'Mikrofonin käyttö estetty. Tarkista selainasetukset.';
            break;
          case 'network':
            errorMessage = 'Verkkovirhe. Tarkista internet-yhteys.';
            break;
          case 'aborted':
            errorMessage = 'Äänitunnistus keskeytetty.';
            break;
        }

        reject(new Error(errorMessage));
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.onStateChange) this.onStateChange('idle');
        console.log('[VoiceInput] Listening ended');
      };

      try {
        this.recognition.start();
      } catch (error) {
        console.error('[VoiceInput] Failed to start:', error);
        this.isListening = false;
        reject(error);
      }
    });
  }

  /**
   * Stop listening
   */
  stop() {
    if (this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      if (this.onStateChange) this.onStateChange('idle');
      console.log('[VoiceInput] Stopped manually');
    }
  }

  /**
   * Change recognition language
   * @param {string} language - Language code (fi-FI, en-US, sv-SE)
   */
  setLanguage(language) {
    this.recognition.lang = language;
    console.log('[VoiceInput] Language changed to:', language);
  }

  /**
   * Check if browser supports Web Speech API
   * @returns {boolean}
   */
  static isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Get recommended browsers message
   * @returns {string}
   */
  static getBrowserRecommendation() {
    const isChrome = /Chrome/.test(navigator.userAgent);
    const isEdge = /Edg/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !isChrome;

    if (isChrome || isEdge) {
      return null; // Perfect browser
    } else if (isSafari) {
      return 'Safari-tuki on hyvä, mutta Chrome tai Edge suositellaan parempaa tarkkuutta varten.';
    } else {
      return 'Äänitunnistus ei ehkä toimi tässä selaimessa. Suosittelemme Chrome, Edge tai Safari.';
    }
  }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VoiceInput;
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.VoiceInput = VoiceInput;
}
