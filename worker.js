/**
 * =================================================================================
 * 項目: Cloudflare FLUX.2 Workers AI API
 * 版本: 1.2.0
 * 作者: kinai9661
 * 說明: 使用 REST API 調用 Cloudflare Workers AI FLUX.2 [dev] 模型
 *       支持多賬號故障轉移策略，突破單賬號限制
 * 博客: https://blog.cloudflare.com/flux-2-workers-ai/
 * =================================================================================
 */

const CONFIG = {
  PROJECT_NAME: "FLUX.2 Workers AI",
  VERSION: "1.2.0",
  API_MASTER_KEY: "1",
  CF_FLUX_MODEL: "@cf/black-forest-labs/flux-2-dev",
  DEFAULT_STEPS: 25,
  DEFAULT_WIDTH: 1024,
  DEFAULT_HEIGHT: 1024,
  MAX_INPUT_IMAGES: 4,
  MAX_ACCOUNTS: 10 // 最大支持 10 個賬號
};

export default {
  async fetch(request, env, ctx) {
    try {
      const apiKey = env.API_MASTER_KEY || CONFIG.API_MASTER_KEY;
      const accounts = getAvailableAccounts(env);
      
      request.ctx = { apiKey, accounts, env };
      const url = new URL(request.url);
      
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      
      if (url.pathname === '/') {
        return handleUI(request);
      }
      
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          version: CONFIG.VERSION,
          mode: 'Multi-Account Fallback Strategy',
          model: CONFIG.CF_FLUX_MODEL,
          total_accounts: accounts.length,
          accounts_configured: accounts.map(a => `Account ${a.index}`)
        }), {
          headers: corsHeaders({ 'Content-Type': 'application/json' })
        });
      }
      
      if (url.pathname.startsWith('/v1/')) {
        return handleApi(request);
      }
      
      return jsonError('Not Found', 404);
    } catch (e) {
      console.error('Root error:', e);
      return jsonError(`Server error: ${e.message}`, 500);
    }
  }
};

// 獲取所有可用的賬號配置
function getAvailableAccounts(env) {
  const accounts = [];
  
  for (let i = 1; i <= CONFIG.MAX_ACCOUNTS; i++) {
    const token = env[`CF_API_TOKEN_${i}`];
    const accountId = env[`ACCOUNT_${i}`];
    
    if (token && accountId) {
      accounts.push({
        index: i,
        token: token,
        accountId: accountId
      });
    }
  }
  
  return accounts;
}

async function handleApi(request) {
  try {
    const auth = request.headers.get('Authorization');
    const key = request.ctx.apiKey;
    
    if (key !== "1" && auth !== `Bearer ${key}`) {
      return jsonError('Unauthorized', 401);
    }
    
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (path === '/v1/models') {
      return new Response(JSON.stringify({
        object: 'list',
        data: [{
          id: CONFIG.CF_FLUX_MODEL,
          object: 'model',
          created: Date.now(),
          owned_by: 'cloudflare'
        }]
      }), {
        headers: corsHeaders({ 'Content-Type': 'application/json' })
      });
    }
    
    if (path === '/v1/images/generations') {
      return handleImageGeneration(request);
    }
    
    return jsonError('Not Found', 404);
  } catch (e) {
    console.error('API error:', e);
    return jsonError(`API error: ${e.message}`, 500);
  }
}

