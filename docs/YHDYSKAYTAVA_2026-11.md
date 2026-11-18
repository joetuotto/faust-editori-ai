# Gateway facts: Cherry Studio API gateway as FAUST will call it

*Copied into the repo on 18 Nov 2026 (stage I-02) from the working notes of the session that ran the check; the scripts and raw captures it names stayed in the session's temporary folder and are not kept. The answers are summarised in Finnish in `docs/TEKOALYTUTKIMUS_2026-11.md`, section 8, and each is a constant of `utils/aiRequest.js` (`AI_CONSTANTS`) or `src/services/ai/aiClient.js`. One question is still open: the real context window of each model (scenario A-L26 of stage I-02, section 5 below).*

Measured on 16 Nov 2026, 22:00–22:22 local time, against `http://127.0.0.1:23333` (Cherry Studio 2.1.10, "Cherry Studio API" 1.0.0) with the Anthropic SDK that FAUST ships (`@anthropic-ai/sdk` 0.67.1, same `baseURL` construction as `electron.js:125–126`) and with raw `fetch` for the wire format.

- 62 requests to `/v1/messages` in total; 7 of them were rejected before any generation (wrong model, bad key, bad temperature), so 55 generated text. Plus 14 calls to `/v1/messages/count_tokens` and one to `/v1/models`, which generate nothing.
- Models: the four non-free Refuseless ids. Short names used below:

| Short | Model id (provider prefix `c91fb219-b725-43d2-925d-3c6e66bef527:`) | `owned_by` |
|---|---|---|
| glm | `glm-5.3-abliterated` | zhipu |
| glmFlash | `glm-5.3-flash-abliterated` | zhipu |
| ds | `deepseek-v4.1-flash-abliterated` | deepseek |
| dsFast | `deepseek-v4.1-flash-abliterated-fast` | deepseek |

- Scripts and raw captures: istunnon väliaikaiskansio (ei tallessa) (scripts `01`–`12`, captures in `out/`). The key was never printed or stored; a scan of every file there and of this file finds no occurrence.
- Limits of this check. Most cells are one to four samples per model. Sibling probes were using the gateway at the same time (about 360 requests to `/v1/messages` in the gateway log for the day, 62 of them mine; at 22:02–22:03 several other calls were in flight and took 26–71 s each), so latencies are "as seen under parallel load", not best case. The repo was not modified.
- The gateway writes a sanitised log (`~/Library/Logs/CherryStudio/app.2026-11-16.log`: strings replaced by `<string:N>`, no prompt text, no keys). It was used for two things only: what the gateway does on client abort, and what the upstream request looks like.

---

## 1. Findings that change the design

1. **Stop sequences must not be used.** `stop_sequences: ["</teksti>"]` is honoured upstream (the text ends just before the tag) but the gateway reports `stop_reason: "end_turn"` and `stop_sequence: null`, in 5 of 5 runs. A stop-sequence hit is therefore indistinguishable from a natural end, and it removes the closing tag that the acceptance rule in report 5.3 needs. Worse, the stop sequence also fires **inside the reasoning**: dsFast drafted `<teksti>…` in its thinking, generation stopped there, and the response was a thinking block with no text at all and `stop_reason: "end_turn"` (section 3.5).
2. **`thinking: {type: "disabled"}` works for the two DeepSeek models and FAUST currently deletes it** (`electron.js:132`). With the flag, ds and dsFast produced no thinking block in 13 of 13 requests, time to first text fell from 12.7 s to 2.8 s (dsFast, 150 words) and output tokens from 1,757 to 391. glm and glmFlash ignore the flag. `budget_tokens` and `output_config.effort` do not bound glm's reasoning either.
3. **Reasoning eats `max_tokens` on all four models, and the amount is erratic.** Same prompt, same model, default request: ds used about 200 thinking tokens once and more than 1,200 another time. With `max_tokens: 1200` both DeepSeek models returned no text at all for a 150-word request; glm did the same with `max_tokens: 300` on a 270-character proofreading task. The response then has `stop_reason: "max_tokens"` and only a thinking block.
4. **`usage` arrives only at the end of a stream.** `message_start.usage` is all zeros; the real `input_tokens` and `output_tokens` are both in `message_delta.usage`. An aborted or failed stream has no usage.
5. **`input_tokens` excludes cached prompt tokens.** dsFast with a 100,298-character prompt reported `input_tokens: 29371, cache_read_input_tokens: 7424`. The prompt size is the sum (36,795). A truncation check that looks at `input_tokens` alone would raise a false "model did not see the whole prompt" on every cache hit.
6. **Finnish costs about 2.7 characters per token on all four models**, input and output. The report's starting value of 3 underestimates tokens by about 10 %, and the gateway's own `count_tokens` route (a model-independent estimate, about 3.25 characters per token) underestimates by 14–17 %.
7. **Streams can die mid-sentence with an SSE `error` event** (`api_error: "Failed to process successful response"`), seen once in my runs (glm, after 818 characters of text) and four more times in the gateway log for other callers that day (two as HTTP 502 on non-streaming calls), roughly 1.4 % of requests. The SDK turns the event into an `APIError` with `status: undefined`; the text received so far stays available.
8. **Nothing at all arrives before the model's first token, not even the HTTP status.** The gateway returns the response headers together with the first upstream token (measured directly: headers at 11,968 ms, first body bytes at 11,969 ms; and the gateway's own log gives 58,884 ms for the stream whose first event I saw at 58,909 ms). There are no `ping` events. So the SDK's request `timeout`, which bounds the wait for headers, is in practice the first-token timeout, and it has to be long: glm took 43 s and 59 s to its first token in two of three 150-word runs, and its first visible text came after 44–60 s in all three (in the third because 1,358 tokens of reasoning came first). Today only the connection test has a timer (90 s, `electron.js:955–962`).
9. **Abort is clean on both sides.** The SDK rejects within 2–8 ms with `APIUserAbortError`; the gateway logs `Aborting stream … gateway client disconnected` in the same second, 4 of 4. Up to five already-buffered events were still delivered to listeners after `abort()`, so chunks after cancel must be ignored by request id.

