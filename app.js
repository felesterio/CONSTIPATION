(function () {
  const cfg = window.SHOWING_CONFIG || {};
  const capacity = Number(cfg.CAPACITY) || 50;
  const showingLabel = cfg.SHOWING_LABEL || "Saturday, December 5, 2026, 9 PM";
  const locationLabel = cfg.LOCATION_LABEL || "1608 N Washtenaw Ave, Chicago IL";
  const mapsUrl = cfg.LOCATION_MAPS_URL || "#";
  const scriptUrl = (cfg.SCRIPT_URL || "").trim().replace(/\/$/, "");

  const filledEl = document.getElementById("filled");
  const capacityEl = document.getElementById("capacity");
  const overWarn = document.getElementById("over-warn");
  const showingEl = document.getElementById("showing-label");
  const mapsLink = document.getElementById("maps-link");
  const form = document.getElementById("rsvp-form");
  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-btn");
  const rsvpPanel = document.getElementById("rsvp-panel");
  const ticketPanel = document.getElementById("ticket-panel");

  showingEl.textContent = showingLabel;
  capacityEl.textContent = String(capacity);
  mapsLink.textContent = locationLabel;
  mapsLink.href = mapsUrl;

  function setFilled(n) {
    const filled = Math.max(0, Number(n) || 0);
    filledEl.textContent = String(filled);
    overWarn.classList.toggle("hidden", filled < capacity);
  }

  function setText(id, value) {
    document.getElementById(id).textContent =
      value == null || value === "" ? "—" : String(value);
  }

  function showTicket(payload) {
    setText("ticket-name", payload.name);
    setText("ticket-showing", showingLabel);
    setText("ticket-location", locationLabel);
    rsvpPanel.classList.add("hidden");
    ticketPanel.classList.remove("hidden");
  }

  function looksLikeSheetEditUrl(url) {
    return /docs\.google\.com\/spreadsheets\//i.test(url);
  }

  function sanitizePlain(s, max) {
    return String(s || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .trim()
      .slice(0, max);
  }

  function scriptJsonp(params) {
    return new Promise(function (resolve, reject) {
      if (!scriptUrl) {
        reject(new Error("SCRIPT_URL is empty"));
        return;
      }
      const cbName =
        "_showingCb" + String(Date.now()) + String(Math.floor(Math.random() * 1e6));
      const timeout = setTimeout(function () {
        cleanup();
        reject(
          new Error(
            "Timed out talking to Apps Script. Redeploy Web app with Who has access: Anyone."
          )
        );
      }, 20000);

      function cleanup() {
        clearTimeout(timeout);
        try {
          delete window[cbName];
        } catch (e) {
          window[cbName] = undefined;
        }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = function (data) {
        cleanup();
        resolve(data);
      };

      const q = new URLSearchParams(params);
      q.set("callback", cbName);
      const script = document.createElement("script");
      script.src = scriptUrl + "?" + q.toString();
      script.onerror = function () {
        cleanup();
        reject(
          new Error(
            "Could not reach Apps Script. Check SCRIPT_URL and that access is Anyone."
          )
        );
      };
      document.head.appendChild(script);
    });
  }

  async function fetchCount() {
    if (!scriptUrl) {
      setFilled(0);
      return;
    }
    if (looksLikeSheetEditUrl(scriptUrl)) {
      setFilled(0);
      statusEl.textContent =
        "SCRIPT_URL looks like a Sheet link. Use the Apps Script /exec URL.";
      return;
    }
    const data = await scriptJsonp({ action: "count" });
    if (!data || typeof data.filled !== "number") {
      throw new Error((data && data.error) || "Bad count response");
    }
    setFilled(data.filled);
  }

  async function submitRsvp(name, note) {
    if (!scriptUrl) {
      throw new Error("SCRIPT_URL is empty.");
    }
    const data = await scriptJsonp({
      action: "rsvp",
      name: name,
      note: note,
      showing: showingLabel,
    });
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) || "Submit rejected");
    }
    return data;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    statusEl.textContent = "";
    const fd = new FormData(form);
    const name = sanitizePlain(fd.get("name"), 120);
    const note = sanitizePlain(fd.get("note"), 500);
    if (!name) {
      statusEl.textContent = "Name is required.";
      return;
    }
    submitBtn.disabled = true;
    try {
      const data = await submitRsvp(name, note);
      setFilled(data.filled);
      showTicket({
        name: name,
        note: note,
        filled: data.filled,
      });
    } catch (err) {
      statusEl.textContent = err.message || "Something went wrong.";
      submitBtn.disabled = false;
    }
  });

  fetchCount().catch(function (err) {
    statusEl.textContent = err.message || "Could not load seats.";
    setFilled(0);
  });
})();
