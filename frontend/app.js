const statusBanner = document.querySelector("#provider-status");
const documentList = document.querySelector("#document-list");
const documentCount = document.querySelector("#document-count");
const form = document.querySelector("#chat-form");
const questionInput = document.querySelector("#question");
const sendButton = document.querySelector("#send-button");
const chatError = document.querySelector("#chat-error");
const answerCard = document.querySelector("#answer-card");
const answerText = document.querySelector("#answer-text");
const sources = document.querySelector("#sources");
const fileInput = document.querySelector("#file-input");
const sampleButton = document.querySelector("#sample-button");

async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch {
      // Keep the HTTP status message when the server response is not JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function showStatus(ready, text) {
  statusBanner.classList.toggle("ready", ready);
  statusBanner.classList.toggle("error", !ready);
  statusBanner.querySelector("strong").textContent = ready
    ? "AI provider connected"
    : "AI provider setup required";
  statusBanner.querySelector("div span").textContent = text;
  statusBanner.querySelector(".status-pill").textContent = ready ? "READY" : "SETUP";
  statusBanner.querySelector(".status-icon").textContent = ready ? "✓" : "!";
}

async function loadHealth() {
  try {
    const health = await request("/api/health");
    if (health.ai_provider_configured) {
      showStatus(true, `${health.indexed_documents} source document(s) indexed. Upload sources or ask a question.`);
    } else {
      showStatus(false, "Set OPENAI_API_KEY on the backend to enable embeddings and answer generation. The app remains available without it.");
    }
  } catch (error) {
    showStatus(false, error.message);
  }
}

async function loadDocuments() {
  try {
    const documents = await request("/api/documents");
    documentCount.textContent = documents.length;
    documentList.replaceChildren();
    if (documents.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No documents indexed yet. Add the sample source or upload a file.";
      documentList.append(empty);
      return;
    }

    for (const document of documents) {
      const row = document.createElement("div");
      row.className = "document-row";
      const icon = document.createElement("div");
      icon.className = "doc-icon";
      icon.textContent = document.filename.toLowerCase().endsWith(".pdf") ? "PDF" : "TXT";
      const info = document.createElement("div");
      info.className = "doc-info";
      const title = document.createElement("strong");
      title.textContent = document.filename;
      const details = document.createElement("small");
      details.textContent = `${document.chunk_count} indexed passage(s)`;
      info.append(title, details);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-doc";
      remove.title = `Remove ${document.filename}`;
      remove.setAttribute("aria-label", `Remove ${document.filename}`);
      remove.textContent = "×";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          await request(`/api/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" });
          await Promise.all([loadDocuments(), loadHealth()]);
        } catch (error) {
          showError(error.message);
          remove.disabled = false;
        }
      });
      row.append(icon, info, remove);
      documentList.append(row);
    }
  } catch (error) {
    documentList.textContent = error.message;
  }
}

function showError(message) {
  chatError.textContent = message;
  chatError.hidden = false;
}

function renderSources(items) {
  sources.replaceChildren();
  for (const source of items) {
    const link = document.createElement("a");
    link.className = source.source_url ? "source-link" : "source-link no-url";
    const page = source.page_number ? ` · p. ${source.page_number}` : "";
    link.textContent = `[${source.id}] ${source.filename}${page}`;
    if (source.source_url) {
      try {
        const url = new URL(source.source_url);
        if (url.protocol === "https:" || url.protocol === "http:") {
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
      } catch {
        link.removeAttribute("href");
      }
    }
    sources.append(link);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (question.length < 3) return;
  chatError.hidden = true;
  answerCard.hidden = true;
  sendButton.disabled = true;
  sendButton.textContent = "…";
  try {
    const result = await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    answerText.textContent = result.answer;
    renderSources(result.sources);
    answerCard.hidden = false;
  } catch (error) {
    showError(error.message);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "↑";
  }
});

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.textContent;
    questionInput.focus();
    document.querySelector("#char-count").textContent = `${questionInput.value.length} / 2000`;
  });
});

questionInput.addEventListener("input", () => {
  document.querySelector("#char-count").textContent = `${questionInput.value.length} / 2000`;
});

sampleButton.addEventListener("click", async () => {
  sampleButton.disabled = true;
  sampleButton.textContent = "Indexing…";
  try {
    await request("/api/documents/sample", { method: "POST" });
    await Promise.all([loadDocuments(), loadHealth()]);
  } catch (error) {
    showError(error.message);
  } finally {
    sampleButton.disabled = false;
    sampleButton.textContent = "Add verified sample source";
  }
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  try {
    await request("/api/documents", { method: "POST", body: formData });
    await Promise.all([loadDocuments(), loadHealth()]);
  } catch (error) {
    showError(error.message);
  } finally {
    fileInput.value = "";
  }
});

Promise.all([loadHealth(), loadDocuments()]);
