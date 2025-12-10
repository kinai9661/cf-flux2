/**
 * =================================================================================
 * 項目: Cloudflare FLUX.2 Workers AI API
 * 版本: 1.0.0
 * 作者: kinai9661
 * 說明: 支持官方 Cloudflare Workers AI FLUX.2 [dev] 模型
 * 博客: https://blog.cloudflare.com/flux-2-workers-ai/
 * =================================================================================
 */

const CONFIG = {
  PROJECT_NAME: "FLUX.2 Workers AI",
  VERSION: "1.0.0",
  API_MASTER_KEY: "1",
  CF_FLUX_MODEL: "@cf/black-forest-labs/flux-2-dev",
  IMAGE_MODELS: [
    "@cf/black-forest-labs/flux-2-dev"
  ],
  DEFAULT_STEPS: 25,
  DEFAULT_WIDTH: 1024,
  DEFAULT_HEIGHT: 1024,
  MAX_INPUT_IMAGES: 4
};

export default {
  async fetch(request, env, ctx) {
    const apiKey = env.API_MASTER_KEY || CONFIG.API_MASTER_KEY;
    const cfToken = env.CF_API_TOKEN;
    const cfAccount = env.CF_ACCOUNT_ID;
    
    request.ctx = { apiKey, cfToken, cfAccount, env };
    const url = new URL(request.url);
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    
    if (url.pathname === '/') {
      return handleUI(request);
    }
    
    if (url.pathname.startsWith('/v1/')) {
      return handleApi(request);
    }
    
    return jsonError('Not Found', 404);
  }
};

async function handleApi(request) {
  const auth = request.headers.get('Authorization');
  const key = request.ctx.apiKey;
  
  if (key !== "1" && auth !== `Bearer ${key}`) {
    return jsonError('Unauthorized', 401);
  }
  
  const url = new URL(request.url);
  const path = url.pathname;
  
  if (path === '/v1/models') {
    const models = CONFIG.IMAGE_MODELS.map(id => ({
      id,
      object: 'model',
      created: Date.now(),
      owned_by: 'cloudflare'
    }));
    return new Response(JSON.stringify({ object: 'list', data: models }), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
  }
  
  if (path === '/v1/images/generations') {
    return handleImageGeneration(request);
  }
  
  return jsonError('Not Found', 404);
}

async function handleImageGeneration(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let prompt, inputImages = [], steps, width, height, seed;
    
    // 處理 multipart/form-data（支持圖片上傳）
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      prompt = formData.get('prompt');
      steps = parseInt(formData.get('steps')) || CONFIG.DEFAULT_STEPS;
      width = parseInt(formData.get('width')) || CONFIG.DEFAULT_WIDTH;
      height = parseInt(formData.get('height')) || CONFIG.DEFAULT_HEIGHT;
      seed = formData.get('seed') ? parseInt(formData.get('seed')) : undefined;
      
      // 收集上傳的圖片
      for (let i = 0; i < CONFIG.MAX_INPUT_IMAGES; i++) {
        const img = formData.get(`input_image_${i}`);
        if (img && img instanceof Blob) {
          inputImages.push(img);
        }
      }
    } 
    // 處理 JSON（標準格式）
    else {
      const body = await request.json();
      prompt = body.prompt || body.input;
      steps = body.steps || CONFIG.DEFAULT_STEPS;
      width = body.width || CONFIG.DEFAULT_WIDTH;
      height = body.height || CONFIG.DEFAULT_HEIGHT;
      seed = body.seed;
      
      // 如果有 base64 圖片
      if (body.images && Array.isArray(body.images)) {
        for (const imgData of body.images.slice(0, CONFIG.MAX_INPUT_IMAGES)) {
          if (imgData.startsWith('data:image')) {
            const blob = await dataURLtoBlob(imgData);
            inputImages.push(blob);
          }
        }
      }
    }
    
    if (!prompt) {
      return jsonError('Prompt is required', 400);
    }
    
    // 如果環境中有 AI binding，使用 Workers AI
    if (request.ctx.env && request.ctx.env.AI) {
      return handleWorkersAI(request, prompt, inputImages, { steps, width, height, seed });
    }
    
    // 否則使用 REST API
    return handleRestAPI(request, prompt, inputImages, { steps, width, height, seed });
    
  } catch (e) {
    console.error('Generation error:', e);
    return jsonError(e.message, 500);
  }
}

