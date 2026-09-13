const state = {
  posts: [],
  day: "26",
  category: "all",
  time: "all",
  search: ""
};

const modal = document.querySelector("#writeModal");
const form = document.querySelector("#postForm");
const postsContainer = document.querySelector("#postsContainer");
const postCount = document.querySelector("#postCount");
const imageFile = document.querySelector("#imageFile");
const imagePreview = document.querySelector("#imagePreview");
const formStatus = document.querySelector("#formStatus");
const submitButton = document.querySelector("#submitButton");

document.querySelector("#openWriteModal").addEventListener("click", openModal);
document.querySelector("#closeWriteModal").addEventListener("click", closeModal);
document.querySelector(".modal-background").addEventListener("click", closeModal);

function openModal() {
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

document.querySelectorAll(".day-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".day-tab").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    state.day = button.dataset.day;
    renderPosts();
  });
});

document.querySelectorAll("#categoryFilters .pill").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("#categoryFilters .pill").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    state.category = button.dataset.filter;
    renderPosts();
  });
});

document.querySelectorAll(".time-pill").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".time-pill").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    state.time = button.dataset.time;
    renderPosts();
  });
});

document.querySelector("#searchInput").addEventListener("input", (event) => {
  state.search = event.target.value.trim().toLowerCase();
  renderPosts();
});

imageFile.addEventListener("change", () => {
  const file = imageFile.files[0];

  imagePreview.innerHTML = "";
  imagePreview.style.display = "none";

  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert("이미지는 5MB 이하만 업로드할 수 있어요.");
    imageFile.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    const img = document.createElement("img");
    img.src = event.target.result;
    img.alt = "선택한 이미지 미리보기";
    imagePreview.appendChild(img);
    imagePreview.style.display = "block";
  };

  reader.readAsDataURL(file);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const days = [...document.querySelectorAll('input[name="days"]:checked')]
    .map((input) => input.value);

  const times = [...document.querySelectorAll('input[name="time"]:checked')]
    .map((input) => input.value);

  const category = document.querySelector('input[name="category"]:checked')?.value;

  if (!days.length) {
    alert("참가 날짜를 하나 이상 선택해주세요.");
    return;
  }

  if (!category) {
    alert("참여 방식을 선택해주세요.");
    return;
  }

  const file = imageFile.files[0];

  if (file && file.size > 5 * 1024 * 1024) {
    alert("이미지는 5MB 이하만 업로드할 수 있어요.");
    return;
  }

  const data = new FormData();

  data.append("nickname", document.querySelector("#nickname").value);
  data.append("xAccount", document.querySelector("#xAccount").value);
  data.append("category", category);
  data.append("days", JSON.stringify(days));
  data.append("times", JSON.stringify(times));
  data.append("genre", document.querySelector("#genre").value);
  data.append("message", document.querySelector("#message").value);

  if (file) {
    data.append("image", file);
  }

  submitButton.disabled = true;
  submitButton.textContent = "등록 중...";
  setStatus("게시물을 등록하고 있어요...");

  try {
    const response = await fetch("/api/posts", {
      method: "POST",
      body: data
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "등록에 실패했습니다.");
    }

    form.reset();
    imagePreview.innerHTML = "";
    imagePreview.style.display = "none";

    setStatus("등록되었습니다!");

    await loadPosts();

    setTimeout(closeModal, 500);
  } catch (error) {
    console.error(error);
    setStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "게시물 등록하기 ✦";
  }
});

async function loadPosts() {
  try {
    const response = await fetch("/api/posts", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("게시물을 불러오지 못했습니다.");
    }

    state.posts = await response.json();
    renderPosts();
  } catch (error) {
    console.error(error);
    postsContainer.innerHTML = `
      <div class="empty">
        참가자 정보를 불러오지 못했어요.<br>
        잠시 후 다시 시도해주세요.
      </div>
    `;
  }
}

function renderPosts() {
  const search = state.search;

  const filtered = state.posts.filter((post) => {
    const dayMatch = post.days?.includes(state.day);
    const categoryMatch =
      state.category === "all" || post.category === state.category;
    const timeMatch =
      state.time === "all" || post.times?.includes(state.time);

    const searchable = [
      post.nickname,
      post.xAccount,
      post.genre,
      post.message,
      post.category
    ].join(" ").toLowerCase();

    const searchMatch = !search || searchable.includes(search);

    return dayMatch && categoryMatch && timeMatch && searchMatch;
  });

  postCount.textContent = `${filtered.length}명`;

  if (!filtered.length) {
    postsContainer.innerHTML = `
      <div class="empty">
        조건에 맞는 참가자가 아직 없어요.<br>
        직접 첫 게시물을 등록해보세요 ✦
      </div>
    `;
    return;
  }

  postsContainer.innerHTML = filtered.map(createCard).join("");
}

function createCard(post) {
  const card = document.createElement("article");
  card.className = "post-card";

  const image = document.createElement("img");
  image.className = "post-image";
  image.alt = `${post.nickname}의 착장 이미지`;

  if (post.imageUrl) {
    image.src = post.imageUrl;
    image.loading = "lazy";
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "no-image";
    placeholder.textContent = "NO IMAGE ✦";
    card.appendChild(placeholder);
  }

  const content = document.createElement("div");
  content.className = "post-content";

  const top = document.createElement("div");
  top.className = "post-top";

  const nickname = document.createElement("div");
  nickname.className = "nickname";
  nickname.textContent = post.nickname;

  const category = document.createElement("div");
  category.className = "category";
  category.textContent = post.category;

  top.append(nickname, category);

  if (post.xAccount) {
    const x = document.createElement("div");
    x.className = "x-account";
    x.textContent = `@${post.xAccount}`;
    content.appendChild(top);
    content.appendChild(x);
  } else {
    content.appendChild(top);
  }

  const info = document.createElement("div");
  info.className = "post-info";

  for (const time of post.times || []) {
    const tag = document.createElement("span");
    tag.className = "info-tag";
    tag.textContent = time;
    info.appendChild(tag);
  }

  if (post.genre) {
    const genre = document.createElement("span");
    genre.className = "info-tag";
    genre.textContent = post.genre;
    info.appendChild(genre);
  }

  content.appendChild(info);

  if (post.message) {
    const message = document.createElement("div");
    message.className = "post-message";
    message.textContent = post.message;
    content.appendChild(message);
  }

  card.appendChild(content);

  if (post.imageUrl) {
    card.insertBefore(image, content);
  }

  return card.outerHTML;
}

function setStatus(message, error = false) {
  formStatus.textContent = message;
  formStatus.style.color = error ? "#e53f6d" : "#3a9eb7";
}

loadPosts();
