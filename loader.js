async function bootParleyLab() {
  try {
    const response = await fetch("./version.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo leer version.json (${response.status})`);

    const release = await response.json();
    window.PARLEYLAB_RELEASE = release;

    const script = document.createElement("script");
    script.src = `./app.js?v=${encodeURIComponent(release.version || Date.now())}`;
    script.defer = true;
    script.onerror = () => showBootError("No se pudo cargar app.js");
    document.body.appendChild(script);
  } catch (error) {
    console.error(error);
    showBootError(error.message || "No se pudo iniciar ParleyLab");
  }
}

function showBootError(message) {
  const box = document.createElement("div");
  box.style.cssText = [
    "margin:16px",
    "padding:14px",
    "border-radius:14px",
    "background:rgba(251,113,133,.08)",
    "border:1px solid rgba(251,113,133,.35)",
    "color:#fecdd3",
    "font-family:system-ui,sans-serif"
  ].join(";");
  box.innerHTML = `<strong>Error al iniciar ParleyLab</strong><br><small>${escapeHtml(message)}</small>`;
  document.body.prepend(box);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

bootParleyLab();
