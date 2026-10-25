/**
 * gemini.mjs — Phân tích văn bản Google AI bằng Gemini API hoặc Chrome Built-in AI
 *
 * Thứ tự ưu tiên:
 * 1. Chrome Built-in AI (Gemini Nano, offline, miễn phí nếu có)
 * 2. Gemini API (qua Google AI Studio API key, mô hình gemini-1.5-flash / gemini-2.0-flash)
 * 3. Fallback: trả về null để caller dùng regex dự phòng
 */

// Fallback list nếu không fetch được từ API
// Thứ tự ưu tiên: model mới nhất → cũ hơn
const GEMINI_MODELS_FALLBACK = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

let _workingModel = null;
let _workingModelKey = null;
let _cachedModels = null; // cache danh sách model fetch được từ API

/**
 * Fetch danh sách model hợp lệ từ Gemini API (models.list)
 * Chỉ lấy các model hỗ trợ generateContent và là Flash/Pro model
 */
async function fetchAvailableModels(apiKey) {
  if (_cachedModels) return _cachedModels;
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return null;
    const json = await resp.json();
    const models = (json.models || [])
      .filter(m =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        m.name && !m.name.includes('embedding') && !m.name.includes('aqa')
      )
      .map(m => m.name.replace('models/', ''))
      // Ưu tiên flash trước, rồi pro
      .sort((a, b) => {
        const score = s => {
          if (s.includes('flash-lite')) return 1;
          if (s.includes('flash'))     return 2;
          if (s.includes('pro'))       return 3;
          return 4;
        };
        return score(a) - score(b);
      });
    if (models.length > 0) {
      _cachedModels = models;
      console.log('[GeminiParser] Danh sách model hợp lệ từ API:', models);
      return models;
    }
  } catch (e) {
    console.warn('[GeminiParser] Không fetch được danh sách model:', e.message);
  }
  return null;
}

const SYSTEM_PROMPT = `Bạn là chuyên gia bóc tách thông tin nhân sự và doanh nghiệp B2B từ kết quả tìm kiếm Google AI Overview.

Nhiệm vụ: Đọc kỹ toàn bộ văn bản và danh sách các đường liên kết, sau đó trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích ngoài JSON) theo cấu trúc:
{
  "ownerName": "Danh sách TẤT CẢ các nhân sự lãnh đạo, người đại diện, quản lý thương hiệu/sản phẩm/mua hàng tìm thấy kèm chức vụ trong ngoặc đơn, ngăn cách bằng dấu | (Ví dụ: Ryan DeCaire (CEO) | Lauren Mack (Senior Brand Manager) | Kathryn Groenewold (VP Marketing) | Izzy O'Brien (Associate Brand Manager) hoặc với doanh nghiệp nhỏ: Stefanie Theis (Owner / Head Trainer))",
  "ownerTitle": "Chức danh tương ứng của các nhân sự trên, ngăn cách bằng dấu | (Ví dụ: CEO Paw Prosper | Senior Brand Manager FitPaws | VP of Marketing)",
  "companyName": "Tên thương hiệu và công ty mẹ nếu có (Ví dụ: FitPaws (Công ty mẹ: Paw Prosper))",
  "ownerEmail": "TẤT CẢ email cá nhân của các nhân sự trên hoặc email liên hệ công việc/thu mua/hợp tác (nếu có, không lấy email rác), ngăn cách bằng dấu |",
  "phone": "TẤT CẢ số điện thoại liên hệ tìm thấy (cá nhân hoặc công ty), ngăn cách bằng dấu |",
  "address": "Địa chỉ cơ sở / trụ sở (nếu có)",
  "socials": "Các đường link URL đầy đủ của mạng xã hội (đặc biệt là LinkedIn cá nhân của các lãnh đạo/quản lý, LinkedIn công ty, Facebook, Instagram, YouTube...), ngăn cách bằng dấu |",
  "notes": "Ghi chú ngắn về nhân sự hoặc bộ phận mục tiêu phù hợp nhất để liên hệ chào hàng/hợp tác kinh doanh (Ví dụ: Để chào bán sản phẩm/cỏ nhân tạo nên liên hệ Lauren Mack (Senior Brand Manager) hoặc bộ phận Procurement của Paw Prosper)"
}

Quy tắc bắt buộc:
1. ownerName: Lấy HẾT TẤT CẢ các nhân sự có liên quan (Chủ sở hữu, Founder, CEO, Brand Manager, Product Manager, Procurement/Chuỗi cung ứng, Marketing VP/Director). Mỗi nhân sự ghi rõ: Họ Tên (Chức vụ), phân cách giữa các người bằng dấu " | ". Tuyệt đối không để tên website, tên thương hiệu vào phần tên người.
2. ownerEmail & phone: Nếu có thông tin liên hệ riêng hoặc chung của từng người thì lấy hết về, phân cách bằng dấu " | ".
3. socials: Phải là ĐƯỜNG LINK URL ĐẦY ĐỦ (bắt đầu bằng https:// hoặc http://). Nếu văn bản đề cập đến LinkedIn, Facebook... của cá nhân hay công ty kèm liên kết trong danh sách link, hãy ghép đúng URL chính thức tương ứng. Tuyệt đối không chỉ ghi tên nền tảng (như "LinkedIn", "Facebook").
4. notes: Tóm tắt 1-2 câu ai là người hoặc phòng ban thích hợp nhất để liên hệ nếu muốn chào bán sản phẩm (ví dụ: cỏ nhân tạo cho thú cưng, thiết bị vận động).
5. Trường nào không tìm thấy thông tin thì để chuỗi rỗng "".
6. CHỈ TRẢ VỀ JSON THUẦN.`;

