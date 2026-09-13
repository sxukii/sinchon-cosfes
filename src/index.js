const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_CATEGORIES = new Set(["코스어", "카메라", "일반"]);
const ALLOWED_DAYS = new Set(["26", "27"]);
const ALLOWED_TIMES = new Set(["오전", "오후", "저녁"]);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/posts" && request.method === "GET") {
      return getPosts(env);
    }

    if (url.pathname === "/api/posts" && request.method === "POST") {
      return createPost(request, env);
    }

    if (url.pathname.startsWith("/api/images/") && request.method === "GET") {
      return getImage(url, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function getPosts(env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      nickname,
      x_account,
      category,
      days,
      times,
      genre,
      message,
      image_key,
      created_at
    FROM participants
    ORDER BY created_at DESC
  `).all();

  const posts = result.results.map((row) => ({
    id: row.id,
    nickname: row.nickname,
    xAccount: row.x_account || "",
    category: row.category,
    days: safeJsonArray(row.days),
    times: safeJsonArray(row.times),
    genre: row.genre || "",
    message: row.message || "",
    imageUrl: row.image_key
      ? `/api/images/${encodeURIComponent(row.image_key)}`
      : "",
    createdAt: row.created_at
  }));

  return json(posts);
}

async function createPost(request, env) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json({ error: "multipart/form-data 형식이 필요합니다." }, 400);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_SIZE + 100_000) {
    return json({ error: "업로드 요청이 너무 큽니다. 이미지는 5MB 이하로 올려주세요." }, 413);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "게시물 데이터를 읽지 못했습니다." }, 400);
  }

  const nickname = cleanText(form.get("nickname"), 20);
  const xAccount = cleanText(form.get("xAccount"), 30).replace(/^@+/, "");
  const category = cleanText(form.get("category"), 10);
  const genre = cleanText(form.get("genre"), 80);
  const message = cleanText(form.get("message"), 120);

  const days = parseJsonArray(form.get("days"));
  const times = parseJsonArray(form.get("times"));

  if (!nickname) {
    return json({ error: "닉네임을 입력해주세요." }, 400);
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    return json({ error: "참여 방식을 확인해주세요." }, 400);
  }

  if (!days.length || days.some((day) => !ALLOWED_DAYS.has(day))) {
    return json({ error: "참가 날짜를 확인해주세요." }, 400);
  }

  if (days.length > 2) {
    return json({ error: "참가 날짜를 확인해주세요." }, 400);
  }

  if (times.some((time) => !ALLOWED_TIMES.has(time))) {
    return json({ error: "시간대를 확인해주세요." }, 400);
  }

  const image = form.get("image");
  let imageKey = "";

  if (image && typeof image === "object" && "arrayBuffer" in image) {
    if (image.size > MAX_IMAGE_SIZE) {
      return json({ error: "이미지는 5MB 이하만 업로드할 수 있어요." }, 413);
    }

    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      return json({ error: "JPG, PNG, WEBP 이미지만 업로드할 수 있어요." }, 415);
    }

    const extension = getExtension(image.type);
    const id = crypto.randomUUID();
    imageKey = `images/${id}.${extension}`;

    await env.IMAGES.put(imageKey, image.stream(), {
      httpMetadata: {
        contentType: image.type,
        cacheControl: "public, max-age=31536000, immutable"
      }
    });

    const createdAt = Date.now();

    try {
      await env.DB.prepare(`
        INSERT INTO participants
        (id, nickname, x_account, category, days, times, genre, message, image_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        nickname,
        xAccount,
        category,
        JSON.stringify(days),
        JSON.stringify(times),
        genre,
        message,
        imageKey,
        createdAt
      ).run();
    } catch (error) {
      await env.IMAGES.delete(imageKey);
      console.error(error);
      return json({ error: "게시물 저장에 실패했습니다." }, 500);
    }

    return json({
      ok: true,
      id,
      message: "게시물이 등록되었습니다."
    }, 201);
  }

  const id = crypto.randomUUID();
  const createdAt = Date.now();

  try {
    await env.DB.prepare(`
      INSERT INTO participants
      (id, nickname, x_account, category, days, times, genre, message, image_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      nickname,
      xAccount,
      category,
      JSON.stringify(days),
      JSON.stringify(times),
      genre,
      message,
      "",
      createdAt
    ).run();
  } catch (error) {
    console.error(error);
    return json({ error: "게시물 저장에 실패했습니다." }, 500);
  }

  return json({
    ok: true,
    id,
    message: "게시물이 등록되었습니다."
  }, 201);
}

async function getImage(url, env) {
  const key = decodeURIComponent(url.pathname.slice("/api/images/".length));

  if (!key.startsWith("images/") || key.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.IMAGES.get(key);

  if (!object) {
    return new Response("Image not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, {
    headers
  });
}

function parseJsonArray(value) {
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonArray(value) {
  return parseJsonArray(value);
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function getExtension(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}