---

## 2. Answers

| # | Question | Answer | Differs per model? | Evidence |
|---|---|---|---|---|
| 1 | Does `/v1/messages` exist; is `max_tokens` required? | Exists, streaming and non-streaming. `max_tokens` is **not** required: a request without it returned 200. The gateway's own description requires only `model` and `messages` (a body without `messages` gives 400). Model ids must be `providerId:apiModelId`. | No (gateway level) | 3.1 |
| 2 | `system` as a string and as an array of blocks; obeyed? | Both accepted. Obeyed by all four: string form ("start every answer with KURKI") 10 of 10 answers that produced text; block form with two blocks ("one word" + "capitals") gave `HELSINKI` 4 of 4. Upstream it becomes a `role: "system"` message. | No | 3.2 |
| 3 | Token counting route? | `POST /v1/messages/count_tokens` exists and the SDK's `messages.countTokens` works against it. It is a local estimate, not the model's tokenizer: same number for all four models, an answer even for a model id that does not exist, 14–17 % below the real `input_tokens`. `model` is required (400 without). | No | 3.3 |
| 4 | Streaming event sequence and field names | Standard Anthropic names: `message_start` → `content_block_start` (`thinking`, then `text`) → `content_block_delta` (`thinking_delta` / `text_delta`) → `content_block_stop` → `message_delta` (`delta.stop_reason`, `delta.stop_sequence`, `usage`) → `message_stop`. No `ping`, no `signature_delta`, `signature` is always `""`. Reasoning never appeared as `<think>` text inside a text block. A failed stream ends with `event: error` and no `message_delta`. | Block order is the same; whether a thinking block appears differs | 3.4 |
| 5 | `stop_reason` values | Natural end: `end_turn`. Cut by limit: `max_tokens` (faithful, 8 of 8 cuts). Stop sequence: honoured but reported as `end_turn` with `stop_sequence: null`. `stop_sequence` and `refusal` were never emitted. | No | 3.5 |
| 6 | `usage` | Present in non-streaming responses and in `message_delta` of streams (both `input_tokens` and `output_tokens`); zeros in `message_start`. Plausible: 2.6–2.9 characters per token for Finnish. `output_tokens` includes reasoning. A 20,237-character prompt gave 7,277–7,492 input tokens on all four and both ends of the prompt were seen; a 100,298-character prompt gave 35,881 (glmFlash) and 36,795 (dsFast, of which 7,424 reported as cache read). No cap, no silent truncation up to there. | Small tokenizer differences | 3.6 |
| 7 | Abort | SDK: `finalMessage()` rejects in 2–8 ms with `APIUserAbortError` "Request was aborted.", events `abort` then `end`, no `error` event. Works with `stream.abort()` and with an `AbortController` passed as request option. Gateway: logs the abort of its own stream within the same second. Whether the upstream provider stops generating or billing **cannot be observed** from here. | No | 3.7 |
| 8 | Temperature | Accepted (0.3 used on all four). Valid range is [0, 2]; 5 gives HTTP 400 with the upstream message. Omitted: works; the gateway sends `temperature: null` upstream, so the provider default applies. | No | 3.8 |
| 9 | Reasoning | All four emit `thinking` blocks by default (glmFlash only sometimes). Reasoning counts against `max_tokens`; a small limit yields a thinking block and no text. Only ds and dsFast honour `thinking: {type: "disabled"}`. | Yes | 3.9 |
| 10 | Two concurrent streams | Chunks stay separate: same model twice (glmFlash, dsFast) and two models at once (glm + ds), 0 foreign words in any stream, different message ids, 14–26 interleavings in arrival order. | No | 3.10 |
| 11 | Error shapes | Wrong model: 400 Anthropic envelope, also for `stream: true` (plain JSON, not SSE). Invalid key: **403** with body `{"error":"Forbidden"}` (not the Anthropic envelope). Bad parameter: 400 with the upstream text. Gateway down: `APIConnectionError`, cause `ECONNREFUSED`. Upstream failure: SSE `error` event mid-stream, or HTTP 502. | No | 3.11 |
| 12 | Speed for a 150-word Finnish answer | ds and dsFast: first event usually after 0.7–3.2 s (once 12 s), 90–118 output tokens/s, but first *text* after 2–13 s depending on reasoning. glmFlash: first text 1.1–1.7 s, 10–27 tokens/s, 15–33 s in total. glm: first text after 44–60 s, 7–30 tokens/s, 52–100 s in total. | Yes | 3.12 |

---

## 3. Evidence

### 3.1 Route and required fields