async function handleImageGeneration(request) {
  try {
    const accounts = request.ctx.accounts;
    
    if (!accounts || accounts.length === 0) {
      return jsonError('No Cloudflare accounts configured. Please add CF_API_TOKEN_X and ACCOUNT_X environment variables (X = 1, 2, 3...).', 500);
    }
    
    const contentType = request.headers.get('content-type') || '';
    let prompt, inputImages = [], steps, width, height, seed;
    
    // 處理 multipart/form-data
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      prompt = formData.get('prompt');
      steps = parseInt(formData.get('steps')) || CONFIG.DEFAULT_STEPS;
      width = parseInt(formData.get('width')) || CONFIG.DEFAULT_WIDTH;
      height = parseInt(formData.get('height')) || CONFIG.DEFAULT_HEIGHT;
      seed = formData.get('seed') ? parseInt(formData.get('seed')) : undefined;
      
      for (let i = 0; i < CONFIG.MAX_INPUT_IMAGES; i++) {
        const img = formData.get(`input_image_${i}`);
        if (img && img instanceof Blob) {
          inputImages.push(img);
        }
      }
    } 
    // 處理 JSON
    else {
      const body = await request.json();
      prompt = body.prompt || body.input;
      
      if (typeof prompt === 'object') {
        prompt = JSON.stringify(prompt);
      }
      
      steps = body.steps || CONFIG.DEFAULT_STEPS;
      width = body.width || CONFIG.DEFAULT_WIDTH;
      height = body.height || CONFIG.DEFAULT_HEIGHT;
      seed = body.seed;
      
      if (body.images && Array.isArray(body.images)) {
        for (const imgData of body.images.slice(0, CONFIG.MAX_INPUT_IMAGES)) {
          if (imgData.startsWith('data:image')) {
            try {
              const res = await fetch(imgData);
              const blob = await res.blob();
              inputImages.push(blob);
            } catch (e) {
              console.error('Failed to process image:', e);
            }
          }
        }
      }
    }
    
    if (!prompt) {
      return jsonError('Prompt is required', 400);
    }
    
    console.log('Generation request:', {
      prompt: prompt.substring(0, 100),
      steps, width, height, seed,
      inputImagesCount: inputImages.length,
      availableAccounts: accounts.length
    });
    
    // 使用故障轉移策略生成圖像
    const result = await generateWithFallback(accounts, {
      prompt, inputImages, steps, width, height, seed
    });
    
    return new Response(JSON.stringify({
      id: crypto.randomUUID(),
      object: 'image.generation',
      created: Math.floor(Date.now() / 1000),
      model: CONFIG.CF_FLUX_MODEL,
      account_used: result.accountUsed,
      data: [{
        b64_json: result.imageData,
        prompt: prompt,
        revised_prompt: prompt
      }]
    }), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
    
  } catch (e) {
    console.error('Generation error:', e);
    return jsonError(`Generation failed: ${e.message}`, 500);
  }
}

// 故障轉移策略：嘗試所有賬號直到成功
async function generateWithFallback(accounts, params) {
  let lastError = null;
  let attemptedAccounts = [];
  
  for (const account of accounts) {
    try {
      console.log(`⚙️ Trying Account ${account.index}...`);
      attemptedAccounts.push(account.index);
      
      const result = await callCloudflareAPI(account, params);
      
      console.log(`✅ Success with Account ${account.index}`);
      return {
        imageData: result,
        accountUsed: account.index
      };
      
    } catch (error) {
      console.error(`❌ Account ${account.index} failed: ${error.message}`);
      lastError = error;
      
      // 檢查是否為速率限制或配額錯誤
      const errorMsg = error.message.toLowerCase();
      const isRateLimit = errorMsg.includes('429') || 
                          errorMsg.includes('quota') || 
                          errorMsg.includes('rate limit') ||
                          errorMsg.includes('too many requests');
      
      if (isRateLimit) {
        console.log(`🔄 Account ${account.index} rate limited, trying next account...`);
        continue; // 嘗試下一個賬號
      }
      
      // 其他錯誤（非配額問題），直接拋出
      throw error;
    }
  }
  
  // 所有賬號都失敗
  throw new Error(
    `All ${accounts.length} accounts exhausted. ` +
    `Attempted accounts: [${attemptedAccounts.join(', ')}]. ` +
    `Last error: ${lastError?.message || 'Unknown error'}`
  );
}