// 使用 Workers AI Binding
async function handleWorkersAI(request, prompt, inputImages, params) {
  try {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('steps', params.steps.toString());
    form.append('width', params.width.toString());
    form.append('height', params.height.toString());
    if (params.seed) form.append('seed', params.seed.toString());
    
    // 添加參考圖片
    inputImages.forEach((img, i) => {
      form.append(`input_image_${i}`, img);
    });
    
    const result = await request.ctx.env.AI.run(CONFIG.CF_FLUX_MODEL, {
      multipart: {
        body: form,
        contentType: "multipart/form-data"
      }
    });
    
    // 返回 base64 圖片
    return new Response(JSON.stringify({
      id: crypto.randomUUID(),
      object: 'image.generation',
      created: Math.floor(Date.now() / 1000),
      model: CONFIG.CF_FLUX_MODEL,
      data: [{
        b64_json: result,
        prompt: prompt
      }]
    }), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
    
  } catch (e) {
    throw new Error(`Workers AI error: ${e.message}`);
  }
}

// 使用 REST API
async function handleRestAPI(request, prompt, inputImages, params) {
  const { cfToken, cfAccount } = request.ctx;
  
  if (!cfToken || !cfAccount) {
    return jsonError('CF_API_TOKEN and CF_ACCOUNT_ID required for REST API', 500);
  }
  
  try {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('steps', params.steps.toString());
    form.append('width', params.width.toString());
    form.append('height', params.height.toString());
    if (params.seed) form.append('seed', params.seed.toString());
    
    inputImages.forEach((img, i) => {
      form.append(`input_image_${i}`, img);
    });
    
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${CONFIG.CF_FLUX_MODEL}`;
    
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfToken}`
      },
      body: form
    });
    
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Cloudflare API error: ${error}`);
    }
    
    const result = await res.json();
    
    return new Response(JSON.stringify({
      id: crypto.randomUUID(),
      object: 'image.generation',
      created: Math.floor(Date.now() / 1000),
      model: CONFIG.CF_FLUX_MODEL,
      data: [{
        b64_json: result.result?.image || result.image,
        prompt: prompt
      }]
    }), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
    
  } catch (e) {
    throw new Error(`REST API error: ${e.message}`);
  }
}

function handleUI(request) {
  const origin = new URL(request.url).origin;
  const key = request.ctx.apiKey;
  
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
.container{max-width:1200px;margin:40px auto;padding:0 20px;flex:1;display:grid;grid-template-columns:420px 1fr;gap:24px}
.sidebar{background:var(--surface);border-radius:14px;padding:24px;height:fit-content;position:sticky;top:20px}
.main{background:var(--surface);border-radius:14px;padding:24px}
.card{background:var(--card);padding:16px;border-radius:10px;margin-bottom:16px;border:1px solid var(--border)}
.label{display:block;font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text2);text-transform:uppercase}
.input,.textarea,.select{width:100%;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;transition:all .3s}
.input:focus,.textarea:focus,.select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(102,126,234,.1)}
.textarea{min-height:100px;resize:vertical;font-size:14px;line-height:1.6}
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
<div class="subtitle">Powered by Cloudflare Workers AI • FLUX.2 [dev] Model</div>
</div>

<div class="container">
<aside class="sidebar">
<div class="info-box">
<strong>✨ 官方 FLUX.2 特性</strong><br>
• 多參考圖（最多4張）<br>
• 角色一致性保持<br>
• JSON 高級提示詞<br>
• 最大 4MP 輸出
</div>

<div class="card">
<label class="label">📝 提示詞</label>
<textarea class="textarea" id="prompt" placeholder="描述您想要的圖像，或使用 JSON 格式進行精確控制..."></textarea>
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
<div class="size-btn active" data-size="1024x1024" onclick="setSize(1024,1024)">1024×1024</div>
<div class="size-btn" data-size="1024x768" onclick="setSize(1024,768)">1024×768</div>
<div class="size-btn" data-size="768x1024" onclick="setSize(768,1024)">768×1024</div>
<div class="size-btn" data-size="1280x720" onclick="setSize(1280,720)">1280×720</div>
<div class="size-btn" data-size="720x1280" onclick="setSize(720,1280)">720×1280</div>
<div class="size-btn" data-size="1920x1080" onclick="setSize(1920,1080)">1920×1080</div>
</div>
</div>

<div class="card">
<label class="label">⚙️ 生成參數</label>
<div class="slider-group">
<div class="slider-label">
<span>Steps</span>
<span id="steps-value">25</span>
</div>
<input type="range" class="slider" id="steps-slider" min="10" max="50" value="25" oninput="updateValue('steps',this.value)">
</div>
<div class="slider-group">
<div class="slider-label">
<span>Seed (可選)</span>
<span id="seed-value">隨機</span>
</div>
<input type="number" class="input" id="seed-input" placeholder="留空為隨機" style="margin-top:8px" oninput="updateSeed(this.value)">
</div>
</div>

<button class="btn btn-primary" id="gen-btn" onclick="generate()">✨ 生成圖像</button>

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
  result.innerHTML = '';
  
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
    
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + KEY },
      body: form
    });
    
    const data = await res.json();
    
    if (data.error) throw new Error(data.error.message);
    
    if (data.data && data.data[0]) {
      const imgSrc = data.data[0].b64_json ? 
        'data:image/png;base64,' + data.data[0].b64_json :
        data.data[0].url;
      
      result.innerHTML = \`
        <div style="background:var(--card);padding:20px;border-radius:10px;border:1px solid var(--border)">
          <div style="margin-bottom:12px;font-weight:600;color:var(--success)">✅ 生成成功！</div>
          <img src="\${imgSrc}" class="result-image">
          <div style="margin-top:16px">
            <a href="\${imgSrc}" download="flux2-\${Date.now()}.png" style="color:var(--primary);text-decoration:none;font-weight:600">📥 下載圖片</a>
          </div>
        </div>
      \`;
    }
  } catch (e) {
    result.innerHTML = '<div style="padding:20px;background:rgba(239,68,68,.1);border-radius:10px;color:#ef4444">❌ 錯誤：' + e.message + '</div>';
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

// 輔助函數
async function dataURLtoBlob(dataURL) {
  const res = await fetch(dataURL);
  return await res.blob();
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