`GET /` lists the routes (`POST /v1/messages`, `POST /v1/chat/completions`, `GET /openapi/json`, …). `GET /v1/models` returns `{object, data: [{id, object, created, owned_by}]}`, five entries, no context-window field.

Request without `max_tokens` (dsFast, non-streaming), HTTP 200:

```json
{"id":"msg_1794859295121_0ygrzuwcf","type":"message","role":"assistant",
 "content":[{"type":"thinking","thinking":"We need answer one word Finnish: Helsinki. Must only one word.","signature":""},
            {"type":"text","text":"Helsinki","citations":null}],
 "container":null,"model":"c91fb219-…:deepseek-v4.1-flash-abliterated-fast","stop_details":null,
 "stop_reason":"end_turn","stop_sequence":null,
 "usage":{"input_tokens":72,"output_tokens":19,"cache_creation":null,"cache_creation_input_tokens":0,
          "cache_read_input_tokens":0,"inference_geo":null,"server_tool_use":null,"service_tier":null}}
```

Response headers include `x-request-id` (the SDK looks for `request-id`, so its request id is null). `max_tokens: 200000` was accepted without complaint by dsFast and glmFlash; the gateway does not validate an upper bound.

The gateway translates to an OpenAI-style chat request upstream. The sanitised log shows the upstream shape for one of my requests: `{"max_tokens":1200,"messages":[{"content":"<string:84>","role":"system"},{"content":"<string:59>","role":"user"}],"model":"glm-5.3-abliterated","stream":true,"temperature":null,"top_p":null,"seed":null,"tools":null, …}`.

### 3.2 System field

- String: `system: "Olet kirjoitusavustaja. Vastaa aina suomeksi. Aloita jokainen vastaus sanalla KURKI."` Every answer that produced text began with `KURKI` (glm 3, glmFlash 2, ds 2, dsFast 3 — one of the dsFast answers with `budget_tokens`).
- Array of two blocks `[{type:"text",text:"Vastaa aina täsmälleen yhdellä sanalla."},{type:"text",text:"Kirjoita vastaus ISOIN KIRJAIMIN."}]`, question "Mikä on Suomen pääkaupunki?": `HELSINKI` from all four, so both blocks reached the model.
- No model rejected the system field, so "Lähetä ohjeet käyttäjäviestinä" is not needed for these four.

### 3.3 count_tokens

| Body | Result |
|---|---|
| 1,003 characters of Finnish, each of the four models | `{"input_tokens":298}` for every model, 2–46 ms |
| same, model id that does not exist | 200, `{"input_tokens":254}` (log: `GatewayTokenEstimate … model resolve failed, using anthropic/all-media fallback`) |
| same, no `model` | 400 `{"type":"error","error":{"type":"invalid_request_error","message":"model parameter is required"}}` |
| with `system` as string or as blocks | 310 in both forms |
| 20,237-character prompt | estimate 6,218; real `input_tokens` 7,492 / 7,277 / 7,469 / 7,469 (estimate ÷ real = 0.83–0.85) |
| 100,298-character prompt | estimate 30,689; real 35,881 (glmFlash), 36,795 (dsFast incl. cache read) |

It costs nothing and answers in milliseconds, but it is the same kind of guess as characters ÷ 3.25. It cannot seed a per-model calibration.

### 3.4 Streaming events (raw, one sample per kind)

One event of each kind, copied from the raw captures (`message_start` and the thinking events from ds, the text events from glm, `message_delta` from glmFlash; the shapes are identical across the four models):

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_1794859460964_bmix9twwz","type":"message","role":"assistant","content":[],"container":null,"model":"c91fb219-…:deepseek-v4.1-flash-abliterated","stop_details":null,"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0,"cache_creation":null,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":null,"server_tool_use":null,"service_tier":null}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"We"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":"","citations":null}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"KURKI kila"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"container":null,"stop_details":null,"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":331,"input_tokens":87,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":null}}

event: message_stop
data: {"type":"message_stop"}
```

Observed sequences:

| Case | Sequence |
|---|---|
| Thinking, then text | `message_start → content_block_start(0:thinking) → content_block_delta(0:thinking_delta)×N → content_block_stop(0) → content_block_start(1:text) → content_block_delta(1:text_delta)×N → content_block_stop(1) → message_delta → message_stop` |
| No thinking (glmFlash at times; ds/dsFast with thinking disabled) | `message_start → content_block_start(0:text) → …text_delta×N → content_block_stop(0) → message_delta → message_stop` |
| Reasoning used the whole limit | `message_start → content_block_start(0:thinking) → thinking_delta×N → content_block_stop(0) → message_delta(stop_reason max_tokens) → message_stop` — no text block at all |
| Upstream failure (glm, 99.7 s into the request) | `… → content_block_delta(1:text_delta)×168 → error` — no `content_block_stop`, no `message_delta`, no `message_stop` |

The failing stream's last bytes:

```
event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"aata"}}

