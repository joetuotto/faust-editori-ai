/**
 * Context session: the glue every caller of the context builder would repeat
 *
 * It asks the AI client which model a role uses and how much room that model
 * has for the prompt, and it remembers which parts the author switched off
 * for each kind of task. No DOM; the client and the settings store are
 * injected (test/services/contextSession.test.js).
 *
 * A built context belongs to one model: for another model, build again.
 */

const contextBuilder = require('./contextBuilder.js');

const EXCLUDE_KEY = 'context.exclude';
const DEFAULT_ANSWER_TOKENS = 1024;

// Only whole parts are remembered. Item keys ('codex:…', 'summary:…') belong
// to one request.
const isPartId = (id) => typeof id === 'string' && contextBuilder.DROP_ORDER.includes(id);

const taskIdOf = (task) => (typeof task === 'string' ? task : task && typeof task.id === 'string' ? task.id : '');

/**
 * @param {object} deps
 * @param {object} deps.aiClient needs modelFor(role) and budgetFor(model, answerTokens)
 * @param {object} deps.settings needs get(key, fallback) and set(key, value)
 */
function createContextSession({ aiClient, settings }) {
  function stored() {
    const value = settings.get(EXCLUDE_KEY, {});
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  /** The part ids the author switched off for this kind of task. */
  function getExclude(taskId) {
    const list = stored()[taskId];
    return Array.isArray(list) ? list.filter(isPartId) : [];
  }

  /** Remember the switched-off parts of one kind of task; other tasks keep theirs. */
  function setExclude(taskId, ids) {
    const partIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(isPartId)));
    settings.set(EXCLUDE_KEY, { ...stored(), [taskId]: partIds });
  }

  /**
   * buildContext with the model's budget and the remembered exclusions.
   * An explicit model wins over the role's model. The answer size comes from
   * the call, else from the task, else it is 1024 tokens.
   * @returns Built plus { model, role, budget }
   */
  function build(args = {}) {
    const { task, project, chapterId, text, cursor, selection, exclude, include, role, answerTokens } = args;
    const model = args.model || aiClient.modelFor(role);
    const answer = answerTokens || (task && task.answerTokens) || DEFAULT_ANSWER_TOKENS;
    const budget = aiClient.budgetFor(model, answer);

    const built = contextBuilder.buildContext({
      task,
      project,
      chapterId,
      text,
      cursor,
      selection,
      budget,
      exclude: exclude === undefined ? getExclude(taskIdOf(task)) : exclude,
      include
    });
    return { ...built, model, role, budget };
  }

  return { build, getExclude, setExclude };
}

let sharedSession = null;

/**
 * The app's one session over the real AI client and settings store. They are
 * required here, not at module load, so that this file's tests do not need them.
 */
function getContextSession() {
  if (!sharedSession) {
    const { getAIClient } = require('./aiClient.js');
    const { getSettingsStore } = require('../settingsStore.js');
    sharedSession = createContextSession({ aiClient: getAIClient(), settings: getSettingsStore() });
  }
  return sharedSession;
}

module.exports = { createContextSession, getContextSession };
