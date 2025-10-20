# 🔑 API-avainten konfigurointi

## Tarvittavat API-avaimet

Jotta AI-avustajat toimivat, tarvitset API-avaimia seuraavista palveluista:

### 1. **OpenAI (GPT-4, GPT-3.5)**
- **Rekisteröidy**: https://platform.openai.com/signup
- **Hae API-avain**: https://platform.openai.com/api-keys
- **Hinta**: ~$0.01-0.03 / 1K tokenia (GPT-4)
- **Kopioi avain**: Alkaa `sk-...`

### 2. **Anthropic (Claude 3.5 Sonnet)**
- **Rekisteröidy**: https://console.anthropic.com/
- **Hae API-avain**: Account Settings → API Keys
- **Hinta**: ~$0.003 / 1K tokenia
- **Kopioi avain**: Alkaa `sk-ant-...`

### 3. **Google Gemini (Gemini Pro)**
- **Rekisteröidy**: https://ai.google.dev/
- **Hae API-avain**: Get API Key
- **Hinta**: Ilmainen (60 requests/min)
- **Kopioi avain**: Random string

---

## Konfigurointi

### **Vaihtoehto 1: Ympäristömuuttujat (suositeltu)**

Luo tiedosto `.env` projektin juureen:

```bash
# .env
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
GOOGLE_API_KEY=your-google-key-here
```

### **Vaihtoehto 2: electron.js -tiedostoon**

Jos et halua käyttää `.env`-tiedostoa, voit kovakoodata avaimet suoraan:

```javascript
// electron.js (HUOM: Ei suositella production-käytössä!)
const API_KEYS = {
  openai: 'sk-your-openai-key',
  anthropic: 'sk-ant-your-anthropic-key',
  google: 'your-google-key'
};
```

---

## Testaus

Kun olet lisännyt API-avaimet:

1. **Käynnistä sovellus**: `npm start`
2. **Avaa AI-paneeli**: `Cmd+Alt+A`
3. **Valitse malli**: Esim. "GPT-4"
4. **Lähetä viesti**: "Kirjoita tarina kissasta"
5. **Odota vastausta**: ~2-5 sekuntia

Jos saat virheen:
- **"401 Unauthorized"** → API-avain on väärä
- **"429 Rate Limit"** → Liian monta pyyntöä
- **"Network error"** → Tarkista internet-yhteys

---

## Turvallisuus

⚠️ **ÄLÄ KOSKAAN**:
- Jaa API-avaimia julkisesti
- Commitoi `.env` -tiedostoa Gitiin
- Kovakoodaa avaimia production-koodiin

✅ **SUOSITELLAAN**:
- Käytä `.env` -tiedostoa
- Lisää `.env` → `.gitignore`
- Kierrätä avaimia säännöllisesti

---

## Hinnoittelu (arvio)

**Kirjoitusstudio keskimääräinen käyttö** (100 AI-kyselyä/kk):

| Malli | Hinta/kk | Nopeus | Laatu |
|-------|----------|--------|-------|
| GPT-4 | ~$5-10 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Claude 3.5 | ~$2-5 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Gemini Pro | Ilmainen | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

**Suositus**: Aloita Gemini Prolla (ilmainen), sitten Claude 3.5 (halpa + hyvä).

---

## Ongelmatilanteet

### **"Module not found: dotenv"**
```bash
npm install dotenv
```

### **"API key not found"**
Tarkista että `.env` on projektin juuressa ja sisältää:
```
OPENAI_API_KEY=sk-...
```

### **"Invalid API key format"**
- OpenAI: Alkaa `sk-...`
- Anthropic: Alkaa `sk-ant-...`
- Google: Random string (ei tiettyä muotoa)

---

**Lisätietoja:**
- OpenAI Docs: https://platform.openai.com/docs
- Anthropic Docs: https://docs.anthropic.com
- Gemini Docs: https://ai.google.dev/docs


