# 🎨 Cloudflare FLUX.2 Workers AI API

> 基於 Cloudflare Workers AI 的 FLUX.2 [dev] 圖像生成 API，支持多圖輸入、角色一致性和 JSON 高級提示詞控制。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kinai9661/cf-flux2)

## ✨ 特性

- 🚀 **雙模式部署**：支持 AI Binding 和 REST API 兩種方式
- 🖼️ **多圖輸入**：支持最多 4 張參考圖片，實現角色/產品一致性
- 📝 **JSON Prompting**：支持結構化 JSON 提示詞進行精確控制
- 🎯 **靈活尺寸**：支持最大 4MP 輸出（如 2048×2048、1920×1080 等）
- 🎨 **現代化 UI**：美觀的深色主題 Web 界面
- 🔌 **API 兼容**：兼容 OpenAI 圖像生成 API 格式
- ⚡ **極速部署**：一鍵部署到 Cloudflare Workers
- 🔒 **安全可靠**：API Key 驗證保護

## 🚀 快速開始

### 方式 1：AI Binding（推薦）

**優點**：無需 API Token，開箱即用，性能最佳

```bash
# 1. 克隆項目
git clone https://github.com/kinai9661/cf-flux2.git
cd cf-flux2

# 2. 安裝 Wrangler CLI
npm install -g wrangler

# 3. 登錄 Cloudflare
wrangler login

# 4. 編輯 wrangler.toml，修改 API_MASTER_KEY
# API_MASTER_KEY = "your-secret-key-here"

# 5. 部署
wrangler deploy
```

### 方式 2：REST API

**適用場景**：需要更靈活的 API 調用

1. 在 `wrangler.toml` 中添加環境變量：

```toml
[vars]
API_MASTER_KEY = "your-secret-key"
CF_API_TOKEN = "your-cloudflare-api-token"
CF_ACCOUNT_ID = "your-cloudflare-account-id"
```

2. 註釋掉或刪除 `[[ai]]` 配置
3. 運行 `wrangler deploy`

## 📖 使用指南

### Web UI 界面

部署後訪問您的 Workers 域名，即可看到現代化的 Web 界面：

- 📝 輸入提示詞（支持 JSON 格式）
- 🖼️ 上傳最多 4 張參考圖片
- 📐 選擇圖片尺寸（1024×1024、1920×1080 等）
- ⚙️ 調整生成參數（Steps、Seed）
- ✨ 一鍵生成和下載

### API 調用示例

#### cURL

```bash
# 基礎文本生成
curl https://your-worker.workers.dev/v1/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene Japanese garden with cherry blossoms",
    "steps": 25,
    "width": 1024,
    "height": 1024
  }'

# 帶參考圖片（multipart/form-data）
curl https://your-worker.workers.dev/v1/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -F "prompt=A cyberpunk portrait of the person in the image" \
  -F "input_image_0=@reference.jpg" \
  -F "steps=30" \
  -F "width=1024" \
  -F "height=1024"
```

#### Python

```python
import requests
import base64

url = "https://your-worker.workers.dev/v1/images/generations"
headers = {
    "Authorization": "Bearer your-api-key",
    "Content-Type": "application/json"
}

# JSON Prompting 示例
payload = {
    "prompt": {
        "scene": "futuristic city",
        "subjects": [{
            "type": "robot",
            "pose": "standing",
            "expression": "friendly"
        }],
        "style": "cyberpunk digital art",
        "lighting": "neon lights",
        "color_palette": ["#667eea", "#f5576c", "#00d4ff"]
    },
    "steps": 25,
    "width": 1920,
    "height": 1080
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()

if data.get("data"):
    # 保存 base64 圖片
    img_base64 = data["data"][0]["b64_json"]
    with open("output.png", "wb") as f:
        f.write(base64.b64decode(img_base64))
    print("✅ 圖片已保存為 output.png")
```

#### JavaScript (Node.js)

```javascript
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const url = 'https://your-worker.workers.dev/v1/images/generations';
const apiKey = 'your-api-key';

// 帶參考圖片的生成
const form = new FormData();
form.append('prompt', 'Portrait of the person in cyberpunk style');
form.append('input_image_0', fs.createReadStream('reference.jpg'));
form.append('steps', '30');
form.append('width', '1024');
form.append('height', '1024');

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    ...form.getHeaders()
  },
  body: form
});

const data = await response.json();
console.log('✅ 生成成功！', data);
```

## 🎯 高級功能

### JSON 結構化提示詞

FLUX.2 支持結構化 JSON 提示詞進行更精確的控制：

