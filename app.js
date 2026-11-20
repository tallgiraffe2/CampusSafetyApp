const storageKey = "campus-safety-reports";
const reportStatus = document.querySelector("#report-status");
const recentEvents = document.querySelector("#recent-events");
const recentEventsHeading = document.querySelector("#recent-events-heading");
const recentEventsStatus = document.querySelector("#recent-events-status");
const recentEventsList = document.querySelector("#recent-events-list");

/** Loads the reports saved by this browser. */
function loadReports() {
  const reports = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  if (!Array.isArray(reports)) {
    throw new Error("Invalid report storage");
  }
  return reports;
}

/** Shows saved reports in descending order of occurrence. */
function renderRecentEvents(reports) {
  const sortedReports = [...reports].sort((first, second) =>
    new Date(second.occurredAt) - new Date(first.occurredAt));
  const items = document.createDocumentFragment();
  for (const report of sortedReports) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.dateTime = report.occurredAt;
    time.textContent = new Date(report.occurredAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const description = document.createElement("p");
    description.className = "report-description";
    description.textContent = report.description;
    item.append(time, description);
    items.append(item);
  }
  recentEventsList.replaceChildren(items);
  recentEventsList.hidden = reports.length === 0;
  recentEventsStatus.hidden = reports.length > 0;
}

/** Sets up the recent events, campus map, and report form. */
function initialize() {
  let savedReports = [];
  try {
    savedReports = loadReports();
    renderRecentEvents(savedReports);
  } catch {
    recentEventsStatus.textContent = "Saved reports could not be loaded.";
  }

  if (!window.L) {
    reportStatus.textContent = "The map could not load. Check your connection and reload.";
    return;
  }

  // Start at the Memorial Union
  const map = L.map("map", { doubleClickZoom: false }).setView([44.5650, -123.2789], 16);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const reportEditor = document.querySelector("#report-editor");
  const form = reportEditor.querySelector("#report-form");
  const reportHeading = reportEditor.querySelector("#report-heading");
  const locationStatus = form.querySelector("#location");
  const descriptionInput = form.querySelector("#description");
  const dateInput = form.querySelector("#occurred-date");
  const timeInput = form.querySelector("#occurred-time");
  const saveStatus = form.querySelector("#save-status");

  // Only the pin for the current report can move
  let draftPin;

  function showLocation() {
    const { lat, lng } = draftPin.getLatLng().wrap();
    locationStatus.textContent = `Selected location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  /** Moves the current pin or adds one if there is no draft. */
  function placePin(latLng) {
    if (draftPin) {
      draftPin.setLatLng(latLng);
    } else {
      draftPin = L.marker(latLng, {
        icon: L.divIcon({
          className: "incident-pin",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        draggable: true,
        autoPan: true,
        keyboard: false,
        zIndexOffset: 1000,
        alt: "Incident location",
      }).addTo(map).on("dragend", showLocation);
      recentEvents.hidden = true;
      reportEditor.hidden = false;
      reportStatus.textContent = "";
      reportHeading.focus();
    }
    showLocation();
  }

  function closeEditor() {
    draftPin.remove();
    draftPin = undefined;
    form.reset();
    descriptionInput.setCustomValidity("");
    saveStatus.textContent = "";
    reportEditor.hidden = true;
    recentEvents.hidden = false;
    recentEventsHeading.focus();
  }

  /** Adds a saved report to the map with its own popup. */
  function showReport(report) {
    const popup = document.createElement("div");
    const time = document.createElement("strong");
    time.textContent = new Date(report.occurredAt).toLocaleString();
    const description = document.createElement("p");
    description.className = "report-description";
    // Use textContent so the description stays plain text in the popup
    description.textContent = report.description;
    popup.append(time, description);

    return L.circleMarker([report.lat, report.lng], {
      bubblingMouseEvents: false,
      radius: 8,
      color: "#000000",
      weight: 2,
      fillColor: "#d73f09",
      fillOpacity: 1,
    }).addTo(map).bindPopup(popup);
  }

  try {
    for (const report of savedReports) {
      showReport(report);
    }
  } catch {
    reportStatus.textContent = "Saved reports could not be loaded.";
  }

  // Leaflet suppresses click events after dragging the map or a marker.
  map.on("click", ({ latlng }) => placePin(latlng));

  const mapContainer = map.getContainer();
  let mousePosition;
  mapContainer.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse") {
      mousePosition = { clientX: event.clientX, clientY: event.clientY };
    }
  });
  mapContainer.addEventListener("pointerleave", () => {
    mousePosition = undefined;
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.repeat || event.isComposing ||
        event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== "p") return;
    if (!mousePosition || event.target?.closest?.("input, textarea, select, [contenteditable]")) return;

    const hovered = document.elementFromPoint(mousePosition.clientX, mousePosition.clientY);
    if (!mapContainer.contains(hovered) || hovered.closest(".leaflet-popup, .leaflet-control")) return;

    event.preventDefault();
    placePin(map.mouseEventToLatLng(mousePosition));
  });

  form.querySelector("#cancel-report").addEventListener("click", closeEditor);
  descriptionInput.addEventListener("input", () => descriptionInput.setCustomValidity(""));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const description = descriptionInput.value.trim();

    if (!description) {
      descriptionInput.setCustomValidity("Enter a description.");
      descriptionInput.reportValidity();
      return;
    }
    if (!draftPin) return;

    // Read the pin after dragging so we save where it ended up
    const { lat, lng } = draftPin.getLatLng().wrap();
    const occurredAt = `${dateInput.value}T${timeInput.value}`;
    const report = { lat, lng, description, occurredAt };
    let reports;
    try {
      reports = loadReports();
      reports.push(report);
      localStorage.setItem(storageKey, JSON.stringify(reports));
    } catch {
      saveStatus.textContent = "The report could not be saved in this browser.";
      return;
    }

    renderRecentEvents(reports);
    closeEditor();
    reportStatus.textContent = "Report saved.";
    showReport(report).openPopup();
  });
}

initialize();
