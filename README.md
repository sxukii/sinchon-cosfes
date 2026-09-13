# 신코 참가자 사이트

Cloudflare Workers + D1 + R2 + GitHub로 운영하는 참가자 게시판

## 기능

- 닉네임 / X 계정 등록
- 코스어 / 카메라 / 일반 선택
- 26일 / 27일 선택
- 오전 / 오후 / 저녁 선택
- 장르 / 캐릭터
- 한마디
- JPG / PNG / WEBP 이미지 업로드
- 26일 / 27일 필터
- 참여 방식 필터
- 시간대 필터
- 장르 / 캐릭터 검색

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