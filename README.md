# 🎨 Cloudflare FLUX.2 Workers AI API

> 基於 Cloudflare Workers AI 的 FLUX.2 [dev] 圖像生成 API，使用 REST API 調用，支持多圖輸入、角色一致性和 JSON 高級提示詞控制。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kinai9661/cf-flux2)

## ✨ 特性

- 🚀 **REST API 調用**：使用官方 Cloudflare API 調用 FLUX.2 [dev] 模型
- 🖼️ **多圖輸入**：支持最多 4 張參考圖片，實現角色/產品一致性
- 📝 **JSON Prompting**：支持結構化 JSON 提示詞進行精確控制
- 🎯 **靈活尺寸**：支持最大 4MP 輸出（如 2048×2048、1920×1080 等）
- 🎨 **現代化 UI**：美觀的深色主題 Web 界面
- 🔌 **API 兼容**：兼容 OpenAI 圖像生成 API 格式
- ⚡ **極速部署**：一鍵部署到 Cloudflare Workers
- 🔒 **安全可靠**：API Key 驗證保護
- 📊 **健康檢查**：內置 `/health` 端點監控狀態

## 🚀 快速開始

### 前置要求

1. **Cloudflare 賬戶**（免費即可）
2. **Cloudflare API Token**
3. **Cloudflare Account ID**

### 步驟 1：獲取 Cloudflare 憑證

#### 1.1 獲取 Account ID

1. 登錄 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 選擇任意網站/域名（如果沒有，可以添加一個免費域名）
3. 在頁面右側欄找到 **"Account ID"**
4. 點擊複製（格式類似：`a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`）

