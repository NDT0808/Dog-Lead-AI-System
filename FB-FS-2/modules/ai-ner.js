// ai-ner.js — Transformer-based NER (Named Entity Recognition) chạy cục bộ trong Chrome
import { cleanPersonName, isValidPersonName, NON_PERSON_WORDS } from './core.js';

let pipelineFn = null;
let envObj = null;
let nerPipeline = null;
let isLoading = false;
let initError = null;

async function loadTransformers() {
  if (pipelineFn) return { pipeline: pipelineFn, env: envObj };
  const m = await import('../lib/transformers.min.js');
  pipelineFn = m.pipeline;
  envObj = m.env;

  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL && envObj?.backends?.onnx?.wasm) {
    envObj.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('lib/');
  }
  if (envObj) {
    envObj.allowRemoteModels = true;
    envObj.allowLocalModels = true;
  }
  return { pipeline: pipelineFn, env: envObj };
}

export async function getNERPipeline(onProgress) {
  if (nerPipeline) return nerPipeline;
  if (isLoading) {
    while (isLoading) {
      await new Promise(r => setTimeout(r, 200));
    }
    if (nerPipeline) return nerPipeline;
    throw new Error(initError || 'Khong the khoi tao mo hinh Transformer AI');
  }

  isLoading = true;
  try {
    onProgress?.('Dang khoi tao Transformer AI (Xenova/bert-base-NER)...');
    const { pipeline } = await loadTransformers();
    nerPipeline = await pipeline('token-classification', 'Xenova/bert-base-NER', {
      quantized: true,
      progress_callback: data => {
        if (data && data.status === 'progress' && data.file) {
          const pct = Math.round(data.progress || 0);
          onProgress?.(`Dang tai model AI (${data.file}): ${pct}%`);
        }
      }
    });
    onProgress?.('Mo hinh Transformer AI da san sang!');
    return nerPipeline;
  } catch (err) {
    initError = err.message;
    throw err;
  } finally {
    isLoading = false;
  }
}

export async function extractOwnerWithAI(text, onProgress) {
  if (!text || text.length < 15) return null;
  try {
    const pipe = await getNERPipeline(onProgress);

    const sentences = text
      .split(/[\r\n.]+/g)
      .map(s => s.trim())
      .filter(s => s.length >= 15 && s.length <= 400 && /(owner|founder|breeder|president|director|started|founded|created|run|contact|kate|amy|tanya|tiffany|lori|we|my name|i am|i'm)/i.test(s))
      .slice(0, 8);

    if (!sentences.length) return null;

    const candidates = [];

    for (const sentence of sentences) {
      try {
        const output = await pipe(sentence);
        if (!Array.isArray(output)) continue;

        let currentPerson = '';
        let currentScore = 0;

        for (const token of output) {
          const ent = (token.entity_group || token.entity || '').toUpperCase();
          const word = (token.word || '').replace(/^##/, '');

          if (ent.includes('PER')) {
            if (!currentPerson) currentPerson = word;
            else if (token.word.startsWith('##')) currentPerson += word;
            else currentPerson += ' ' + word;
            currentScore = Math.max(currentScore, token.score || 0.8);
          } else {
            if (currentPerson) {
              const clean = cleanPersonName(currentPerson);
              if (isValidPersonName(clean, true) && !NON_PERSON_WORDS.has(clean.toLowerCase())) {
                candidates.push({ name: clean, score: currentScore, sentence });
              }
              currentPerson = '';
            }
          }
        }

        if (currentPerson) {
          const clean = cleanPersonName(currentPerson);
          if (isValidPersonName(clean, true) && !NON_PERSON_WORDS.has(clean.toLowerCase())) {
            candidates.push({ name: clean, score: currentScore, sentence });
          }
        }
      } catch { }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const aMulti = a.name.includes(' ') ? 1 : 0;
      const bMulti = b.name.includes(' ') ? 1 : 0;
      if (bMulti !== aMulti) return bMulti - aMulti;
      return b.score - a.score;
    });

    return candidates[0];
  } catch (e) {
    console.warn('AI NER inference error:', e);
    return null;
  }
}