/**
 * Kiểm tra Chrome Built-in AI có sẵn không (Prompt API / Gemini Nano)
 */
async function isChromeAIAvailable() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.ai && window.ai.languageModel) {
      const caps = await window.ai.languageModel.capabilities();
      return caps?.available === 'readily' || caps?.available === 'after-download';
    }
    if (window.LanguageModel) {
      const caps = await window.LanguageModel.availability();
      return caps === 'available' || caps === 'downloadable';
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Phân tích văn bản bằng Chrome Built-in AI (Gemini Nano)
 */
async function parseWithChromeAI(text) {
  try {
    const API = window.ai?.languageModel || window.LanguageModel;
    if (!API) return null;

    const session = await API.create({
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.1,
      topK: 10,
    });

    const userPrompt = `Hãy trích xuất thông tin doanh nghiệp từ kết quả Google AI sau:\n\n${text.slice(0, 10000)}`;
    const result = await session.prompt(userPrompt);
    session.destroy?.();

    return parseGeminiResponse(result);
  } catch (e) {
    console.warn('[GeminiParser] Chrome AI error:', e);
    return null;
  }
}

/**
 * Gọi Google Generative Language API (Gemini API) với xử lý timeout và fallback mô hình
 */
async function callGeminiRaw(prompt, apiKey, { systemPrompt = null, maxTokens = 1200 } = {}) {
  if (!apiKey || apiKey.trim().length < 10) return null;

  // Ghép system prompt trực tiếp vào nội dung prompt để tương thích 100% với mọi model và version (tránh lỗi 400 của system_instruction)
  const fullTextPrompt = systemPrompt
    ? `${systemPrompt}\n\n---\n\n${prompt}`
    : prompt;

  const body = {
    contents: [{
      parts: [{ text: fullTextPrompt }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: maxTokens
    }
  };

  // Danh sách mô hình để thử: ưu tiên mô hình đã hoạt động thành công trước đó
  // Fetch danh sách model hợp lệ từ API, fallback về list cứng nếu thất bại
  const liveModels = await fetchAvailableModels(apiKey) || GEMINI_MODELS_FALLBACK;
  const modelsToTry = [];
  if (_workingModel && _workingModelKey === apiKey) {
    modelsToTry.push(_workingModel);
  }
  for (const m of liveModels) {
    if (!modelsToTry.includes(m)) modelsToTry.push(m);
  }

  let lastError = null;
  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    console.log(`[GeminiParser] Gửi request đến model: ${model}...`);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      try {
        controller.abort(new Error('Gemini API timeout sau 35s'));
      } catch (e) {
        controller.abort();
      }
    }, 35000);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (resp.status === 404) {
        console.warn(`[GeminiParser] Model ${model} không tồn tại (404), thử model khác...`);
        lastError = new Error(`Model ${model} không tồn tại (404)`);
        continue;
      }

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.warn(`[GeminiParser] Model ${model} HTTP ${resp.status}:`, errText.slice(0, 300));
        if (resp.status === 429 || resp.status === 503) {
          lastError = new Error(`Gemini quá tải / hết hạn mức (HTTP ${resp.status})`);
          continue;
        }
        throw new Error(`Gemini API ${resp.status}: ${errText.slice(0, 300)}`);
      }

      const json = await resp.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log(`[GeminiParser] Thành công với model ${model}`);
      _workingModel = model;
      _workingModelKey = apiKey;
      return rawText;
    } catch (e) {
      const isAbort = e.name === 'AbortError' || e.message?.includes('aborted') || e.message?.includes('timeout');
      console.warn(`[GeminiParser] Model ${model} gặp lỗi:`, e.message);
      lastError = e;
      if (isAbort) {
        break;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Không thể kết nối với Gemini API. Kiểm tra mạng hoặc API key.');
}

/**
 * Phân tích văn bản kết quả Google AI bằng Gemini API
 */
async function parseWithGeminiAPI(text, apiKey) {
  if (!apiKey || apiKey.length < 10 || !text) return null;
  const rawText = await callGeminiRaw(
    `Dưới đây là toàn bộ văn bản và các đường link trích dẫn thu thập từ kết quả tra cứu Google AI về một website. Hãy bóc tách đầy đủ các thông tin và trả về DUY NHẤT một đối tượng JSON:\n\n${text.slice(0, 12000)}`,
    apiKey,
    { systemPrompt: SYSTEM_PROMPT, maxTokens: 1200 }
  );
  return rawText ? parseGeminiResponse(rawText) : null;
}

/**
 * Parse chuỗi JSON trả về từ Gemini
 */
function parseGeminiResponse(rawText) {
  if (!rawText) return null;
  try {
    let jsonStr = '';
    const codeBlock = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      jsonStr = codeBlock[1].trim();
    } else {
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = rawText.slice(firstBrace, lastBrace + 1).trim();
      } else {
        jsonStr = rawText.trim();
      }
    }
    const parsed = JSON.parse(jsonStr);

    return {
      ownerName:   sanitize(parsed.ownerName),
      ownerTitle:  sanitize(parsed.ownerTitle),
      companyName: sanitize(parsed.companyName),
      ownerEmail:  sanitize(parsed.ownerEmail),
      phone:       sanitize(parsed.phone),
      address:     sanitize(parsed.address),
      socials:     sanitize(parsed.socials),
      notes:       sanitize(parsed.notes),
    };
  } catch (e) {
    console.warn('[GeminiParser] Lỗi parse JSON:', e, rawText.slice(0, 300));
    // Fallback: Dung regex trich xuat truc tiep tung truong tu rawText cua Gemini
    const extractField = field => {
      const rx = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i');
      const m = rawText.match(rx);
      return m ? sanitize(m[1]) : '';
    };
    const fallback = {
      ownerName:   extractField('ownerName'),
      ownerTitle:  extractField('ownerTitle'),
      companyName: extractField('companyName'),
      ownerEmail:  extractField('ownerEmail'),
      phone:       extractField('phone'),
      address:     extractField('address'),
      socials:     extractField('socials'),
      notes:       extractField('notes'),
    };
    if (fallback.ownerName || fallback.companyName || fallback.socials) {
      return fallback;
    }
    throw new Error(`Gemini không trả về JSON hợp lệ: ${rawText.slice(0, 150)}`);
  }
}

