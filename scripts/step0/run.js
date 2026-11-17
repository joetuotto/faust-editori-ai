// Askeleen 0 mallikoe 16.11.2026. Uusinta: python3 <withkey.py> CHERRY_API_KEY node scripts/step0/run.js --tag <nimi>; sitten node scripts/step0/score.js --tag <nimi>.
//
// Askeleen 0 mallikoe: lähettää aineiston rivit seitsemän rivin erissä jokaiselle mallille
// yhdyskäytävän Anthropic-yhteensopivan /v1/messages-päätteen kautta ja tallentaa raakavastaukset.
//
// Käyttö:
//   python3 <withkey.py> CHERRY_API_KEY node scripts/step0/run.js --prompt prompt.txt --tag v1 [--models a,b] [--batches 1,2] [--batch-size 28] [--max-tokens 12000]
//       [--data <kansio>] [--out <kansio>] [--base <yhdyskäytävän osoite>]
//   --data  kansio, jossa ovat dataset.json ja kehote (oletus test/fixtures/step0-gateway)
//   --out   kansio, johon raw/<tunniste>/<malli>.json kirjoitetaan (oletus: uusi kansio käyttöjärjestelmän
//           väliaikaiskansiossa; kansioon test/fixtures ei kirjoiteta, ellei --out osoita sinne)
//   --base  yhdyskäytävän osoite (oletus http://127.0.0.1:23333)
//
// Avain luetaan ympäristömuuttujasta CHERRY_API_KEY. Sitä ei tulosteta eikä tallenneta.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const mod = require('@anthropic-ai/sdk');
const Anthropic = mod.Anthropic || mod.default || mod;

const KEY = process.env.CHERRY_API_KEY || '';
if (!KEY) { console.error('CHERRY_API_KEY puuttuu'); process.exit(2); }
const redact = (s) => String(s).split(KEY).join('[AVAIN]');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const TAG = args.tag || 'v1';
const BASE = String(args.base || 'http://127.0.0.1:23333').replace(/\/+$/, '');
const DATA_DIR = path.resolve(args.data || path.join(ROOT, 'test', 'fixtures', 'step0-gateway'));
const PROMPT_FILE = path.resolve(DATA_DIR, args.prompt || 'prompt.txt');
const MAX_TOKENS = parseInt(args['max-tokens'] || '12000', 10);
const OUT_ROOT = args.out ? path.resolve(args.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'faust-step0-'));
const OUT_DIR = path.join(OUT_ROOT, 'raw', TAG);
fs.mkdirSync(OUT_DIR, { recursive: true });

function readPrompt(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/=== SYSTEM ===\n([\s\S]*?)\n=== USER ===\n([\s\S]*)$/);
  if (!m) throw new Error('prompt-tiedoston muoto on väärä');
  return { system: m[1].trim(), user: m[2].trim() };
}

async function listModels() {
  const r = await fetch(BASE + '/v1/models', { headers: { 'x-api-key': KEY, Authorization: 'Bearer ' + KEY } });
  const j = await r.json();
  return (j.data || []).map((m) => m.id);
}

const shortName = (id) => id.replace(/^[^:]*:/, '');

async function runBatch(client, model, prompt, batchNo, items) {
  const lines = items.map((it, i) => `[${i + 1}] ${it.text}`).join('\n');
  const user = prompt.user.replace(/\{N\}/g, String(items.length)).replace('{RIVIT}', lines);
  const rec = {
    model, batch: batchNo, ids: items.map((it) => it.id), maxTokens: MAX_TOKENS,
    startedAt: new Date().toISOString(), seconds: null, firstTextSeconds: null,
    stopReason: null, servedModel: null, usage: null, blockTypes: [], thinkingChars: 0, text: '', error: null
  };
  const t0 = Date.now();
  try {
    const stream = client.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: prompt.system,
      messages: [{ role: 'user', content: user }]
    });
    stream.on('text', () => { if (rec.firstTextSeconds === null) rec.firstTextSeconds = (Date.now() - t0) / 1000; });
    const msg = await stream.finalMessage();
    rec.seconds = (Date.now() - t0) / 1000;
    rec.stopReason = msg.stop_reason;
    rec.servedModel = msg.model || null;
    rec.usage = msg.usage ? { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens } : null;
    rec.blockTypes = msg.content.map((b) => b.type);
    rec.thinkingChars = msg.content.filter((b) => b.type === 'thinking').reduce((n, b) => n + (b.thinking || '').length, 0);
    rec.text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  } catch (e) {
    rec.seconds = (Date.now() - t0) / 1000;
    // Redact before cutting: a key cut in half no longer matches and would be printed
    rec.error = redact(`${e.status || ''} ${e.name || ''}: ${String(e.message || e)}`).slice(0, 420);
  }
  return rec;
}

