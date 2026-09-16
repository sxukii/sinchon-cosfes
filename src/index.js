const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_CATEGORIES = new Set(["코스어", "카메라", "일반"]);
const ALLOWED_DAYS = new Set(["26", "27"]);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 게시물 목록 조회
    if (url.pathname === "/api/posts" && request.method === "GET") {
      return getPosts(env);
    }

    // 게시물 등록
    if (url.pathname === "/api/posts" && request.method === "POST") {
      return createPost(request, env);
    }

    // 게시물 삭제
    if (
      url.pathname.startsWith("/api/posts/") &&
      request.method === "DELETE"
    ) {
      const id = decodeURIComponent(
        url.pathname.slice("/api/posts/".length)
      );

      return deletePost(request, env, id);
    }

    // 이미지 조회
    if (url.pathname.startsWith("/api/images/") && request.method === "GET") {
      return getImage(url, env);
    }

    return env.ASSETS.fetch(request);
  }
};


// ========================================
// 게시물 목록 조회
// ========================================

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

    // 기존 days 배열
    days: safeJsonArray(row.days),

    // 새 형식:
    // {
    //   "26": "14:30",
    //   "27": "11:00"
    // }
    dayTimes: safeJsonObject(row.times),

    genre: row.genre || "",
    message: row.message || "",

    imageUrl: row.image_key
      ? `/api/images/${encodeURIComponent(row.image_key)}`
      : "",

    createdAt: row.created_at
  }));

  return json(posts);
}


// ========================================
// 게시물 등록
// ========================================

async function createPost(request, env) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json(
      {
        error: "multipart/form-data 형식이 필요합니다."
      },
      400
    );
  }

  const contentLength = Number(
    request.headers.get("content-length") || 0
  );

  if (contentLength > MAX_IMAGE_SIZE + 100_000) {
    return json(
      {
        error:
          "업로드 요청이 너무 큽니다. 이미지는 5MB 이하로 올려주세요."
      },
      413
    );
  }

  let form;

  try {
    form = await request.formData();
  } catch {
    return json(
      {
        error: "게시물 데이터를 읽지 못했습니다."
      },
      400
    );
  }

  const nickname = cleanText(form.get("nickname"), 20);

  const xAccount = cleanText(
    form.get("xAccount"),
    30
  ).replace(/^@+/, "");

  const category = cleanText(
    form.get("category"),
    10
  );

  const genre = cleanText(
    form.get("genre"),
    80
  );

  const message = cleanText(
    form.get("message"),
    120
  );

  /*
    days 예시:
    ["26", "27"]

    dayTimes 예시:
    {
      "26": "14:30",
      "27": "11:00"
    }
  */
  const days = parseJsonArray(form.get("days"));
  const dayTimes = parseJsonObject(form.get("dayTimes"));

  // 삭제 비밀번호
  const deletePassword = cleanText(
    form.get("deletePassword"),
    4
  );

  // -----------------------------
  // 기본값 검증
  // -----------------------------

  if (!nickname) {
    return json(
      {
        error: "닉네임을 입력해주세요."
      },
      400
    );
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    return json(
      {
        error: "참여 방식을 확인해주세요."
      },
      400
    );
  }

  if (
    !days.length ||
    days.length > 2 ||
    days.some((day) => !ALLOWED_DAYS.has(day))
  ) {
    return json(
      {
        error: "참가 날짜를 확인해주세요."
      },
      400
    );
  }

  // -----------------------------
  // 날짜별 시간 검증
  // -----------------------------

  for (const day of days) {
    const time = dayTimes[day];

    // 시간을 입력하지 않은 경우 허용
    if (!time) {
      continue;
    }

    // HH:MM 형식인지 확인
    if (!isValidTime(time)) {
      return json(
        {
          error: `${day}일의 시간을 확인해주세요.`
        },
        400
      );
    }
  }

  // 선택하지 않은 날짜에 시간이 들어있는 경우 제거
  for (const key of Object.keys(dayTimes)) {
    if (!days.includes(key)) {
      delete dayTimes[key];
    }
  }

  // -----------------------------
  // 삭제 비밀번호 검증
  // -----------------------------

  if (!/^\d{4}$/.test(deletePassword)) {
    return json(
      {
        error: "삭제 비밀번호는 숫자 4자리로 입력해주세요."
      },
      400
    );
  }

  // 비밀번호는 평문 대신 SHA-256 해시로 저장
  const deletePasswordHash = await hashPassword(
    deletePassword
  );

  // -----------------------------
  // 이미지 처리
  // -----------------------------

  const image = form.get("image");

  let imageKey = "";

  if (
    image &&
    typeof image === "object" &&
    "arrayBuffer" in image
  ) {
    if (image.size > MAX_IMAGE_SIZE) {
      return json(
        {
          error:
            "이미지는 5MB 이하만 업로드할 수 있어요."
        },
        413
      );
    }

    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      return json(
        {
          error:
            "JPG, PNG, WEBP 이미지만 업로드할 수 있어요."
        },
        415
      );
    }

    const extension = getExtension(image.type);

    const id = crypto.randomUUID();

    imageKey = `images/${id}.${extension}`;

    try {
      await env.IMAGES.put(
        imageKey,
        image.stream(),
        {
          httpMetadata: {
            contentType: image.type,
            cacheControl:
              "public, max-age=31536000, immutable"
          }
        }
      );
    } catch (error) {
      console.error(error);

      return json(
        {
          error: "이미지 업로드에 실패했습니다."
        },
        500
      );
    }

    const createdAt = Date.now();

    try {
      await env.DB.prepare(`
        INSERT INTO participants
        (
          id,
          nickname,
          x_account,
          category,
          days,
          times,
          genre,
          message,
          image_key,
          delete_password,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        nickname,
        xAccount,
        category,
        JSON.stringify(days),
        JSON.stringify(dayTimes),
        genre,
        message,
        imageKey,
        deletePasswordHash,
        createdAt
      ).run();
    } catch (error) {
      // D1 저장 실패하면 업로드한 이미지도 삭제
      await env.IMAGES.delete(imageKey);

      console.error(error);

      return json(
        {
          error: "게시물 저장에 실패했습니다."
        },
        500
      );
    }

    return json(
      {
        ok: true,
        id,
        message: "게시물이 등록되었습니다."
      },
      201
    );
  }

  // -----------------------------
  // 이미지 없는 게시물
  // -----------------------------

  const id = crypto.randomUUID();
  const createdAt = Date.now();

  try {
    await env.DB.prepare(`
      INSERT INTO participants
      (
        id,
        nickname,
        x_account,
        category,
        days,
        times,
        genre,
        message,
        image_key,
        delete_password,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      nickname,
      xAccount,
      category,
      JSON.stringify(days),
      JSON.stringify(dayTimes),
      genre,
      message,
      "",
      deletePasswordHash,
      createdAt
    ).run();
  } catch (error) {
    console.error(error);

    return json(
      {
        error: "게시물 저장에 실패했습니다."
      },
      500
    );
  }

  return json(
    {
      ok: true,
      id,
      message: "게시물이 등록되었습니다."
    },
    201
  );
}


