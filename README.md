# 신코 참가자 사이트

Cloudflare Workers + D1 + R2 + GitHub로 운영하는 참가자 게시판


## 폴더

- `public/` : 웹사이트
- `public/index.html` : 화면
- `public/style.css` : 디자인
- `public/script.js` : 게시물 조회/등록
- `src/index.js` : Cloudflare Worker API
- `schema.sql` : D1 테이블
- `wrangler.jsonc` : Cloudflare 설정

## Cloudflare 설정

1. D1 Database 생성
2. R2 Bucket 생성
3. D1 ID를 `wrangler.jsonc`에 입력
4. D1에서 `schema.sql` 실행
5. GitHub 저장소를 Cloudflare Workers에 연결
6. 배포