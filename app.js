// app.js
// Interactive historical timeline map
// Requires: index.html, styles.css, events/ folder with manifest.json + event files

// ----------------------
// Configuration
// ----------------------
const DATA_FOLDER   = 'events/';
const MANIFEST_FILE = 'manifest.json'; // lists all event JSON files

const MAP_CENTER = [20, 0]; // default map center (lat, lng)
const MAP_ZOOM   = 2;       // default zoom level

// ----------------------
// Map Initialization
// ----------------------
const map = L.map('map').setView(MAP_CENTER, MAP_ZOOM);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Cluster group for markers
const markersCluster = L.markerClusterGroup();
map.addLayer(markersCluster);

// ----------------------
// UI Elements
// ----------------------
const yearSlider      = document.getElementById('yearSlider');
const windowSizeInput = document.getElementById('windowSize');
const rangeLabel      = document.getElementById('rangeLabel');
const playBtn         = document.getElementById('playBtn');
const stepBack        = document.getElementById('stepBack');
const stepForward     = document.getElementById('stepForward');
const resetBtn        = document.getElementById('resetBtn');
const typeFilter      = document.getElementById('typeFilter');
const legendDiv       = document.getElementById('legend');

// ----------------------
// State Variables
// ----------------------
let eventsData   = [];
let markers      = [];
let typesSet     = new Set();
let playInterval = null;

// ----------------------
// Event Type Colors
// ----------------------
const TYPE_COLORS = {
  technology:    '#1f77b4',
  cultural:      '#ff7f0e',
  other:         '#2ca02c',
  environmental: '#d62728',
  political:     '#9467bd',
  war:           '#8c564b',
  discovery:     '#e377c2',
  disaster:      '#7f7f7f',
  economic:      '#bcbd22',
  science:       '#17becf',
  ruler:         '#393b79',
  pandemic:      '#d62728'
};

function colorForType(t) { return TYPE_COLORS[t] || '#444'; }
function rangesOverlap(a1, a2, b1, b2) { return (a1 <= b2) && (b1 <= a2); }
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[m]);
}

// ----------------------
// Load Events from JSON
// ----------------------
fetch(DATA_FOLDER + MANIFEST_FILE)
  .then(r => {
    if (!r.ok) throw new Error('Failed to load manifest.json');
    return r.json();
  })
  .then(files => Promise.all(
    files.map(file => {
      console.log('Loading', file);
      return fetch(DATA_FOLDER + file).then(r => {
        if (!r.ok) throw new Error('Failed to load ' + file);
        return r.json();
      });
    })
  ))
  .then(jsonArrays => {
    // Flatten all events from multiple files
    eventsData = jsonArrays.flatMap(json =>
      Array.isArray(json.events) ? json.events : (json || [])
    );

    // Normalize event data
    eventsData = eventsData.map(ev => {
      let s   = Number(ev.start_year) || null;
      let e   = (ev.end_year === null || ev.end_year === undefined) ? s : Number(ev.end_year);
      let lat = ev.location && typeof ev.location.lat === 'number' ? ev.location.lat : null;
      let lng = ev.location && typeof ev.location.lng === 'number' ? ev.location.lng : null;
      if (lat === null || lng === null) return null;
      typesSet.add(ev.type || 'other');
      return Object.assign({}, ev, {
        start_year: s,
        end_year: e,
        location: Object.assign({}, ev.location, { lat, lng })
      });
    }).filter(Boolean);

    // Populate type filter dropdown + legend
    const types = Array.from(typesSet).sort();
    types.forEach(t => {
      let opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeFilter.appendChild(opt);

      let item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `<span class="dot" style="background:${colorForType(t)}"></span> ${t}`;
      legendDiv.appendChild(item);
    });

    // Create markers for each event
    markers = eventsData.map(ev => {
      const marker = L.circleMarker([ev.location.lat, ev.location.lng], {
        radius: 7,
        color: '#222',
        weight: 1,
        fillColor: colorForType(ev.type),
        fillOpacity: 0.9
      });

      const popupHtml = `
        <div style="min-width:200px">
          <strong>${escapeHtml(ev.title || ev.id)}</strong><br/>
          <small style="color:#666">${escapeHtml(ev.location.place || '')}</small><br/>
          <div style="margin-top:6px">
            <strong>Years:</strong> ${ev.start_year}${ev.end_year && ev.end_year !== ev.start_year ? ' — ' + ev.end_year : ''}<br/>
            <strong>Type:</strong> ${escapeHtml(ev.type || '')}<br/>
            <div style="margin-top:6px">${escapeHtml(ev.description || '')}</div>
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml);
      return { ev, marker };
    });

    // Initial render
    updateRangeLabel();
    renderMarkers();
  })
  .catch(err => {
    console.error(err);
    alert('Error loading events folder. Ensure manifest.json and event files are present.');
  });

// ----------------------
// Helper Functions
// ----------------------
function getWindowRange() {
  const start = Number(yearSlider.value);
  const size  = Math.max(1, Number(windowSizeInput.value) || 25);
  return { start, end: start + size - 1 };
}

function updateRangeLabel() {
  const { start, end } = getWindowRange();
  rangeLabel.textContent = `${start} — ${end}`;
}

function renderMarkers() {
  markersCluster.clearLayers();
  const { start, end } = getWindowRange();
  const selectedType   = typeFilter.value;
  let count = 0;

  markers.forEach(({ev, marker}) => {
    const evStart = Number(ev.start_year);
    const evEnd   = (ev.end_year === null || ev.end_year === undefined) ? evStart : Number(ev.end_year);
    const overlaps= rangesOverlap(evStart, evEnd, start, end);
    const typeOk  = (selectedType === 'all') || (ev.type === selectedType);

    if (overlaps && typeOk) {
      markersCluster.addLayer(marker);
      count++;
    }
  });

  // Auto-fit map if few markers
  if (count > 0 && count <= 50) {
    const group = markersCluster.getLayers().map(m => m.getLatLng());
    if (group.length) map.fitBounds(group, { maxZoom: 6, padding: [40,40] });
  }
  updateRangeLabel();
}

// ----------------------
// UI Event Handlers
// ----------------------
yearSlider.addEventListener('input', () => {
  updateRangeLabel();
  renderMarkers();
});

windowSizeInput.addEventListener('change', () => {
  windowSizeInput.value = Math.max(1, Math.min(200, Number(windowSizeInput.value) || 25));
  renderMarkers();
});

typeFilter.addEventListener('change', renderMarkers);

stepBack.addEventListener('click', () => {
  yearSlider.value = Math.max(Number(yearSlider.min), Number(yearSlider.value) - 25);
  renderMarkers();
});

stepForward.addEventListener('click', () => {
  yearSlider.value = Math.min(Number(yearSlider.max), Number(yearSlider.value) + 25);
  renderMarkers();
});

resetBtn.addEventListener('click', () => {
  yearSlider.value = yearSlider.min;
  windowSizeInput.value = 25;
  typeFilter.value = 'all';
  map.setView(MAP_CENTER, MAP_ZOOM);
  renderMarkers();
});

playBtn.addEventListener('click', () => {
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
    playBtn.textContent = 'Play';
  } else {
    playBtn.textContent = 'Pause';
    playInterval = setInterval(() => {
      let v = Number(yearSlider.value);
      if (v >= Number(yearSlider.max)) {
        clearInterval(playInterval);
        playInterval = null;
        playBtn.textContent = 'Play';
        return;
      }
      yearSlider.value = v + 1;
      renderMarkers();
    }, 220);
  }
});