// ========================================
// 게시물 삭제
// ========================================

async function deletePost(request, env, id) {
  if (!id) {
    return json(
      {
        error: "게시물 ID가 없습니다."
      },
      400
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        error: "삭제 요청을 읽지 못했습니다."
      },
      400
    );
  }

  const password = cleanText(
    body?.password,
    4
  );

  if (!/^\d{4}$/.test(password)) {
    return json(
      {
        error: "삭제 비밀번호는 숫자 4자리여야 합니다."
      },
      400
    );
  }

  // 게시물 조회
  const result = await env.DB.prepare(`
    SELECT
      id,
      image_key,
      delete_password
    FROM participants
    WHERE id = ?
    LIMIT 1
  `).bind(id).first();

  if (!result) {
    return json(
      {
        error: "게시물을 찾을 수 없습니다."
      },
      404
    );
  }

  // 비밀번호 해시 비교
  const passwordHash = await hashPassword(password);

  if (
    !result.delete_password ||
    passwordHash !== result.delete_password
  ) {
    return json(
      {
        error: "삭제 비밀번호가 올바르지 않습니다."
      },
      403
    );
  }

  // -----------------------------
  // DB에서 게시물 삭제
  // -----------------------------

  try {
    await env.DB.prepare(`
      DELETE FROM participants
      WHERE id = ?
    `).bind(id).run();
  } catch (error) {
    console.error(error);

    return json(
      {
        error: "게시물 삭제에 실패했습니다."
      },
      500
    );
  }

  // -----------------------------
  // R2 이미지 삭제
  // -----------------------------

  if (result.image_key) {
    try {
      await env.IMAGES.delete(result.image_key);
    } catch (error) {
      // 게시물 자체는 이미 삭제되었으므로
      // 이미지 삭제 실패는 로그만 남김
      console.error(
        "R2 이미지 삭제 실패:",
        error
      );
    }
  }

  return json({
    ok: true,
    message: "게시물이 삭제되었습니다."
  });
}


// ========================================
// 이미지 조회
// ========================================

async function getImage(url, env) {
  const key = decodeURIComponent(
    url.pathname.slice("/api/images/".length)
  );

  if (
    !key.startsWith("images/") ||
    key.includes("..")
  ) {
    return new Response(
      "Not found",
      {
        status: 404
      }
    );
  }

  const object = await env.IMAGES.get(key);

  if (!object) {
    return new Response(
      "Image not found",
      {
        status: 404
      }
    );
  }

  const headers = new Headers();

  object.writeHttpMetadata(headers);

  headers.set(
    "etag",
    object.httpEtag
  );

  headers.set(
    "cache-control",
    "public, max-age=31536000, immutable"
  );

  return new Response(
    object.body,
    {
      headers
    }
  );
}


// ========================================
// JSON 배열 처리
// ========================================

function parseJsonArray(value) {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function safeJsonArray(value) {
  return parseJsonArray(value);
}


// ========================================
// JSON 객체 처리
// ========================================

function parseJsonObject(value) {
  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed;
    }

    return {};
  } catch {
    return {};
  }
}

function safeJsonObject(value) {
  return parseJsonObject(value);
}


// ========================================
// 시간 형식 확인
// ========================================

function isValidTime(value) {
  if (typeof value !== "string") {
    return false;
  }

  // 00:00 ~ 23:59
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hour, minute] = value
    .split(":")
    .map(Number);

  return (
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}


// ========================================
// 텍스트 정리
// ========================================

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .slice(0, maxLength);
}


// ========================================
// 이미지 확장자
// ========================================

function getExtension(contentType) {
  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/webp") {
    return "webp";
  }

  return "jpg";
}


// ========================================
// 비밀번호 SHA-256 해시
// ========================================

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  const hashArray = Array.from(
    new Uint8Array(hashBuffer)
  );

  return hashArray
    .map((byte) =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}


// ========================================
// JSON 응답
// ========================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=UTF-8",
        "cache-control": "no-store"
      }
    }
  );
}