function sanitize(val) {
  if (!val || typeof val !== 'string') return '';
  const s = val.trim();
  if (/^(?:none|n\/a|null|unknown|not\s+(?:found|available|mentioned|specified|disclosed)|khong\s+(?:ro|biet|co)|chua|-)$/i.test(s)) return '';
  return s;
}

/**
 * Hàm chính: Phân tích văn bản Google AI, thử Chrome AI trước, sau đó dùng Gemini API
 * @param {string} text - Văn bản + link từ trang Google AI
 * @param {string|null} geminiApiKey - API key từ người dùng (nếu có)
 * @returns {Promise<object|null>}
 */
export async function parseWithAI(text, geminiApiKey = null) {
  if (!text || text.trim().length < 30) return null;

  // Thử 1: Chrome Built-in AI (nếu có trong Chrome của người dùng)
  try {
    const hasChromeAI = await isChromeAIAvailable();
    if (hasChromeAI) {
      console.log('[GeminiParser] Thử dùng Chrome Built-in AI (Gemini Nano)...');
      const result = await parseWithChromeAI(text);
      if (result && (result.ownerName || result.companyName || result.socials)) {
        console.log('[GeminiParser] Chrome AI thành công:', result);
        return result;
      }
    }
  } catch (e) {
    console.warn('[GeminiParser] Chrome AI không khả dụng:', e);
  }

  // Thử 2: Gemini API (nếu người dùng có nhập key)
  if (geminiApiKey) {
    console.log('[GeminiParser] Gọi Gemini API để bóc tách thông tin...');
    const result = await parseWithGeminiAPI(text, geminiApiKey);
    if (result && (result.ownerName || result.companyName || result.socials)) {
      console.log('[GeminiParser] Gemini API thành công:', result);
      return result;
    }
    return result;
  }

  return null;
}

