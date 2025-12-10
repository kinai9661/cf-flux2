/**
 * =================================================================================
 * 項目: Cloudflare FLUX.2 Workers AI API
 * 版本: 1.0.2
 * 作者: kinai9661
 * 說明: 支持官方 Cloudflare Workers AI FLUX.2 [dev] 模型
 * 博客: https://blog.cloudflare.com/flux-2-workers-ai/
 * =================================================================================
 */

const CONFIG = {
  PROJECT_NAME: "FLUX.2 Workers AI",
  VERSION: "1.0.2",
  API_MASTER_KEY: "1",
  CF_FLUX_MODEL: "@cf/black-forest-labs/flux-1-schnell",
  IMAGE_MODELS: [
    "@cf/black-forest-labs/flux-1-schnell"
  ],
  DEFAULT_STEPS: 4,
  DEFAULT_WIDTH: 1024,
  DEFAULT_HEIGHT: 1024,
  MAX_INPUT_IMAGES: 4
};

export default {
  async fetch(request, env, ctx) {
    try {
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
      
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          version: CONFIG.VERSION,
          ai_binding: !!env.AI,
          model: CONFIG.CF_FLUX_MODEL
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
  } catch (e) {
    console.error('API error:', e);
    return jsonError(`API error: ${e.message}`, 500);
  }
}

async function handleImageGeneration(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let prompt, steps, width, height;
    
    // 處理 multipart/form-data
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      prompt = formData.get('prompt');
      steps = parseInt(formData.get('steps')) || CONFIG.DEFAULT_STEPS;
      width = parseInt(formData.get('width')) || CONFIG.DEFAULT_WIDTH;
      height = parseInt(formData.get('height')) || CONFIG.DEFAULT_HEIGHT;
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
    }
    
    if (!prompt) {
      return jsonError('Prompt is required', 400);
    }
    
    console.log('Generation request:', { prompt: prompt.substring(0, 100), steps, width, height });
    
    // 檢查 AI binding
    if (!request.ctx.env || !request.ctx.env.AI) {
      console.error('AI binding not found');
      return jsonError('AI binding not configured. Please check wrangler.toml', 500);
    }
    
    // 調用 Workers AI
    console.log('Calling Workers AI...');
    const result = await request.ctx.env.AI.run(CONFIG.CF_FLUX_MODEL, {
      prompt: prompt,
      num_steps: steps
    });
    
    console.log('Workers AI response received');
    
    // 返回結果
    return new Response(JSON.stringify({
      id: crypto.randomUUID(),
      object: 'image.generation',
      created: Math.floor(Date.now() / 1000),
      model: CONFIG.CF_FLUX_MODEL,
      data: [{
        b64_json: arrayBufferToBase64(result),
        prompt: prompt
      }]
    }), {
      headers: corsHeaders({ 'Content-Type': 'application/json' })
    });
    
  } catch (e) {
    console.error('Generation error:', e);
    console.error('Error stack:', e.stack);
    return jsonError(`Generation failed: ${e.message}`, 500);
  }
}

function handleUI(request) {
  const origin = new URL(request.url).origin;
  const key = request.ctx.apiKey;
  const hasAI = request.ctx.env && request.ctx.env.AI;
  
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
<div class="status ${hasAI ? 'ok' : 'error'}">AI Binding: ${hasAI ? '✅ Connected' : '❌ Not Found'}</div>
</div>

<div class="container">
<aside class="sidebar">
${hasAI ? '' : '<div class="info-box" style="background:rgba(239,68,68,.1);border-left-color:#ef4444"><strong>⚠️ AI Binding 未配置</strong><br>請檢查 wrangler.toml 配置</div>'}

<div class="info-box">
<strong>✨ FLUX.1 Schnell</strong><br>
• 極速生成（4步）<br>
• 高質量輸出<br>
• 1024×1024 分辨率
</div>

<div class="card">
<label class="label">📝 提示詞</label>
<textarea class="textarea" id="prompt" placeholder="描述您想要的圖像...\n\n示例：A serene Japanese garden with cherry blossoms and a koi pond">A beautiful sunset over mountains</textarea>
</div>

<div class="card">
<label class="label">⚙️ 生成參數</label>
<div class="slider-group">
<div class="slider-label">
<span>Steps（推薦 4）</span>
<span id="steps-value">${CONFIG.DEFAULT_STEPS}</span>
</div>
<input type="range" class="slider" id="steps-slider" min="1" max="8" value="${CONFIG.DEFAULT_STEPS}" oninput="updateValue('steps',this.value)">
</div>
</div>

<button class="btn btn-primary" id="gen-btn" onclick="generate()" ${hasAI ? '' : 'disabled'}>✨ 生成圖像</button>

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
let params = { steps: ${CONFIG.DEFAULT_STEPS} };

function updateValue(key, value) {
  params[key] = parseInt(value);
  document.getElementById(key + '-value').textContent = value;
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
  result.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2)">正在生成圖像，請稍候...</div>';
  
  try {
    console.log('Sending request...');
    const res = await fetch(API, {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        steps: params.steps
      })
    });
    
    console.log('Response status:', res.status);
    
    if (!res.ok) {
      const text = await res.text();
      console.error('Error response:', text);
      throw new Error(`Server error (${res.status}): ${text}`);
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Non-JSON response:', text);
      throw new Error('服務器返回了非 JSON 響應');
    }
    
    const data = await res.json();
    console.log('Response data:', data);
    
    if (data.error) throw new Error(data.error.message);
    
    if (data.data && data.data[0]) {
      const imgSrc = 'data:image/png;base64,' + data.data[0].b64_json;
      
      result.innerHTML = \`
        <div style="background:var(--card);padding:20px;border-radius:10px;border:1px solid var(--border)">
          <div style="margin-bottom:12px;font-weight:600;color:var(--success)">✅ 生成成功！</div>
          <img src="\${imgSrc}" class="result-image">
          <div style="margin-top:16px">
            <a href="\${imgSrc}" download="flux-\${Date.now()}.png" style="color:var(--primary);text-decoration:none;font-weight:600">📥 下載圖片</a>
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

function arrayBufferToBase64(buffer) {
  if (typeof buffer === 'string') return buffer;
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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