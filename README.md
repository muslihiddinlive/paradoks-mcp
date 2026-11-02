# paradoks-mcp

Claude uchun MCP server (62 ta tool): Telegram, GitHub, Cloudflare, Netlify, Render.
Tokenlar har tool chaqiruvida beriladi, serverda SAQLANMAYDI va log qilinmaydi.

## Fayllar
- `mcp.mjs`: sayt (`/`) va MCP server (`/mcp`), bitta fayl
- `netlify.toml`: `[functions] directory = "."`

## Deploy
Repo'ga push qiling, Netlify oʻzi deploy qiladi (Build command va Publish directory boʻsh).
Claude'da connector manzili: `https://SAYT.netlify.app/mcp`

## Tokenlar
- Telegram: BotFather bot tokeni
- GitHub: fine-grained token (Contents: Read and write)
- Cloudflare: API Token (Workers Scripts: Edit)
- Netlify: Personal access token
- Render: API key

## Xavfsizlik
O'chirish (DELETE) va pullik amallar `confirm: true` talab qiladi.
Ishlatib bo'lgach tokenlarni revoke qiling.

## Ma'lum chegaralar
- Netlify'ga API orqali faqat statik fayllar deploy qilinadi. Netlify Functions uchun GitHub repo orqali deploy qiling.
- Binary fayllar (rasm) GitHub/Netlify/Cloudflare tool'larida yo'q, faqat matn.
- Render servis yaratish tanasi plan/runtime'ga qarab farq qilishi mumkin: xato chiqsa `extra` yoki `rd_api` ishlating.
