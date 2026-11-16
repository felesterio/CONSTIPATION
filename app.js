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

  function showTicket(payload) {
    document.getElementById("ticket-name").textContent = payload.name;
    document.getElementById("ticket-showing").textContent = showingLabel;
    document.getElementById("ticket-location").textContent = locationLabel;
    document.getElementById("ticket-filled").textContent =
      String(payload.filled) + " / " + String(capacity);
    rsvpPanel.classList.add("hidden");
    ticketPanel.classList.remove("hidden");
  }

  function looksLikeSheetEditUrl(url) {
    return /docs\.google\.com\/spreadsheets\//i.test(url);
  }

  /** JSONP — Apps Script does not support CORS for fetch(). */
  function scriptJsonp(params) {
    return new Promise(function (resolve, reject) {
      if (!scriptUrl) {
        reject(new Error("SCRIPT_URL is empty"));
        return;
      }
      const cbName = "_showingCb" + String(Date.now()) + String(Math.floor(Math.random() * 1e6));
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
      statusEl.textContent =
        "Not connected yet. Deploy Apps Script and paste the /exec URL into config.js.";
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
    statusEl.textContent = "";
  }

  async function submitRsvp(name) {
    if (!scriptUrl) {
      throw new Error("SCRIPT_URL is empty — paste the Apps Script /exec URL into config.js.");
    }
    if (looksLikeSheetEditUrl(scriptUrl)) {
      throw new Error("SCRIPT_URL is a Sheet edit link. Paste the /exec URL instead.");
    }
    const data = await scriptJsonp({
      action: "rsvp",
      name: name,
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
    const name = String(fd.get("name") || "").trim();
    if (!name) {
      statusEl.textContent = "Name is required.";
      return;
    }
    submitBtn.disabled = true;
    try {
      const data = await submitRsvp(name);
      setFilled(data.filled);
      showTicket({
        name: name,
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