![Account ID 位置](https://developers.cloudflare.com/assets/account-id-workers-dashboard_hu4ca67852fb6e50c49bfaaae951c7e6a7_187167_1252x376_resize_q75_box-1729113493.jpg)

#### 1.2 創建 API Token

1. 登錄 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 點擊右上角頭像 → **My Profile**
3. 選擇左側 **API Tokens** 標籤
4. 點擊 **Create Token**
5. 選擇 **"Edit Cloudflare Workers"** 模板
6. 或創建自定義 Token，確保權限包含：
   - `Account.Workers AI:Read`
   - `Account.Workers Scripts:Edit`
7. 點擊 **Continue to summary** → **Create Token**
8. **立即複製 Token**（只會顯示一次！）

### 步驟 2：部署到 Cloudflare Workers

#### 方法 A：通過 Cloudflare Dashboard（推薦，無需本地環境）

1. **Fork 本倉庫**到您的 GitHub 賬戶

2. **連接 GitHub**：
   - 登錄 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 進入 **Workers & Pages**
   - 點擊 **Create application** → **Pages** → **Connect to Git**
   - 授權並選擇 `cf-flux2` 倉庫

3. **配置環境變量**：
   - 在部署設置頁面，找到 **Environment variables**
   - 添加以下變量：

   ```
   CF_API_TOKEN = 粘貼您的 Cloudflare API Token
   ACCOUNT = 粘貼您的 Account ID
   API_MASTER_KEY = 自定義密鑰（如：my-secret-key-123）
   ```

4. **部署**：
   - 點擊 **Save and Deploy**
   - 等待部署完成

5. **訪問**：
   - 部署成功後，訪問分配的 Workers 域名

#### 方法 B：本地部署（需要 Node.js）

```bash
# 1. 克隆倉庫
git clone https://github.com/kinai9661/cf-flux2.git
cd cf-flux2

# 2. 安裝 Wrangler CLI
npm install -g wrangler

# 3. 登錄 Cloudflare
wrangler login

# 4. 創建 .dev.vars 文件（不要提交到 Git）
cat > .dev.vars << EOF
CF_API_TOKEN=你的API_Token
ACCOUNT=你的Account_ID
API_MASTER_KEY=自定義密鑰
EOF

# 5. 部署
wrangler deploy
```

### 步驟 3：配置環境變量（如果使用 Workers）

如果直接部署為 Worker（而非 Pages）：

1. 進入 **Workers & Pages** → 選擇您的 Worker
2. 點擊 **Settings** → **Variables**
3. 添加環境變量：
   - `CF_API_TOKEN`：您的 Cloudflare API Token
   - `ACCOUNT`：您的 Account ID
   - `API_MASTER_KEY`：自定義 API 密鑰
4. 點擊 **Save and deploy**

## 📖 使用指南

### Web UI 界面

訪問您的 Workers 域名，即可看到現代化的 Web 界面：

1. **配置狀態指示器**
   - ✅ 綠色：環境變量已正確配置
   - ❌ 紅色：缺少必需的環境變量

2. **輸入提示詞**
   - 支持純文本描述
   - 支持 JSON 格式高級控制

3. **上傳參考圖片**（可選）
   - 拖拽或點擊上傳
   - 最多 4 張圖片
   - 保持角色/產品一致性

4. **選擇圖片尺寸**
   - 預設多種常用尺寸
   - 1024×1024 到 1920×1080

5. **調整生成參數**
   - Steps：推薦 25（範圍 10-50）
   - Seed：可選，固定結果用

6. **生成與下載**
   - 點擊生成按鈕
   - 完成後可直接下載

### API 調用示例

#### 基礎文本生成

```bash
curl https://your-worker.workers.dev/v1/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene Japanese garden with cherry blossoms",
    "steps": 25,
    "width": 1024,
    "height": 1024
  }'
```

#### 帶參考圖片（multipart/form-data）

```bash
curl https://your-worker.workers.dev/v1/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -F "prompt=A cyberpunk portrait of the person in the image" \
  -F "input_image_0=@reference.jpg" \
  -F "steps=30" \
  -F "width=1024" \
  -F "height=1024"
```

#### Python 示例

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

## 🔧 配置說明

### 環境變量

| 變量 | 必需 | 說明 | 獲取方式 |
|------|------|------|----------|
| `CF_API_TOKEN` | ✅ 是 | Cloudflare API Token | Dashboard → Profile → API Tokens → Create Token |
| `ACCOUNT` | ✅ 是 | Cloudflare Account ID | Dashboard → 任意網站 → 右側欄 Account ID |
| `API_MASTER_KEY` | ✅ 是 | API 訪問密鑰 | 自定義設置 |

### wrangler.toml 示例

```toml
name = "flux2-workers-ai"
main = "worker.js"
compatibility_date = "2024-12-10"

[vars]
API_MASTER_KEY = "your-secret-key-here"
CF_API_TOKEN = "your-cloudflare-api-token"
ACCOUNT = "your-cloudflare-account-id"
```

⚠️ **安全提示**：
- 不要在 `wrangler.toml` 中直接寫入真實的 Token 和 Account ID
- 使用 Cloudflare Dashboard 的環境變量功能
- 或使用 `.dev.vars` 文件（本地開發，不提交到 Git）

### 健康檢查

訪問 `/health` 端點查看配置狀態：

```bash
curl https://your-worker.workers.dev/health
```

響應示例：
```json
{
  "status": "ok",
  "version": "1.1.0",
  "mode": "REST API",
  "model": "@cf/black-forest-labs/flux-2-dev",
  "account_configured": true,
  "token_configured": true
}
```

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
      "prompt": "A serene Japanese garden with cherry blossoms",
      "revised_prompt": "A serene Japanese garden with cherry blossoms"
    }
  ]
}
```

### 錯誤響應

```json
{
  "error": {
    "message": "CF_API_TOKEN environment variable is required",
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

- **REST API**：直接調用 Cloudflare API，穩定可靠
- **適當尺寸**：根據需求選擇合適尺寸，避免過大
- **批量處理**：使用異步處理多個請求
- **緩存結果**：相同參數可緩存結果

## 🔧 故障排除

### 常見問題

**Q: 部署失敗提示 "AI binding not found"**  
A: 本項目使用 REST API 模式，不需要 AI Binding。確保配置了 `CF_API_TOKEN` 和 `ACCOUNT` 環境變量。

**Q: 錯誤 "Could not route to /client/v4/accounts/..."**  
A: 檢查：
- `ACCOUNT` 環境變量是否設置為真實的 Account ID
- `CF_API_TOKEN` 是否有效
- API Token 權限是否包含 `Account.Workers AI:Read`

**Q: 圖片生成失敗**  
A: 檢查：
- 訪問 `/health` 端點查看配置狀態
- 查看瀏覽器控制台的詳細錯誤信息
- 確認參數在有效範圍內
- 參考圖片大小是否合理（建議 < 5MB）

**Q: 生成速度慢**  
A: 
- FLUX.2 模型較大，首次生成需要加載時間
- 減少 steps 參數（推薦 20-30）
- 降低圖片分辨率
- 檢查網絡連接

## 📚 相關資源

- [Cloudflare Workers AI 文檔](https://developers.cloudflare.com/workers-ai/)
- [FLUX.2 官方博客](https://blog.cloudflare.com/flux-2-workers-ai/)
- [Wrangler CLI 文檔](https://developers.cloudflare.com/workers/wrangler/)
- [FLUX 模型介紹](https://blackforestlabs.ai/)
- [Cloudflare API 文檔](https://developers.cloudflare.com/api/)

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

## 🎉 更新日誌

### v1.1.0 (2024-12-10)
- ✅ 切換到 REST API 模式
- ✅ 使用 FLUX.2 [dev] 模型
- ✅ 支持多圖輸入（最多 4 張）
- ✅ 添加健康檢查端點
- ✅ 完善錯誤處理和日誌
- ✅ 詳細的配置文檔

---

<div align="center">
  <sub>Built with ❤️ by kinai9661</sub>
</div>