/**
 * Kiểm tra API key hợp lệ bằng cách gửi một câu chào ngắn
 */
export async function testGeminiApiKey(apiKey) {
  if (!apiKey || apiKey.trim().length < 10) {
    return { ok: false, error: 'Vui lòng nhập API key từ Google AI Studio (aistudio.google.com/apikey)' };
  }
  try {
    const raw = await callGeminiRaw('Trả lời duy nhất JSON: {"status":"ok"}', apiKey, { maxTokens: 60 });
    if (raw) {
      const activeModel = _workingModel || 'gemini-1.5-flash';
      return {
        ok: true,
        info: `Kết nối thành công! Đang dùng mô hình ${activeModel}. Đã sẵn sàng phân tích kết quả tìm kiếm Google AI.`
      };
    }
    return { ok: false, error: 'Không nhận được dữ liệu từ Gemini API' };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Tra cứu trực tiếp với Gemini
 */
export async function geminiSearchAndExtract(domain, apiKey) {
  if (!apiKey || apiKey.trim().length < 10 || !domain) return null;

  const prompt = `Hãy tra cứu thông tin về website "${domain}" và trả lời:
"${domain}" owner founder "người đại diện" ai là chủ sở hữu, thông tin liên hệ, mạng xã hội

Sau đó trả về DUY NHẤT một JSON hợp lệ với các trường:
{
  "ownerName": "Tên người chủ / sáng lập / đại diện pháp lý (CHỈ TÊN NGƯỜI THỰC)",
  "ownerTitle": "Chức danh (Founder, Owner, CEO, Head Trainer, Breeder...)",
  "companyName": "Tên công ty / thương hiệu",
  "ownerEmail": "Email cá nhân của chủ (không lấy email chung)",
  "phone": "Số điện thoại",
  "address": "Địa chỉ đầy đủ",
  "socials": "Các URL mạng xã hội chính thức phân cách bằng |"
}`;

  const rawText = await callGeminiRaw(prompt, apiKey, { systemPrompt: SYSTEM_PROMPT, maxTokens: 1200 });
  return rawText ? parseGeminiResponse(rawText) : null;
}

// Backward compatibility aliases
export const callGemini = (prompt, apiKey) => callGeminiRaw(prompt, apiKey);
export const parseOwnerWithAI = (text, apiKey) => parseWithAI(text, apiKey);