```json
{
  "prompt": {
    "scene": "modern office",
    "subjects": [
      {
        "type": "person",
        "appearance": "professional businessman",
        "pose": "sitting at desk",
        "clothing": "navy blue suit"
      }
    ],
    "environment": {
      "location": "corner office",
      "time_of_day": "golden hour",
      "weather": "clear sky visible through window"
    },
    "style": "photorealistic",
    "mood": "confident and focused",
    "color_palette": ["#2c3e50", "#ecf0f1", "#f39c12"],
    "composition": "rule of thirds",
    "camera": {
      "angle": "eye level",
      "lens": "35mm",
      "depth_of_field": "shallow"
    }
  },
  "steps": 30,
  "width": 1920,
  "height": 1080,
  "seed": 42
}
```

### 多圖輸入（角色一致性）

上傳多張參考圖片，保持角色/產品一致性：

```bash
curl https://your-worker.workers.dev/v1/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -F "prompt=The character in different poses: standing, sitting, running" \
  -F "input_image_0=@character_front.jpg" \
  -F "input_image_1=@character_side.jpg" \
  -F "input_image_2=@character_back.jpg" \
  -F "steps=35" \
  -F "width=1536" \
  -F "height=1024"
```

### 支持的圖片尺寸

| 尺寸 | 比例 | 適用場景 |
|------|------|----------|
| 1024×1024 | 1:1 | 頭像、社交媒體 |
| 1024×768 | 4:3 | 標準照片 |
| 768×1024 | 3:4 | 豎版海報 |
| 1280×720 | 16:9 | 視頻縮略圖 |
| 1536×1024 | 3:2 | 寬屏照片 |
| 1920×1080 | 16:9 | 高清壁紙 |
| 2048×2048 | 1:1 | 高分辨率輸出 |

## ⚙️ 配置說明

### wrangler.toml

```toml
name = "flux2-workers-ai"
main = "worker.js"
compatibility_date = "2024-12-10"

[vars]
API_MASTER_KEY = "your-secret-key-here"

# 方式 1：AI Binding（推薦）
[[ai]]
binding = "AI"

# 方式 2：REST API（可選）
# CF_API_TOKEN = "your-cloudflare-api-token"
# CF_ACCOUNT_ID = "your-cloudflare-account-id"
```

### 環境變量

| 變量 | 必需 | 說明 |
|------|------|------|
| `API_MASTER_KEY` | 是 | API 訪問密鑰 |
| `CF_API_TOKEN` | 否* | Cloudflare API Token（REST API 模式） |
| `CF_ACCOUNT_ID` | 否* | Cloudflare Account ID（REST API 模式） |

*僅在不使用 AI Binding 時需要

## 📊 API 響應格式

### 成功響應

```json
{
  "id": "gen_1234567890",
  "object": "image.generation",
  "created": 1702234567,
  "model": "@cf/black-forest-labs/flux-2-dev",
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA...",
      "prompt": "A serene Japanese garden with cherry blossoms"
    }
  ]
}
```

### 錯誤響應

```json
{
  "error": {
    "message": "Prompt is required",
    "type": "api_error"
  }
}
```

## 🌟 最佳實踐

### 提示詞優化

1. **清晰具體**：描述具體細節而非抽象概念
   - ❌ "A nice landscape"
   - ✅ "A misty mountain valley at sunrise with pine trees and a river"

2. **使用 JSON 結構**：對於複雜場景使用 JSON 格式
3. **參考圖片**：上傳參考圖保持風格一致
4. **調整 Steps**：
   - 快速預覽：10-15 steps
   - 標準質量：20-30 steps
   - 高質量：35-50 steps

### 性能優化

- **AI Binding**：比 REST API 快 20-30%
- **適當尺寸**：根據需求選擇合適尺寸，避免過大
- **批量處理**：使用異步處理多個請求

## 🔧 故障排除

### 常見問題

**Q: 部署失敗提示 "AI binding not found"**  
A: 確保 `wrangler.toml` 中有 `[[ai]]` 配置，或配置 REST API 參數

**Q: 圖片生成失敗**  
A: 檢查：
- API Key 是否正確
- 參數是否在有效範圍內
- 參考圖片大小是否合理（建議 < 5MB）

**Q: 生成速度慢**  
A: 
- 使用 AI Binding 而非 REST API
- 減少 steps 參數
- 降低圖片分辨率

## 📚 相關資源

- [Cloudflare Workers AI 文檔](https://developers.cloudflare.com/workers-ai/)
- [FLUX.2 官方博客](https://blog.cloudflare.com/flux-2-workers-ai/)
- [Wrangler CLI 文檔](https://developers.cloudflare.com/workers/wrangler/)
- [FLUX 模型介紹](https://blackforestlabs.ai/)

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

1. Fork 本項目
2. 創建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 📄 開源協議

MIT License - 詳見 [LICENSE](LICENSE) 文件

## 👤 作者

**kinai9661**

- GitHub: [@kinai9661](https://github.com/kinai9661)
- 項目主頁: [cf-flux2](https://github.com/kinai9661/cf-flux2)

## ⭐ Star History

如果這個項目對您有幫助，請給個 Star ⭐️

---

<div align="center">
  <sub>Built with ❤️ by kinai9661</sub>
</div>