// 調用 Cloudflare API
async function callCloudflareAPI(account, params) {
  const { prompt, inputImages, steps, width, height, seed } = params;
  
  const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${CONFIG.CF_FLUX_MODEL}`;
  
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('steps', steps.toString());
  form.append('width', width.toString());
  form.append('height', height.toString());
  if (seed) form.append('seed', seed.toString());
  
  inputImages.forEach((img, i) => {
    form.append(`input_image_${i}`, img);
  });
  
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${account.token}`
    },
    body: form
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Cloudflare API error (${res.status}): ${errorText}`);
  }
  
  const result = await res.json();
  const imageData = result.result?.image || result.image || result.result;
  
  if (!imageData) {
    throw new Error('No image data in API response');
  }
  
  return imageData;
}

function handleUI(request) {
  const origin = new URL(request.url).origin;
  const key = request.ctx.apiKey;
  const accounts = request.ctx.accounts;
  const isConfigured = accounts && accounts.length > 0;
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${CONFIG.PROJECT_NAME}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
--primary:#667eea;--secondary:#f5576c;--success:#10b981;
--bg:#0f172a;--surface:#1e293b;--card:#334155;
--text:#f1f5f9;--text2:#94a3b8;--border:rgba(255,255,255,.1);
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column}
.header{background:var(--surface);border-bottom:1px solid var(--border);padding:20px;text-align:center}
.title{font-size:32px;font-weight:800;background:linear-gradient(135deg,var(--primary),var(--secondary));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.subtitle{color:var(--text2);font-size:14px}
.status{margin-top:8px;padding:8px 16px;border-radius:6px;display:inline-block;font-size:12px;font-weight:600}
.status.ok{background:rgba(16,185,129,.2);color:#10b981}
.status.error{background:rgba(239,68,68,.2);color:#ef4444}
.container{max-width:1200px;margin:40px auto;padding:0 20px;flex:1;display:grid;grid-template-columns:420px 1fr;gap:24px}
.sidebar{background:var(--surface);border-radius:14px;padding:24px;height:fit-content;position:sticky;top:20px}
.main{background:var(--surface);border-radius:14px;padding:24px}
.card{background:var(--card);padding:16px;border-radius:10px;margin-bottom:16px;border:1px solid var(--border)}
.label{display:block;font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text2);text-transform:uppercase}
.textarea{width:100%;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;transition:all .3s;min-height:100px;resize:vertical;font-size:14px;line-height:1.6}
.textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(102,126,234,.1)}
.btn{padding:14px 24px;border:none;border-radius:10px;font-weight:700;cursor:pointer;transition:all .3s;font-size:14px}
.btn-primary{background:linear-gradient(135deg,var(--primary),#764ba2);color:#fff;width:100%}
.btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(102,126,234,.4)}
.btn-primary:disabled{opacity:.6;cursor:not-allowed;transform:none}
.upload-zone{border:2px dashed var(--border);border-radius:10px;padding:24px;text-align:center;cursor:pointer;transition:all .3s;background:var(--surface)}
.upload-zone:hover{border-color:var(--primary);background:rgba(102,126,234,.05)}
.upload-zone.dragover{border-color:var(--primary);background:rgba(102,126,234,.1)}
.preview-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px}
.preview-item{position:relative;border-radius:8px;overflow:hidden;border:2px solid var(--border)}
.preview-item img{width:100%;height:120px;object-fit:cover}
.preview-remove{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.8);color:#fff;border:none;cursor:pointer;font-size:14px}
.result-image{width:100%;border-radius:10px;margin-top:16px;border:1px solid var(--border)}
.info-box{background:rgba(102,126,234,.1);padding:16px;border-radius:10px;border-left:4px solid var(--primary);font-size:13px;line-height:1.6;margin-bottom:16px}
.slider-group{margin-top:12px}
.slider-label{display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px}
.slider{width:100%;height:6px;border-radius:3px;background:var(--surface);outline:none;-webkit-appearance:none}
.slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--primary);cursor:pointer}
.size-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.size-btn{padding:10px;border:2px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;text-align:center;transition:all .2s}
.size-btn:hover{background:var(--surface);border-color:var(--primary)}
.size-btn.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.loading{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1024px){
.container{grid-template-columns:1fr;gap:20px}
.sidebar{position:static}
}
</style>
</head>
<body>
<div class="header">
<div class="title">🎨 ${CONFIG.PROJECT_NAME}</div>
<div class="subtitle">Powered by Cloudflare Workers AI • Model: ${CONFIG.CF_FLUX_MODEL}</div>
<div class="status ${isConfigured ? 'ok' : 'error'}">${isConfigured ? `✅ ${accounts.length} 個賬號已配置` : '❌ 未配置賬號'}</div>
</div>

<div class="container">
<aside class="sidebar">
${!isConfigured ? '<div class="info-box" style="background:rgba(239,68,68,.1);border-left-color:#ef4444"><strong>⚠️ 環境變量未配置</strong><br>請配置至少一組：<br>• CF_API_TOKEN_1<br>• ACCOUNT_1<br><br>可配置多組以突破限制！</div>' : `<div class="info-box" style="background:rgba(16,185,129,.1);border-left-color:#10b981"><strong>🔄 故障轉移模式</strong><br>已配置 ${accounts.length} 個賬號<br>當某個賬號達到限制時<br>會自動切換到下一個！</div>`}

<div class="info-box">
<strong>✨ FLUX.2 [dev] 特性</strong><br>
• 多參考圖（最多4張）<br>
• 角色一致性保持<br>
• JSON 高級提示詞<br>
• 最大 4MP 輸出<br>
• 智能故障轉移
</div>

<div class="card">
<label class="label">📝 提示詞</label>
<textarea class="textarea" id="prompt" placeholder="描述您想要的圖像...\n\n示例：A serene Japanese garden with cherry blossoms">A beautiful sunset over mountains</textarea>
</div>

<div class="card">
<label class="label">🖼️ 參考圖片（最多4張）</label>
<div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()">
<div style="font-size:32px;margin-bottom:8px">📤</div>
<div style="font-size:13px;color:var(--text2)">點擊或拖拽上傳圖片</div>
</div>
<input type="file" id="file-input" accept="image/*" multiple style="display:none" onchange="handleFiles(this.files)">
<div class="preview-grid" id="preview-grid"></div>
</div>

<div class="card">
<label class="label">📐 圖片尺寸</label>
<div class="size-grid">
<div class="size-btn" onclick="setSize(512,512)">512×512</div>
<div class="size-btn active" onclick="setSize(1024,1024)">1024×1024</div>
<div class="size-btn" onclick="setSize(1024,768)">1024×768</div>
<div class="size-btn" onclick="setSize(768,1024)">768×1024</div>
<div class="size-btn" onclick="setSize(1280,720)">1280×720</div>
<div class="size-btn" onclick="setSize(1536,1024)">1536×1024</div>
<div class="size-btn" onclick="setSize(1920,1080)">1920×1080</div>
</div>
</div>

<div class="card">
<label class="label">⚙️ 生成參數</label>
<div class="slider-group">
<div class="slider-label">
<span>Steps（推薦 25）</span>
<span id="steps-value">25</span>
</div>
<input type="range" class="slider" id="steps-slider" min="10" max="50" value="25" oninput="updateValue('steps',this.value)">
</div>
<div class="slider-group">
<div class="slider-label">
<span>Seed（可選）</span>
<span id="seed-value">隨機</span>
</div>
<input type="number" class="input" id="seed-input" placeholder="留空為隨機" style="margin-top:8px;width:100%;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text)" oninput="updateSeed(this.value)">
</div>
</div>

<button class="btn btn-primary" id="gen-btn" onclick="generate()" ${isConfigured ? '' : 'disabled'}>✨ 生成圖像</button>

<div class="card" style="margin-top:16px">
<label class="label">📡 API 接口</label>
<div style="background:var(--surface);padding:12px;border-radius:8px;font-family:monospace;font-size:11px;overflow-x:auto">
POST ${origin}/v1/images/generations<br>
Authorization: Bearer ${key}
</div>
</div>
</aside>

<main class="main">
<h2 style="margin-bottom:20px;font-size:20px">🖼️ 生成結果</h2>
<div id="result"></div>
</main>
</div>

<script>
const API = '${origin}/v1/images/generations';
const KEY = '${key}';
let uploadedImages = [];
let params = { width: 1024, height: 1024, steps: 25, seed: null };

const uploadZone = document.getElementById('upload-zone');
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
  uploadZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
});
['dragenter', 'dragover'].forEach(evt => {
  uploadZone.addEventListener(evt, () => uploadZone.classList.add('dragover'));
});
['dragleave', 'drop'].forEach(evt => {
  uploadZone.addEventListener(evt, () => uploadZone.classList.remove('dragover'));
});
uploadZone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));

function handleFiles(files) {
  Array.from(files).slice(0, ${CONFIG.MAX_INPUT_IMAGES} - uploadedImages.length).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        uploadedImages.push({ file, dataURL: e.target.result });
        renderPreviews();
      };
      reader.readAsDataURL(file);
    }
  });
}

function renderPreviews() {
  const grid = document.getElementById('preview-grid');
  grid.innerHTML = uploadedImages.map((img, i) => 
    '<div class="preview-item"><img src="' + img.dataURL + '"><button class="preview-remove" onclick="removeImage(' + i + ')">×</button></div>'
  ).join('');
}

function removeImage(index) {
  uploadedImages.splice(index, 1);
  renderPreviews();
}

function setSize(w, h) {
  document.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  params.width = w;
  params.height = h;
}

function updateValue(key, value) {
  params[key] = parseInt(value);
  document.getElementById(key + '-value').textContent = value;
}

function updateSeed(value) {
  params.seed = value ? parseInt(value) : null;
  document.getElementById('seed-value').textContent = value || '隨機';
}

async function generate() {
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) {
    alert('請輸入提示詞');
    return;
  }
  
  const btn = document.getElementById('gen-btn');
  const result = document.getElementById('result');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span> 生成中...';
  result.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2)">正在生成圖像，如遇配額限制會自動切換賬號...</div>';
  
  try {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('steps', params.steps.toString());
    form.append('width', params.width.toString());
    form.append('height', params.height.toString());
    if (params.seed) form.append('seed', params.seed.toString());
    
    uploadedImages.forEach((img, i) => {
      form.append(\`input_image_\${i}\`, img.file);
    });
    
    console.log('Sending request...');
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + KEY },
      body: form
    });
    
    console.log('Response status:', res.status);
    
    if (!res.ok) {
      const text = await res.text();
      console.error('Error response:', text);
      throw new Error(\`Server error (\${res.status}): \${text}\`);
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Non-JSON response:', text);
      throw new Error('服務器返回了非 JSON 響應');
    }
    
    const data = await res.json();
    console.log('Response data received');
    
    if (data.error) throw new Error(data.error.message);
    
    if (data.data && data.data[0]) {
      const imgSrc = 'data:image/png;base64,' + data.data[0].b64_json;
      const accountUsed = data.account_used || '未知';
      
      result.innerHTML = \`
        <div style="background:var(--card);padding:20px;border-radius:10px;border:1px solid var(--border)">
          <div style="margin-bottom:12px;font-weight:600;color:var(--success)">✅ 生成成功！（使用賬號 ${accountUsed}）</div>
          <img src="\${imgSrc}" class="result-image">
          <div style="margin-top:16px">
            <a href="\${imgSrc}" download="flux2-\${Date.now()}.png" style="color:var(--primary);text-decoration:none;font-weight:600">📥 下載圖片</a>
          </div>
        </div>
      \`;
    }
  } catch (e) {
    console.error('Error:', e);
    result.innerHTML = '<div style="padding:20px;background:rgba(239,68,68,.1);border-radius:10px;color:#ef4444">❌ 錯誤：' + e.message + '<br><br>請查看瀏覽器控制台獲取詳細信息</div>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ 生成圖像';
  }
}
</script>
</body>
</html>`;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({
    error: { message: msg, type: 'api_error' }
  }), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}

function corsHeaders(h = {}) {
  return {
    ...h,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}