(async () => {
  const prompt = readPrompt(PROMPT_FILE);
  const dataset = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dataset.json'), 'utf8'));
  const all = await listModels();
  let models = all.filter((id) => !/-free$/.test(id));
  if (args.models) {
    const want = args.models.split(',');
    models = models.filter((id) => want.includes(shortName(id)));
  }
  // --batch-size N jakaa rivit aineiston järjestyksessä N rivin eriin (oletus: aineiston omat seitsemän rivin erät)
  if (args['batch-size']) {
    const size = parseInt(args['batch-size'], 10);
    dataset.items.forEach((it, i) => { it.batch = Math.floor(i / size) + 1; });
  }
  const batchNos = [...new Set(dataset.items.map((it) => it.batch))].sort((a, b) => a - b)
    .filter((b) => !args.batches || args.batches.split(',').map(Number).includes(b));
  console.log(`kehote ${path.basename(PROMPT_FILE)}, tunniste ${TAG}, mallit: ${models.map(shortName).join(', ')}, erät: ${batchNos.join(',')}, max_tokens ${MAX_TOKENS}`);

  const client = new Anthropic({ apiKey: KEY, baseURL: BASE, maxRetries: 0, timeout: 15 * 60 * 1000 });
  let requests = 0;

  // Mallit rinnakkain, yhden mallin erät peräkkäin (kuten sovelluksessa)
  await Promise.all(models.map(async (model) => {
    const file = path.join(OUT_DIR, shortName(model) + '.json');
    let saved = { model, tag: TAG, promptFile: path.basename(PROMPT_FILE), system: prompt.system, userTemplate: prompt.user, batches: [] };
    if (fs.existsSync(file)) {
      try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* rikkinäinen tiedosto: aloitetaan alusta */ }
    }
    for (const b of batchNos) {
      const items = dataset.items.filter((it) => it.batch === b);
      requests += 1;
      const rec = await runBatch(client, model, prompt, b, items);
      saved.batches = saved.batches.filter((x) => x.batch !== b).concat([rec]).sort((x, y) => x.batch - y.batch);
      fs.writeFileSync(file, JSON.stringify(saved, null, 2) + '\n');
      console.log(`${shortName(model)} erä ${b}: ${rec.error ? 'VIRHE ' + rec.error : 'ok'} ${rec.seconds.toFixed(1)} s, vastasi=${rec.servedModel ? shortName(rec.servedModel) : '?'}, stop=${rec.stopReason}, lohkot=[${rec.blockTypes.join(',')}], päättelyä ${rec.thinkingChars} merkkiä, tekstiä ${rec.text.length} merkkiä, usage=${JSON.stringify(rec.usage)}`);
    }
  }));

  fs.appendFileSync(path.join(OUT_ROOT, 'raw', 'request_log.txt'), `${new Date().toISOString()} ${TAG} ${requests} pyyntöä (${models.map(shortName).join(', ')}; erät ${batchNos.join(',')})\n`);
  console.log(`pyyntöjä yhteensä ${requests}`);
  console.log(`Raakavastaukset: ${OUT_DIR}`);
  console.log(`Pisteytys: node scripts/step0/score.js --tag ${TAG} --out "${OUT_ROOT}"`);
})().catch((e) => { console.error('VIRHE', redact(String(e && e.message || e)).slice(0, 400)); process.exit(1); });
