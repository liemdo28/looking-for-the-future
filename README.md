# Looking for the Future

Dashboard tối giản để theo dõi job match CV của Vân Cù (Cindy).

## Tính năng

- Bảng job match theo score từ 50%.
- Button hành động cho từng job: Đã nộp, Từ chối, Ưa thích.
- Tab tương ứng: Tất cả, Đã nộp, Từ chối, Ưa thích, Mới.
- Lưu trạng thái trên trình duyệt bằng `localStorage`.
- Tự sync mỗi 1 giờ và có nút Sync ngay.
- Cloudflare Pages Functions sẵn sàng nhận job mới qua `JOB_SEARCH_ENDPOINT` và lưu action qua KV nếu cấu hình `JOB_ACTIONS_KV`.
- Source pool nằm trong `data/sources.json`, gồm job boards, freelance, headhunter, company careers và startup sources.

## Chạy local

```bash
npm install
npm run start
```

## Build Cloudflare Pages

```bash
npm run build
```

Cloudflare Pages Git settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Deploy command: leave empty, or use `npm run deploy` only for manual CLI deploys.

## Deploy Cloudflare Pages

```bash
npm run deploy
```

## Deploy Workers Static Assets

Use this only if you want the `workers.dev` URL to serve the same dashboard:

```bash
npm run deploy:worker
```

Worker deploy uses `wrangler.worker.toml`; Pages deploy uses `wrangler.toml`.

Nếu muốn tự động tìm job mới bằng backend, cấu hình biến môi trường `JOB_SEARCH_ENDPOINT` trả JSON dạng:

```json
{
  "jobs": [
    {
      "id": "unique-job-id",
      "rank": 1,
      "score": 82,
      "title": "Sales Operations Specialist",
      "company": "Company",
      "location": "Ho Chi Minh City",
      "workMode": "Hybrid",
      "openStatus": "Apply visible",
      "source": "Company Careers",
      "url": "https://example.com/job",
      "summary": "Short summary",
      "match": ["Reason 1"],
      "risks": ["Risk 1"],
      "applicationAngle": "How to apply",
      "isNew": true
    }
  ]
}
```