event: error
data: {"type":"error","error":{"type":"api_error","message":"Failed to process successful response"}}
```

Notes for the parser:
- The thinking block is always index 0 and the text block follows; in the non-streaming response `content` is `[thinking, text]` in that order (so `content[0].text` is undefined, as `electron.js:115–120` already assumes).
- The HTTP response headers, `message_start`, the first `content_block_start` and the first delta all arrive in the same instant, when the upstream model produces its first token. Before that the client has nothing, not even the status line. Measured with `12_headers.js` (dsFast): headers at 11,968 ms, first body bytes at 11,969 ms. Cross-check from the gateway log, whose `API request completed … durationMs` for a streaming call is the moment the response is handed back: 58,884 ms and 42,738 ms for the two glm streams whose first event I recorded at 58,909 ms and 42,768 ms.
- There are no `ping` events: 0 in four full raw captures, including the one that waited 59 s.
- Between events inside a running stream the longest gap in the four raw captures was 1.1 s (glm, glmFlash), 0.45 s (ds), 0.28 s (dsFast).
- Text deltas are small: 150 words arrived as 154–285 deltas.

### 3.5 Stop reasons and stop sequences

Proofreading task, 272-character user message `<teksti>…</teksti>`, system text asking for the corrected text between the same tags.

| Request | glm | glmFlash | ds | dsFast |
|---|---|---|---|---|
| `stop_sequences:["</teksti>"]`, `max_tokens` 1500, default thinking | text ends at `…sammal.` without the tag; `end_turn`, `stop_sequence: null` | same | same | **no text block**; thinking ends at `…Corrected:\n<teksti>Marketta seisoi … sitkeä sammal.`; `end_turn`, `null`; 439 output tokens |
| same with `thinking` disabled, `max_tokens` 300 | — | — | — | text without the tag; `end_turn`, `null` |
| no stop sequence, `max_tokens` 1500, default thinking | `<teksti>…</teksti>`, `end_turn` | same | same | same |
| no stop sequence, `thinking` disabled, `max_tokens` 300 | thinking only, no text, `max_tokens` (300 tokens of reasoning) | `<teksti>…</teksti>`, `end_turn` (after 134 thinking tokens) | `<teksti>…</teksti>`, `end_turn`, 98 output tokens | same, 98 output tokens |
| `max_tokens` 40 | thinking only, `max_tokens` | thinking only, `max_tokens` | thinking only, `max_tokens` | (thinking disabled) text cut mid-word `<teksti>Marketa … köytensä var`, `max_tokens` |

The `message_delta` of the dsFast run where the stop sequence fired inside the reasoning:

```json
{"type":"message_delta","delta":{"container":null,"stop_details":null,"stop_reason":"end_turn","stop_sequence":null},
 "usage":{"output_tokens":439,"input_tokens":219,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":null}}
```

Through the SDK this resolves normally: `finalMessage()` returns `content: [thinking]`, `stop_reason: "end_turn"`; `finalText()` throws `AnthropicError: stream ended without producing a content block with type=text` (verified by replaying the captured events through the SDK from a local fake server, script `10_sdk_local.js`, no gateway traffic).

Conclusions:
- `end_turn` covers both a natural end and a stop-sequence hit. `max_tokens` is reported faithfully. `stop_reason` was present in every stream that completed; it is absent only when the stream ends with `error` or is aborted.
- Without stop sequences, `end_turn` together with the closing `</teksti>` tag was a reliable completeness signal: 9 of 9 proofreading runs that ran to their natural end contained the closing tag, and none of the 10 cut or stop-sequence runs did.
- `end_turn` with empty text is possible, so "stop reason is fine" must never be the only test.
- `refusal` was not observed and was not provoked (these are abliterated models).

### 3.6 Usage and characters per token

Non-streaming and streaming usage carry the same numbers; streaming has them only in `message_delta`.

Input side. Marginal characters per token between a 143-character and a 20,237-character Finnish prompt, and the fixed overhead that the fit leaves over (chat template, system wrapper):

| Model | Tokens for 143 chars | Tokens for 20,237 chars | Marginal chars/token | Fixed overhead | Check at 100,298 chars |
|---|---|---|---|---|---|
| glm | 108 | 7,492 | 2.72 | about 55 | not run |
| glmFlash | 87 | 7,277 | 2.79 | about 36 | 35,881 → 2.80 |
| ds | 110 default / 85 thinking disabled | 7,469 (thinking disabled) | 2.72 | about 32 (57 with thinking on) | not run |
| dsFast | 110 default / 85 thinking disabled | 7,469 (thinking disabled) | 2.72 | about 32 (57 with thinking on) | 29,371 + 7,424 cache read = 36,795 → 2.73 |

Turning thinking off removes exactly 25 input tokens on ds and dsFast (110→85, 219→194, 72→47), which is how one can tell from `usage` alone that the flag was applied.

Output side, Finnish prose only (responses without a thinking block, or with a negligible one):

| Model | Samples (characters ÷ output tokens) | Use |
|---|---|---|
| glm | 2.61 (924 chars + 46 thinking chars, 371 tokens) | 2.6 |
| glmFlash | 2.69 (892/331), 2.73 (941/345) | 2.7 |
| ds | 2.62 (861/329), 2.91 (285/98, text with tags) | 2.7 |
| dsFast | 2.64 (1,033/391), 2.90 (284/98), 2.85 (276/97), 2.92 (117/40, cut) | 2.7 |

English reasoning text runs at about 2.8–3.3 characters per token, and `output_tokens` is reasoning plus text with no breakdown. The script estimates thinking tokens as thinking characters ÷ the run's overall characters per token.

Long prompt. A code word at the very start, about 20,000 characters of numbered Finnish paragraphs, a code word at the very end, then the question. All four answered `A=VARPUNEN, B=MAJAKKA`; `input_tokens` grew in proportion (table above). Repeated at 100,298 characters on glmFlash and dsFast with the same result. The second dsFast prompt shared its first 20,000 characters with the earlier one and the usage was:

```json
{"input_tokens":29371,"output_tokens":13,"cache_creation":null,"cache_creation_input_tokens":0,"cache_read_input_tokens":7424, …}
```

So the upstream provider caches prompt prefixes for the DeepSeek models on its own, and the gateway reports the cached part separately, as the Anthropic format does. glmFlash showed `cache_read_input_tokens: 0` for the same pair of prompts.

Not measured: the real context window. Nothing was truncated or rejected up to about 36,800 prompt tokens (glmFlash, dsFast) and 7,500 (glm, ds). The error for an over-long prompt was therefore not seen either.

### 3.7 Abort

150-word request, abort on the fifth delta.

| Model | How | Abort at | `finalMessage()` rejected after | Error | Stream events | Events delivered after `abort()` | Gateway log |
|---|---|---|---|---|---|---|---|
| ds | `stream.abort()` | +0.8 s | 4 ms | `APIUserAbortError` "Request was aborted." | `abort`, `end` | 0 | 22:14:57 `Aborting stream`, reason `gateway client disconnected` |
| dsFast | `AbortController` in request options | +3.3 s | 2 ms | same | same | 1 | 22:15:23 same |
| glmFlash | `stream.abort()` | +1.0 s | 8 ms | same | same | 5 | 22:16:25 same |
| glm | `AbortController` | +3.4 s | 3 ms | same | same | 0 | 22:16:29 same |

- After abort: `stream.aborted === true`, no `error` event is emitted, `e instanceof Anthropic.APIUserAbortError` is true, and `stream.currentMessage` still holds the blocks received so far (`stop_reason: null`), so partial text can be kept.
- For the ds and dsFast aborts the script stayed alive for 22 s afterwards; no "Message completed" record for those streams appeared in the gateway log (a natural run would have completed within 6–17 s and is logged as `Message completed … streaming: true`).
- What this shows: the gateway notices the disconnect and aborts its own upstream call at once. What it does not show: whether the provider behind it stops generating or charges for the unfinished part. That is not observable from the client or from the gateway log.

### 3.8 Temperature

- `temperature: 0.3` accepted by all four (proofreading runs).
- `temperature: 5` (dsFast and glmFlash): HTTP 400, also for `stream: true`, body `{"type":"error","error":{"type":"invalid_request_error","message":"temperature must be in [0, 2], got 5.0. (parameter=temperature, value=5.0)"}}`.
- Omitted in most runs: works; upstream receives `temperature: null`.

### 3.9 Reasoning

Thinking tokens per run (estimate: thinking characters ÷ the run's characters per token; "≥" means the run was cut while still thinking).

| Task, default request | glm | glmFlash | ds | dsFast |
|---|---|---|---|---|
| One-word answer | about 25 | about 10 | about 25 | about 15–20 |
| 150-word description | about 18 (twice, slow runs); 1,358 (fast run, text then cut at 1,500) | 0; 0 | ≥ 1,200 (no text); 203 | ≥ 1,200 (no text); 1,351 |
| Proofread 270 characters | 848; 352; ≥ 300 (no text) | 17; 76; 134 | 368; 457 | ≥ 439; 677 |

Controls tried:

| Parameter | glm | glmFlash | ds | dsFast |
|---|---|---|---|---|
| `thinking: {type:"disabled"}` | ignored: thinking block in 4 of 4, once using all 300 tokens | ignored: thinking block in 6 of 7 | honoured: no thinking block in 4 of 4, input tokens −25 | honoured: no thinking block in 9 of 9, input tokens −25 |
| `thinking: {type:"enabled", budget_tokens:1024}` | no effect seen (503 thinking tokens on the proofreading task) | not run | not run | one run: 87 thinking tokens instead of 1,200+; one sample, not proof |
| `output_config: {effort:"low"}` | no effect seen (408) | not run | not run | not run |

The reasoning is written in English, drafts the answer and often quotes the source text, which is why a stop sequence can match inside it.

An observation about glm that I cannot verify from the client: its responses fall into two groups. Two slow ones (nothing for 43–59 s, then about 7 tokens/s) had a terse one-line reasoning in the style of glmFlash, and the one that reported usage had an input count close to glmFlash's (86 against 87). The fast ones (first event in 1–2 s, about 30 tokens/s) had long reasoning in the DeepSeek models' style and input counts that track ds minus two on every prompt (108/110, 217/219, 91/93, 7,492/7,494). Both slow runs fell in the minutes when sibling probes had several requests in flight, so queueing at the provider explains the delay at least in part; the difference in reasoning style and token count is not explained by load. This is inference from two slow samples, token counts and style, nothing more. The practical consequence is that glm's constants should be calibrated from live `usage` and not assumed stable.

### 3.10 Concurrency

Two streams started together, each told to repeat its own word thirty times (`OMENA`, `KIRVES`), thinking disabled where honoured.

| Pair | Own word | Other stream's word | Delta windows overlap | Switches in arrival order |
|---|---|---|---|---|
| dsFast + dsFast | 30 / 31 | 0 / 0 | no (each finished in under 1.1 s, one after the other) | 1 |
| glmFlash + glmFlash | 30 / 30 | 0 / 0 | 488 ms | 26 |
| glm + ds | 30 / 31 | 0 / 0 | 433 ms | 14 |

Message ids differed in every pair and the text accumulated from deltas equalled the final message text.

### 3.11 Error shapes

| Situation | HTTP | Body | SDK error (class, `status`, `message`) |
|---|---|---|---|
| Model id not on the gateway | 400, `application/json` even with `stream: true` | `{"type":"error","error":{"type":"invalid_request_error","message":"Model \"<id>\" is not available through the API gateway"}}` | `BadRequestError`, 400, `400 {"type":"error","error":{…}}`; parsed body in `e.error` |
| Model id without provider prefix (for example a Claude name) | 400 | `…"message":"Invalid model format: \"claude-sonnet-4-5\". Expected \"providerId:apiModelId\"."` | `BadRequestError`, 400 |
| Invalid key | **403** | `{"error":"Forbidden"}` (no `type`, no nested `error`) | `PermissionDeniedError`, 403, `403 {"error":"Forbidden"}`; `e.error` is `{error:"Forbidden"}` |
| Parameter rejected upstream | 400 | `…"type":"invalid_request_error","message":"temperature must be in [0, 2], got 5.0. (parameter=temperature, value=5.0)"` | `BadRequestError`, 400 |
| Body fails the gateway's own validation (no `messages`) | 400 | `invalid_request_error`, `message` is itself a JSON string: `{"type":"validation","on":"body","property":"messages","message":"Invalid input: expected array, received undefined", …}` | `BadRequestError`, 400 |
| Gateway not running (closed port) | — | — | `APIConnectionError`, no status, message `Connection error.`, `e.cause.cause.code === "ECONNREFUSED"` (cause message `fetch failed`) |
| Upstream failure during a stream | 200, then `event: error` | `{"type":"error","error":{"type":"api_error","message":"Failed to process successful response"}}` | `APIError`, `status: undefined`, message is the JSON text of the body, `e.error.error.message` is the short text. Text received before it is intact (replayed through the SDK locally). |
| Upstream failure on a non-streaming call | 502 (status from the gateway log, two cases from other callers; body not captured by me) | assumed the same envelope | `InternalServerError`, 502. With the SDK default `maxRetries: 2` the SDK silently makes **three** attempts (verified locally). |
| User abort | — | — | `APIUserAbortError`, "Request was aborted." |

The existing `describeAIError` (`electron.js:180–193`) already maps 401/403 and connection failures to Finnish text. The gateway answers 403, never 401, for a bad key. Its test `/connect|ECONNREFUSED|fetch failed|network/i` matches `Connection error.` and does not match `Failed to process successful response`.

Suggested Finnish texts (sentence case; wording to be aligned with the vocabulary work):

| Match | Text |
|---|---|
| `status === 403` or `401` | keep the existing key message |
| no status and connection pattern | keep the existing "ei saada yhteyttä" message |
| 400 and `/is not available through the API gateway/` or `/Invalid model format/` | Mallia ei löydy Cherry Studion yhdyskäytävästä. Valitse malli uudelleen asetuksista. |
| 400 and `/temperature must be in/` | Lämpötilan on oltava välillä 0–2. |
| other 400 | Yhdyskäytävä hylkäsi pyynnön: + the short message |
| `e.error?.error?.type === "api_error"` with no status, or 502 | Mallin vastaus katkesi palvelimen virheeseen. Saapunut teksti on tallessa; yritä uudelleen. |
| `APIUserAbortError` | no error text (cancelled) |

### 3.12 Speed

150-word description, `max_tokens` 1200–4000, streaming. "First event" is the first SSE event (thinking or text), "first text" the first `text_delta`.

| Model | Run | First event | First text | Output tokens/s after first event | Total | Result |
|---|---|---|---|---|---|---|
| glm | default, 22:02 | 58.9 s | 59.9 s | about 20 characters/s (no usage) | 99.7 s | failed with `error` event after 818 characters |
| glm | thinking "disabled" (ignored), 22:07 | 42.8 s | 44.4 s | 6.7 | 98.5 s | 125 words, `end_turn` |
| glm | default, 22:19 | 1.5 s | 48.2 s | 29.7 | 52.0 s | 1,358 thinking tokens, then 52 words, cut at 1,500 |
| glmFlash | default | 1.1 s | 1.1 s | 10.5 | 32.5 s | 117 words |
| glmFlash | default, repeat | 1.7 s | 1.7 s | 26.6 | 14.6 s | 118 words |
| ds | default | 3.2 s | never | 102 | 14.9 s | 1,200 thinking tokens, no text, `max_tokens` |
| ds | default, `max_tokens` 4000 | 1.9 s | 2.4 s | 112 | 6.1 s | 110 words |
| ds | thinking disabled | 2.0 s | 2.0 s | 111 | 4.9 s | 119 words |
| dsFast | default | 1.8 s | never | 114 | 12.3 s | 1,200 thinking tokens, no text, `max_tokens` |
| dsFast | default, `max_tokens` 4000 | 2.5 s | 12.7 s | 118 | 17.3 s | 150 words |
| dsFast | thinking disabled | 2.8 s | 2.8 s | 88 | 7.2 s | 135 words |

Proofreading 270 characters, whole request: dsFast 1.6–2.5 s with thinking disabled and 7.2 s with it on; ds 6.2 s and 11–21 s; glmFlash 3.8–3.9 s and once 41.6 s (13 s to the first event); glm 3.7–5.3 s and once 30.7 s. A one-word answer once took 34 s from glmFlash (non-streaming) and once 12 s to the first token from dsFast. Spikes of 12–60 s to the first token were seen on glm, glmFlash and dsFast; parallel requests from sibling probes were in flight at those times, so the provider may be queueing concurrent calls. That was not tested in isolation.

---

## 4. Constants for the request layer

### 4.1 Reasoning headroom per model

"Headroom" is what must be added to the visible answer budget so that reasoning does not starve the text. The values are the smallest I can defend from 2–8 samples per cell; reasoning length has no hard upper bound, so the `max_tokens`-with-empty-text case must stay handled whatever the number.

| Model | Send `thinking: {type:"disabled"}` | Headroom with the flag | Headroom without the flag | Basis |
|---|---|---|---|---|
| dsFast | yes, honoured 9/9 | 0 for reasoning; keep 100 as slack for tags and tokenizer variance | 2,000 | max observed 1,351, and another run still thinking when cut at 1,200 |
| ds | yes, honoured 4/4 | 0 for reasoning; keep 100 | 2,000 | max observed ≥ 1,200 |
| glm | flag ignored | — | 2,000 | max observed 1,358 on a 150-word request, 848 on a 270-character edit |
| glmFlash | flag ignored | — | 400 | max observed 134 |

The reasoning quotes the source and drafts the answer, so for edit tasks it should be expected to grow with the selection. That was measured only for a 270-character selection (up to 848 thinking tokens for a 98-token answer on glm). For longer selections on models that still reason, start from `answer tokens × 2 + headroom` and let the `max_tokens`-with-empty-text case trigger one retry with a larger limit; the factor 2 is an assumption, not a measurement.

Recommended change for cluster A: for the gateway, add `thinking: {type: "disabled"}` to every request by default (per-model override in settings), and stop deleting `thinking` in `createCherryClient.prepare` (`electron.js:132`) for the new request path. The old callers can keep the present behaviour. The flag was accepted without error by all four models.

### 4.2 Characters per token for Finnish

| Model | Starting value for estimates | Measured range |
|---|---|---|
| glm | 2.7 | input 2.70–2.72, output 2.61 |
| glmFlash | 2.7 | input 2.78–2.80, output 2.69–2.73 |
| ds | 2.7 | input 2.71–2.72, output 2.62–2.91 |
| dsFast | 2.7 | input 2.71–2.73, output 2.64–2.92 |

- Replace the report's starting value 3 with 2.7 for the gateway. For a budget that must not overflow, divide by 2.6.
- Add a fixed prompt overhead of about 60 tokens per request (measured 32–57).
- Live calibration must use `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` as the prompt size.
- Do not calibrate from `/v1/messages/count_tokens` (3.25–3.37 characters per token for every model).

### 4.3 Stop reasons

| Value on the wire | Meaning | Complete? |
|---|---|---|
| `end_turn` | natural end, **or** a stop sequence was hit (in the text or inside the reasoning) | Only together with non-empty text and, for edit tasks, the closing tag |
| `max_tokens` | limit reached; text may be partial or entirely absent | No |
| `stop_sequence` | never emitted by this gateway | — |
| `refusal` | never observed | — |
| (no `message_delta` at all) | stream ended with `event: error`, or was aborted | No |

Acceptance rule for edit tasks, as measured: accept only when `stop_reason === "end_turn"`, the text is non-empty and contains the closing `</teksti>`. In the 14 proofreading runs without a stop sequence this accepted the 9 complete answers and rejected the 5 cut ones.

### 4.4 Stop sequences

Not usable. Honoured upstream, reported as `end_turn` with `stop_sequence: null`, strip the closing tag that proves completeness, and can fire inside the reasoning and produce an empty answer. To stop a model that keeps writing after the closing tag, watch the streamed text for `</teksti>` in the client and abort the request; abort is cheap and clean (3.7).

### 4.5 Timeouts and stream handling

| Fact | Consequence |
|---|---|
| Response headers arrive only with the first token, after up to 59 s (glm); no `ping` events | The SDK `timeout` is the first-token timeout. Anything below about 120 s will cut healthy glm requests; use 180 s. A separate "first event after headers" timer never has anything to wait for. |
| Longest gap between events inside a stream: 1.1 s | An idle timeout of 60 s between events is ample; the proposed 120 s is safe. |
| Reasoning can run 10–47 s before any text | Show a waiting state until the response arrives and a "malli ajattelee" phase from the first `content_block_start` of type `thinking`; time to first *text* is not a health signal. |
| Up to 5 events delivered after `abort()` | Drop chunks for a request id once it is cancelled. |
| `message_start.usage` is zeros | Read usage from `message_delta` (the SDK's `finalMessage().usage` already has the right numbers). |
| `error` event ends a stream without `message_delta` | Treat "stream ended without a stop reason" as failed and keep the partial text; never as complete. |
| SDK default `maxRetries: 2` | Set `maxRetries: 0` for the gateway, otherwise a 502 or connection error repeats the whole request up to three times. |
| SDK `timeout` covers only the wait for response headers | It does the first-token job (see above). The idle timer between events must be the request layer's own. |

### 4.6 Values for the constants named in cluster A's probe table

| Constant (cluster A) | Value from this check | Note |
|---|---|---|
| `DEFAULT_SYSTEM_AS_USER.cherry` | `false` | system accepted and obeyed in both forms by all four |
| `SYSTEM_REJECTED_PATTERNS` | unchanged | no rejection seen; nothing to add |
| token-count route | exists; do not use for calibration | model-independent estimate, 14–17 % low |
| `POST_CANCEL_COOLDOWN_MS` | `0` | gateway aborts its upstream call in the same second |
| `STOP_REASON_ALIASES` | unchanged | the gateway already sends `end_turn` and `max_tokens`; aliases never triggered |
| `ACCEPT_UNKNOWN_STOP_REASON_WITH_TAG` | `false` | a completed stream always had a stop reason |
| `EDIT_USE_STOP_SEQUENCE.cherry` | `false`, and it should not become a setting | see 4.4; the "append the closing tag when the stop reason is `stop_sequence`" branch can never run on this gateway |
| `SEND_TEMPERATURE.cherry` | `true` | clamp to 0–2 before sending |
| `DEFAULT_WINDOW_TOKENS.cherry` | `32000` instead of `8192` | verified without truncation to 36,800 prompt tokens on glmFlash and dsFast, to 7,500 on glm and ds; the true window is unmeasured |
| `DEFAULT_HEADROOM_TOKENS.cherry` | `2000` stays as the default for an unknown model | per model: 4.1 |
| `THINK_TAGS` | keep as a guard | reasoning always arrived as `thinking` blocks, never as tags in text |
| `CONNECT_TIMEOUT_MS` | **180 s, not 60 s** | headers arrive with the first token; measured worst case 58.9 s, which a 60 s limit would have passed by one second |
| `FIRST_EVENT_TIMEOUT_MS` | 180 s is harmless but never the binding limit | the first event arrives within a millisecond of the headers |
| `STREAM_IDLE_TIMEOUT_MS` | 120 s is safe | longest gap between events 1.1 s |
| `CONTEXT_OVERFLOW_PATTERNS` | unverified | no overflow was reached |
| `MAX_PLAUSIBLE_CHARS_PER_TOKEN` | `6.5` is workable only if cached tokens are added to the prompt size first | real value 2.7; with a cache hit `input_tokens` alone gave 3.41 and would exceed 6.5 once more than about 60 % of a prompt is cached |
| `MAX_ACTIVE_REQUESTS` | `8` is fine | two concurrent streams stay separate |
| `MAX_OUTPUT_TOKENS.cherry` | `32000` is accepted | `max_tokens: 200000` was not rejected, so the gateway gives no upper bound to learn from |
| `MAX_RETRIES.cherry` | `0` | confirmed necessary |
| new: characters per token, starting value | `2.7` for the gateway | replaces 3 |
| new: `thinking: {type:"disabled"}` on gateway requests | on by default | contradicts "never adds `thinking`" in cluster A, step 7 of the parameter builder |

---

## 5. Not measured

- The real context window of each model and the error text for exceeding it. Status on 18 Nov 2026: still not measured. The measurement (scenario A-L26 of stage I-02: 50 000, 100 000, 200 000 and 400 000 characters per model, about 280 000 prompt tokens per model) needs the owner's approval because of its size and cost, and was not run. Until it is, `DEFAULT_WINDOW_TOKENS.cherry` stays 32 000 and `CONTEXT_OVERFLOW_PATTERNS` holds only the drafted patterns.
- Whether the provider stops generating and billing after an abort.
- `refusal` or content-filter stop reasons.
- Authentication by a Bearer header on `/v1/messages` (the SDK sends `x-api-key`, which works; FAUST's model list call uses `Authorization: Bearer` on `/v1/models`, `electron.js:921–925`).
- `/v1/chat/completions` behaviour; only the Anthropic-format route was tested.
- Quality of the Finnish; that is step 0 of the report, not this check.
- Variance: every latency and reasoning figure above comes from one to four runs.

## 6. Scripts

All in istunnon väliaikaiskansio (ei tallessa), each run as `python3 withkey.py CHERRY_API_KEY node <script> [args]`.

| Script | What it does |
|---|---|
| `lib.js`, `texts.js` | shared helpers (raw SSE capture, redaction, request counter) and the Finnish test prose |
| `01_discover.js` | routes, model list |
| `02_shapes.js` | count_tokens, missing `max_tokens`, wrong model, invalid key, unreachable port |
| `03_stream.js` | raw SSE capture of a 150-word answer per model |
| `04_variant.js` | the 150-word task with one changed parameter (thinking, effort, temperature, limit) |
| `05_nonstream.js` | non-streaming through the SDK, system as two blocks |
| `06_edit.js` | proofreading task through the SDK stream helper: stop sequence, cut, with and without thinking |
| `07_long.js` | 20,000- and 100,000-character prompts with code words at both ends |
| `08_abort.js` | abort after five deltas, two ways |
| `09_concurrent.js` | two streams at once |
| `10_sdk_local.js` | no gateway traffic: replays captured event shapes through the SDK from a local server |
| `11_bigmax.js` | `max_tokens: 200000` |
| `12_headers.js` | when the response headers arrive relative to the first body bytes |
| `13_leakcheck.js` | scans the probe folder and this file for the key; prints counts only |
| `out/` | JSON captures per run, `request_log.txt` with the 62 counted requests |
