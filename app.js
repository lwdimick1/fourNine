(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), wrap = $('canvas-wrap'), layersList = $('layers-list');
  const state = { width: 1920, height: 1080, layers: [], activeId: null, tool: 'brush', zoom: 1, panX: 0, panY: 0, drawing: false, lassoing: false, panning: false, spaceHeld: false, spacePan: false, spaceTimer: null, last: null, strokeCanvas: null, onionCanvases: [], reference: { src: null, x: 0, y: 0, width: 0, height: 0, ratio: 1, opacity: 1, element: null, mode: null, last: null }, transforming: false, selection: { points: [], overlay: null, mask: null, layerId: null }, timeline: { frame: 0, duration: 72, fps: 12, loop: true, onion: false, playing: false, lastTick: 0, raf: null }, history: [], redo: [], projectFileHandle: null };
  const controls = { color: $('color'), size: $('brush-size'), softness: $('softness'), opacity: $('opacity'), referenceOpacity: $('reference-opacity'), pressure: $('pressure-size'), pressureRange: $('pressure-range') };

  function setStatus(text) { $('status').textContent = text; }
  function makeLayer(name = `Layer ${state.layers.length + 1}`) {
    const canvas = document.createElement('canvas'); canvas.width = state.width; canvas.height = state.height; canvas.className = 'paint-layer';
    const layer = { id: crypto.randomUUID(), name, visible: true, opacity: 1, start: 0, end: state.timeline.duration - 1, canvas };
    state.layers.unshift(layer); state.activeId = layer.id; wrap.append(canvas); renderLayers(); return layer;
  }
  function activeLayer() { return state.layers.find(l => l.id === state.activeId); }
  function layerIsOnFrame(layer, frame = state.timeline.frame) { return layer.visible && frame >= layer.start && frame <= layer.end; }
  function applyLayerVisibility() { state.layers.forEach(layer => { layer.canvas.style.display = layerIsOnFrame(layer) ? 'block' : 'none'; layer.canvas.style.opacity = layer.opacity; }); }
  function updateReferenceElement() {
    const reference = state.reference;
    if (!reference.src) { reference.element?.remove(); reference.element = null; return; }
    if (!reference.element) {
      const element = document.createElement('div');
      element.className = 'reference-image';
      const image = document.createElement('img');
      image.alt = 'Reference image';
      image.src = reference.src;
      element.append(image);
      wrap.prepend(element);
      reference.element = element;
    }
    reference.element.style.left = `${reference.x}px`;
    reference.element.style.top = `${reference.y}px`;
    reference.element.style.width = `${reference.width}px`;
    reference.element.style.height = `${reference.height}px`;
    reference.element.style.opacity = reference.opacity ?? 1;
    reference.element.classList.toggle('selected', state.tool === 'reference');
  }
  function syncReferenceControls() {
    const hasReference = Boolean(state.reference.src);
    $('reference-opacity-control').classList.toggle('visible', hasReference);
    controls.referenceOpacity.value = Math.round((state.reference.opacity ?? 1) * 100);
    $('reference-opacity-value').textContent = `${controls.referenceOpacity.value}%`;
    $('remove-reference').disabled = !hasReference;
  }
  function clearReference(quiet = false) {
    state.reference.element?.remove();
    state.reference = { src: null, x: 0, y: 0, width: 0, height: 0, ratio: 1, opacity: 1, element: null, mode: null, last: null };
    syncReferenceControls();
    if (!quiet) setStatus('Reference image removed');
  }
  function updateTimelineReadout() { $('frame-readout').textContent = `Frame ${state.timeline.frame + 1} / ${state.timeline.duration}`; $('timeline-scrubber').value = state.timeline.frame; }
  function updatePlayhead() { const left = `${(state.timeline.frame / Math.max(1, state.timeline.duration - 1)) * 100}%`; document.querySelectorAll('.timeline-playhead').forEach(playhead => playhead.style.left = left); updateTimelineReadout(); }
  function refreshOnionSkin() { state.onionCanvases.forEach(canvas => canvas.remove()); state.onionCanvases = []; if (!state.timeline.onion) return; const addGhost = (frame, color, opacity, zIndex) => { const canvas = document.createElement('canvas'); canvas.width = state.width; canvas.height = state.height; canvas.className = 'paint-layer onion-skin'; canvas.style.opacity = opacity; canvas.style.zIndex = zIndex; const ctx = canvas.getContext('2d'); renderOnionComposite(ctx, frame); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0, 0, state.width, state.height); ctx.globalCompositeOperation = 'source-over'; wrap.append(canvas); state.onionCanvases.push(canvas); }; if (state.timeline.frame > 0) addGhost(state.timeline.frame - 1, '#35c1ca', '.28', state.layers.length + 2); const selected = activeLayer(); if (selected && selected.end === state.timeline.frame && state.timeline.frame < state.timeline.duration - 1) addGhost(state.timeline.frame + 1, '#f7c970', '.22', state.layers.length + 3); }
  function setFrame(frame) { state.timeline.frame = Math.max(0, Math.min(state.timeline.duration - 1, Math.round(frame))); const layerAtFrame = state.layers.find(layer => layerIsOnFrame(layer)); if (layerAtFrame && layerAtFrame.id !== state.activeId) { state.activeId = layerAtFrame.id; renderLayers(); } else { applyLayerVisibility(); refreshOnionSkin(); } updatePlayhead(); }
  function renderTimeline() {
    state.timeline.frame = Math.max(0, Math.min(state.timeline.duration - 1, state.timeline.frame)); $('timeline-fps').value = state.timeline.fps; $('timeline-duration').value = state.timeline.duration; $('loop-timeline').checked = state.timeline.loop; $('onion-skin').classList.toggle('enabled', state.timeline.onion); $('timeline-scrubber').max = state.timeline.duration - 1;
    const tracks = $('timeline-tracks'); tracks.replaceChildren();
    state.layers.forEach(layer => {
      const row = document.createElement('div'); row.className = 'timeline-track';
      const name = document.createElement('span'); name.className = 'track-name'; name.textContent = layer.name;
      const lane = document.createElement('div'); lane.className = 'track-lane';
      const exposure = document.createElement('div'); exposure.className = 'track-exposure'; exposure.style.left = `${(layer.start / state.timeline.duration) * 100}%`; exposure.style.width = `${((layer.end - layer.start + 1) / state.timeline.duration) * 100}%`; exposure.title = `${layer.start + 1}–${layer.end + 1}`;
      const playhead = document.createElement('div'); playhead.className = 'timeline-playhead';
      const range = document.createElement('div'); range.className = 'track-range';
      const start = document.createElement('input'); start.type = 'number'; start.min = '1'; start.max = String(state.timeline.duration); start.value = layer.start + 1; start.title = 'Start frame';
      const end = document.createElement('input'); end.type = 'number'; end.min = '1'; end.max = String(state.timeline.duration); end.value = layer.end + 1; end.title = 'End frame';
      const changeRange = () => { layer.start = Math.max(0, Math.min(state.timeline.duration - 1, +start.value - 1)); layer.end = Math.max(layer.start, Math.min(state.timeline.duration - 1, +end.value - 1)); renderLayers(); };
      start.oninput = changeRange; end.oninput = changeRange; start.onchange = commitHistory; end.onchange = commitHistory;
      const startHandle = document.createElement('div'); startHandle.className = 'track-handle start'; startHandle.title = 'Drag to set start frame';
      const endHandle = document.createElement('div'); endHandle.className = 'track-handle end'; endHandle.title = 'Drag to set end frame';
      const updateExposure = () => { exposure.style.left = `${(layer.start / state.timeline.duration) * 100}%`; exposure.style.width = `${((layer.end - layer.start + 1) / state.timeline.duration) * 100}%`; exposure.title = `${layer.start + 1}–${layer.end + 1}`; start.value = layer.start + 1; end.value = layer.end + 1; applyLayerVisibility(); };
      const addHandleDrag = (handle, edge) => { let dragging = false; const frameFromPointer = event => { const rect = lane.getBoundingClientRect(); return Math.max(0, Math.min(state.timeline.duration - 1, Math.round(((event.clientX - rect.left) / rect.width) * (state.timeline.duration - 1)))); }; handle.onpointerdown = event => { dragging = true; handle.setPointerCapture(event.pointerId); event.stopPropagation(); event.preventDefault(); }; handle.onpointermove = event => { if (!dragging) return; const frame = frameFromPointer(event); if (edge === 'start') layer.start = Math.min(frame, layer.end); else layer.end = Math.max(frame, layer.start); updateExposure(); }; handle.onpointerup = event => { if (!dragging) return; dragging = false; handle.releasePointerCapture?.(event.pointerId); commitHistory(); setStatus(`Layer range: ${layer.start + 1}–${layer.end + 1}`); }; handle.onpointercancel = () => { dragging = false; }; };
      addHandleDrag(startHandle, 'start'); addHandleDrag(endHandle, 'end'); exposure.append(startHandle, endHandle);
      let movingExposure = false, dragOriginFrame = 0, originalStart = 0, originalEnd = 0;
      const frameFromLane = event => { const rect = lane.getBoundingClientRect(); return Math.max(0, Math.min(state.timeline.duration - 1, Math.round(((event.clientX - rect.left) / rect.width) * (state.timeline.duration - 1)))); };
      exposure.onpointerdown = event => { if (event.target.closest('.track-handle')) return; movingExposure = true; state.activeId = layer.id; dragOriginFrame = frameFromLane(event); originalStart = layer.start; originalEnd = layer.end; exposure.setPointerCapture(event.pointerId); exposure.classList.add('dragging'); event.stopPropagation(); event.preventDefault(); };
      exposure.onpointermove = event => { if (!movingExposure) return; const span = originalEnd - originalStart; const move = frameFromLane(event) - dragOriginFrame; layer.start = Math.max(0, Math.min(state.timeline.duration - 1 - span, originalStart + move)); layer.end = layer.start + span; updateExposure(); };
      exposure.onpointerup = event => { if (!movingExposure) return; movingExposure = false; exposure.releasePointerCapture?.(event.pointerId); exposure.classList.remove('dragging'); commitHistory(); setStatus(`Layer moved to frames ${layer.start + 1}–${layer.end + 1}`); };
      exposure.onpointercancel = () => { movingExposure = false; exposure.classList.remove('dragging'); };
      let scrubbing = false;
      const scrub = event => { const rect = lane.getBoundingClientRect(); setFrame(((event.clientX - rect.left) / rect.width) * (state.timeline.duration - 1)); };
      lane.onpointerdown = event => { if (event.target.closest('.track-range, .track-handle')) return; scrubbing = true; lane.setPointerCapture(event.pointerId); scrub(event); event.preventDefault(); };
      lane.onpointermove = event => { if (scrubbing) scrub(event); };
      lane.onpointerup = event => { scrubbing = false; lane.releasePointerCapture?.(event.pointerId); };
      lane.onpointercancel = () => { scrubbing = false; };
      range.append(start, end); lane.append(exposure, playhead, range); row.append(name, lane); tracks.append(row);
    });
    updatePlayhead();
  }
  function captureDocument() { const reference = state.reference.src ? { src: state.reference.src, x: state.reference.x, y: state.reference.y, width: state.reference.width, height: state.reference.height, ratio: state.reference.ratio, opacity: state.reference.opacity } : null; return { width: state.width, height: state.height, activeId: state.activeId, reference, timeline: { frame: state.timeline.frame, duration: state.timeline.duration, fps: state.timeline.fps, loop: state.timeline.loop, onion: state.timeline.onion }, layers: state.layers.map(l => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, start: l.start, end: l.end, image: l.canvas.toDataURL() })) }; }
  function commitHistory() { state.history.push(captureDocument()); if (state.history.length > 40) state.history.shift(); state.redo = []; }
  async function restoreDocument(doc) {
    clearSelection(true); clearReference(true); state.layers.forEach(l => l.canvas.remove()); state.width = doc.width; state.height = doc.height; Object.assign(state.timeline, { frame: 0, duration: 72, fps: 12, loop: true, onion: false }, doc.timeline || {});
    $('canvas-width').value = doc.width; $('canvas-height').value = doc.height; state.layers = [];
    for (const source of [...doc.layers].reverse()) {
      const layer = makeLayer(source.name); layer.id = source.id || crypto.randomUUID(); layer.visible = source.visible; layer.opacity = source.opacity ?? 1; layer.start = source.start ?? 0; layer.end = source.end ?? state.timeline.duration - 1;
      await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { layer.canvas.getContext('2d').drawImage(image, 0, 0); resolve(); }; image.onerror = reject; image.src = source.image; });
    }
    state.activeId = doc.activeId && state.layers.some(l => l.id === doc.activeId) ? doc.activeId : state.layers[0].id;
    if (doc.reference?.src) { state.reference = { ...doc.reference, ratio: doc.reference.ratio || doc.reference.width / doc.reference.height || 1, opacity: doc.reference.opacity ?? 1, element: null, mode: null, last: null }; }
    placeCanvas(); updateReferenceElement(); syncReferenceControls(); renderLayers();
  }
  async function undo() { if (state.history.length < 2) return setStatus('Nothing to undo'); state.redo.push(state.history.pop()); await restoreDocument(state.history.at(-1)); setStatus('Undid last change'); }
  async function redo() { const next = state.redo.pop(); if (!next) return setStatus('Nothing to redo'); state.history.push(next); await restoreDocument(next); setStatus('Redid last change'); }
  function renderLayers() {
    layersList.replaceChildren();
    state.layers.forEach((layer, index) => {
      layer.canvas.style.zIndex = state.layers.length - index;
      layer.canvas.style.display = layerIsOnFrame(layer) ? 'block' : 'none';
      layer.canvas.style.opacity = layer.opacity;
      const item = document.createElement('div'); item.className = `layer-item ${layer.id === state.activeId ? 'active' : ''}`;
      const eye = document.createElement('button'); eye.className = 'visibility'; eye.textContent = layer.visible ? '◉' : '○'; eye.title = 'Toggle visibility';
      eye.onclick = (e) => { e.stopPropagation(); layer.visible = !layer.visible; renderLayers(); commitHistory(); };
      const name = document.createElement('span'); name.className = 'layer-name'; name.textContent = layer.name;
      name.onclick = (e) => e.stopPropagation();
      name.ondblclick = (e) => { e.stopPropagation(); state.activeId=layer.id; const input=document.createElement('input'); input.value=layer.name; name.replaceWith(input); input.focus(); input.select(); const previousName=layer.name; const done=()=>{layer.name=input.value.trim()||'Untitled layer';renderLayers();if(layer.name!==previousName)commitHistory();}; input.onblur=done; input.onkeydown=(ev)=>{if(ev.key==='Enter')input.blur(); if(ev.key==='Escape'){input.value=previousName;input.blur();}}; };
      item.append(eye, name); item.onclick = () => { state.activeId = layer.id; renderLayers(); }; layersList.append(item);
    });
    const selected = activeLayer(); if (selected) { controls.opacity.value = Math.round(selected.opacity * 100); $('opacity-value').textContent = `${controls.opacity.value}%`; } renderTimeline(); refreshOnionSkin();
  }
  function placeCanvas() { wrap.style.width = `${state.width}px`; wrap.style.height = `${state.height}px`; applyTransform(); }
  function applyTransform() { wrap.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`; $('zoom-label').textContent = `${Math.round(state.zoom * 100)}%`; }
  function fitCanvas() { const r=stage.getBoundingClientRect(); state.zoom=Math.min((r.width-100)/state.width,(r.height-100)/state.height,1); state.panX=(r.width-state.width*state.zoom)/2; state.panY=(r.height-state.height*state.zoom)/2; applyTransform(); }
  function zoomAt(x, y, factor) { const old = state.zoom; state.zoom = Math.max(.08, Math.min(8, state.zoom * factor)); state.panX = x - (x - state.panX) * (state.zoom / old); state.panY = y - (y - state.panY) * (state.zoom / old); applyTransform(); }
  function zoomAtCenter(factor) { const r = stage.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, factor); setStatus(`Zoom: ${Math.round(state.zoom * 100)}%`); }
  function canvasPoint(event) { const r=wrap.getBoundingClientRect(); return { x:(event.clientX-r.left)/state.zoom, y:(event.clientY-r.top)/state.zoom }; }
  function reportPenInput(event) { const type = event.pointerType || 'unknown'; const pressure = Number.isFinite(event.pressure) ? event.pressure.toFixed(2) : 'unavailable'; const force = Number.isFinite(event.webkitForce) ? ` · Safari force ${event.webkitForce.toFixed(2)}` : ''; $('pen-readout').textContent = `Tablet input: ${type} · pressure ${pressure}${force}`; }
  function pressureFactor(event) { const pressure = event.pressure; const usable = event.pointerType === 'pen' || (Number.isFinite(pressure) && Math.abs(pressure - .5) > .01); if (!controls.pressure.checked || !usable || pressure <= 0) return 1; const range = +controls.pressureRange.value / 100; return 1 - range * (1 - Math.max(.05, pressure)); }
  function softStamp(ctx, x, y, size) { const radius = size / 2; const fade = ctx.createRadialGradient(x, y, 0, x, y, radius); const color = state.tool === 'eraser' ? '#000000' : controls.color.value; const core = Math.max(.02, 1 - (+controls.softness.value / 100)); fade.addColorStop(0, color); fade.addColorStop(core, color); fade.addColorStop(Math.min(1, core + .12), `${color}bb`); fade.addColorStop(1, `${color}00`); ctx.fillStyle = fade; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
  function clearSelection(quiet = false) { state.selection.overlay?.remove(); state.selection = { points: [], overlay: null, mask: null, layerId: null }; if (!quiet) setStatus('Selection cleared'); }
  function drawLassoOutline(closed = false) { const overlay = state.selection.overlay, points = state.selection.points; if (!overlay || !points.length) return; const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, state.width, state.height); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach(point => ctx.lineTo(point.x, point.y)); if (closed) ctx.closePath(); ctx.setLineDash([7, 5]); ctx.lineWidth = 2 / state.zoom; ctx.strokeStyle = '#159eaa'; ctx.stroke(); ctx.setLineDash([]); }
  function startLasso(point) { clearSelection(true); const overlay = document.createElement('canvas'); overlay.width = state.width; overlay.height = state.height; overlay.className = 'paint-layer selection-overlay'; overlay.style.zIndex = state.layers.length + 4; wrap.append(overlay); state.selection = { points: [point], overlay, mask: null, layerId: activeLayer()?.id || null }; drawLassoOutline(); }
  function addLassoPoint(point) { const points = state.selection.points, lastPoint = points.at(-1); if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 2 / state.zoom) return; points.push(point); drawLassoOutline(); }
  function finalizeLasso() { const points = state.selection.points; if (points.length < 3) { clearSelection(true); setStatus('Lasso needs at least three points'); return; } const mask = document.createElement('canvas'); mask.width = state.width; mask.height = state.height; const ctx = mask.getContext('2d'); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach(point => ctx.lineTo(point.x, point.y)); ctx.closePath(); ctx.fill(); state.selection.mask = mask; drawLassoOutline(true); setStatus('Pixels selected — press Delete to erase'); }
  function deleteSelectedPixels() { const selection = state.selection, layer = state.layers.find(item => item.id === selection.layerId); if (!selection.mask || !layer) return false; const ctx = layer.canvas.getContext('2d'); ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(selection.mask, 0, 0); ctx.restore(); clearSelection(true); commitHistory(); setStatus('Selected pixels erased'); return true; }
  function startStrokePreview() { const layer = activeLayer(); if (!layer || state.tool === 'eraser') return; const canvas = document.createElement('canvas'); canvas.width = state.width; canvas.height = state.height; canvas.className = 'paint-layer stroke-preview'; canvas.style.zIndex = `${+layer.canvas.style.zIndex + .5}`; canvas.style.opacity = String(layer.opacity); wrap.append(canvas); state.strokeCanvas = canvas; }
  function applyStrokePreview() { const preview = state.strokeCanvas, layer = activeLayer(); if (!preview || !layer) return; const ctx = layer.canvas.getContext('2d'); ctx.save(); ctx.globalCompositeOperation = state.tool === 'eraser' ? 'destination-out' : 'source-over'; ctx.drawImage(preview, 0, 0); ctx.restore(); preview.remove(); state.strokeCanvas = null; }
  function brushTo(point, first=false, event) { const canvas = state.tool === 'eraser' ? activeLayer()?.canvas : state.strokeCanvas; const ctx=canvas?.getContext('2d'); if(!ctx) return; const size=(+controls.size.value*pressureFactor(event))/state.zoom; ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=size;ctx.globalAlpha=1;ctx.globalCompositeOperation=state.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=controls.color.value;if(+controls.softness.value===0){ctx.beginPath();ctx.moveTo(state.last.x,state.last.y);ctx.lineTo(point.x,point.y);ctx.stroke();if(first){ctx.beginPath();ctx.arc(point.x,point.y,size/2,0,Math.PI*2);ctx.fillStyle=controls.color.value;ctx.fill();}}else{const dx=point.x-state.last.x,dy=point.y-state.last.y,distance=Math.hypot(dx,dy),steps=Math.max(1,Math.ceil(distance/Math.max(1,size*.12)));for(let i=first?0:1;i<=steps;i++){const t=i/steps;softStamp(ctx,state.last.x+dx*t,state.last.y+dy*t,size);}} }
  function isPan(event) { return state.tool === 'pan' || event.button === 1 || state.spacePan; }
  function startReferenceTransform(point) {
    const reference = state.reference;
    if (!reference.src || point.x < reference.x || point.x > reference.x + reference.width || point.y < reference.y || point.y > reference.y + reference.height) return false;
    const handle = Math.max(18, 16 / state.zoom);
    reference.mode = point.x >= reference.x + reference.width - handle && point.y >= reference.y + reference.height - handle ? 'scale' : 'move';
    reference.last = point;
    updateReferenceElement();
    return true;
  }
  function transformReference(point) {
    const reference = state.reference;
    if (reference.mode === 'move') {
      reference.x += point.x - reference.last.x;
      reference.y += point.y - reference.last.y;
      reference.last = point;
    } else if (reference.mode === 'scale') {
      reference.width = Math.max(40, point.x - reference.x);
      reference.height = reference.width / reference.ratio;
    }
    updateReferenceElement();
  }
  stage.addEventListener('pointerdown', (e) => {
    if(e.button!==0 && e.button!==1) return;
    reportPenInput(e); stage.setPointerCapture(e.pointerId);
    const pan=isPan(e), point=pan?{x:e.clientX,y:e.clientY}:canvasPoint(e);
    state.panning=pan;
    state.transforming=!pan&&state.tool==='reference'&&startReferenceTransform(point);
    state.lassoing=!pan&&!state.transforming&&state.tool==='lasso';
    state.drawing=!pan&&!state.transforming&&state.tool!=='lasso'&&state.tool!=='reference';
    state.last=point;
    wrap.classList.toggle('panning',pan); wrap.classList.toggle('is-dragging',pan);
    if(state.lassoing) startLasso(point);
    else if(!pan&&!state.transforming&&state.tool!=='reference'){ startStrokePreview(); brushTo(point,true,e); }
    else if(state.tool==='reference'&&!state.transforming) setStatus(state.reference.src ? 'Click the reference to move it; drag its lower-right corner to scale' : 'Import a PNG or JPG reference image first');
  });
  stage.addEventListener('pointermove', (e) => {
    reportPenInput(e); if(!state.last) return;
    if(state.panning){state.panX+=e.clientX-state.last.x;state.panY+=e.clientY-state.last.y;state.last={x:e.clientX,y:e.clientY};applyTransform();}
    else if(state.transforming) transformReference(canvasPoint(e));
    else if(state.lassoing){addLassoPoint(canvasPoint(e));}
    else if(state.drawing){const p=canvasPoint(e);brushTo(p,false,e);state.last=p;}
  });
  const finish=()=>{
    if(state.lassoing)finalizeLasso();
    if(state.drawing) { applyStrokePreview(); commitHistory(); setStatus('Stroke added'); }
    if(state.transforming) { state.reference.mode=null; state.reference.last=null; updateReferenceElement(); commitHistory(); setStatus('Reference image updated'); }
    state.drawing=false;state.lassoing=false;state.transforming=false;state.panning=false;state.last=null;wrap.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup',finish);stage.addEventListener('pointercancel',finish);
  stage.addEventListener('wheel',(e)=>{e.preventDefault();const r=stage.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,e.deltaY<0?1.12:1/1.12);},{passive:false});
  function chooseTool(tool) { state.tool=tool; document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('selected',b.dataset.tool===tool)); wrap.classList.toggle('panning',tool==='pan'); updateReferenceElement(); setStatus(tool === 'reference' ? (state.reference.src ? 'Reference tool selected — drag to move; lower-right handle scales' : 'Reference tool selected — import a PNG or JPG') : `${tool[0].toUpperCase()+tool.slice(1)} selected`); }
  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>chooseTool(b.dataset.tool));
  function selectColor(color) { controls.color.value = color; document.querySelectorAll('.color-swatch').forEach(swatch => swatch.classList.toggle('selected', swatch.dataset.color.toLowerCase() === color.toLowerCase())); setStatus(`Color selected: ${color}`); }
  document.querySelectorAll('.color-swatch').forEach(swatch => { swatch.style.backgroundColor = swatch.dataset.color; swatch.onclick = () => selectColor(swatch.dataset.color); });
  controls.color.oninput = () => document.querySelectorAll('.color-swatch').forEach(swatch => swatch.classList.toggle('selected', swatch.dataset.color.toLowerCase() === controls.color.value.toLowerCase()));
  controls.size.oninput=()=>$('brush-value').textContent=`${controls.size.value} px`; controls.softness.oninput=()=>$('softness-value').textContent=`${controls.softness.value}%`; controls.opacity.oninput=()=>{const layer=activeLayer();if(!layer)return;layer.opacity=+controls.opacity.value/100;layer.canvas.style.opacity=layer.opacity;$('opacity-value').textContent=`${controls.opacity.value}%`;}; controls.opacity.onchange=()=>commitHistory();
  controls.pressure.onchange=()=>{ $('pressure-range-control').classList.toggle('disabled', !controls.pressure.checked); setStatus(controls.pressure.checked ? 'Pen pressure size enabled' : 'Pen pressure size disabled'); };
  controls.pressureRange.oninput=()=>$('pressure-range-value').textContent=`${controls.pressureRange.value}%`;
  $('import-reference').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setStatus('Please choose a PNG or JPG image'); event.target.value = ''; return; }
    try {
      const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      const image = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
      const ratio = image.naturalWidth / image.naturalHeight || 1;
      const scale = Math.min(state.width * .75 / image.naturalWidth, state.height * .75 / image.naturalHeight, 1);
      const width = Math.max(40, image.naturalWidth * scale), height = Math.max(40, image.naturalHeight * scale);
      clearReference(true);
      state.reference = { src, x: (state.width - width) / 2, y: (state.height - height) / 2, width, height, ratio, opacity: 1, element: null, mode: null, last: null };
      syncReferenceControls();
      updateReferenceElement(); chooseTool('reference'); commitHistory(); setStatus('Reference image imported');
    } catch { setStatus('That image could not be imported'); }
    event.target.value = '';
  };
  $('remove-reference').onclick = () => { if (!state.reference.src) return; clearReference(); commitHistory(); };
  controls.referenceOpacity.oninput = () => {
    if (!state.reference.src) return;
    state.reference.opacity = +controls.referenceOpacity.value / 100;
    $('reference-opacity-value').textContent = `${controls.referenceOpacity.value}%`;
    updateReferenceElement();
  };
  controls.referenceOpacity.onchange = () => { if (state.reference.src) commitHistory(); };
  function stopPlayback() { state.timeline.playing = false; cancelAnimationFrame(state.timeline.raf); $('play-timeline').textContent = '▶'; $('play-timeline').classList.remove('playing'); }
  function playbackTick(now) { if (!state.timeline.playing) return; const frameMs = 1000 / state.timeline.fps; const elapsed = now - state.timeline.lastTick; if (elapsed >= frameMs) { const advance = Math.floor(elapsed / frameMs); state.timeline.lastTick += advance * frameMs; const next = state.timeline.frame + advance; if (next >= state.timeline.duration) { if (state.timeline.loop) setFrame(next % state.timeline.duration); else { setFrame(state.timeline.duration - 1); stopPlayback(); return; } } else setFrame(next); } state.timeline.raf = requestAnimationFrame(playbackTick); }
  function togglePlayback() { if (state.timeline.playing) return stopPlayback(); state.timeline.playing = true; state.timeline.lastTick = performance.now(); $('play-timeline').textContent = '❚❚'; $('play-timeline').classList.add('playing'); state.timeline.raf = requestAnimationFrame(playbackTick); }
  $('play-timeline').onclick = togglePlayback;
  $('loop-timeline').onchange = () => { state.timeline.loop = $('loop-timeline').checked; commitHistory(); };
  $('onion-skin').onclick = () => { state.timeline.onion = !state.timeline.onion; refreshOnionSkin(); renderTimeline(); commitHistory(); setStatus(state.timeline.onion ? 'Onion skin enabled' : 'Onion skin disabled'); };
  $('timeline-scrubber').oninput = () => setFrame(+$('timeline-scrubber').value);
  $('timeline-scrubber').onchange = () => commitHistory();
  $('timeline-fps').onchange = () => { state.timeline.fps = Math.max(1, Math.min(60, +$('timeline-fps').value || 12)); $('timeline-fps').value = state.timeline.fps; commitHistory(); };
  $('timeline-duration').onchange = () => { state.timeline.duration = Math.max(1, Math.min(3600, +$('timeline-duration').value || 72)); $('timeline-duration').value = state.timeline.duration; state.layers.forEach(layer => { layer.start = Math.min(layer.start, state.timeline.duration - 1); layer.end = Math.max(layer.start, Math.min(layer.end, state.timeline.duration - 1)); }); setFrame(state.timeline.frame); renderLayers(); commitHistory(); };
  function renderTransparentComposite(ctx, frame) { ctx.clearRect(0, 0, state.width, state.height); [...state.layers].reverse().forEach(layer => { if (layerIsOnFrame(layer, frame)) { ctx.save(); ctx.globalAlpha = layer.opacity; ctx.drawImage(layer.canvas, 0, 0); ctx.restore(); } }); }
  function renderOnionComposite(ctx, frame) { ctx.clearRect(0, 0, state.width, state.height); [...state.layers].reverse().forEach(layer => { if (layerIsOnFrame(layer, frame) && !layerIsOnFrame(layer, state.timeline.frame)) { ctx.save(); ctx.globalAlpha = layer.opacity; ctx.drawImage(layer.canvas, 0, 0); ctx.restore(); } }); }
  function renderComposite(ctx, frame) { ctx.clearRect(0, 0, state.width, state.height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, state.width, state.height); renderTransparentComposite(ctx, frame); }
  $('export-video').onclick = async () => { if (!window.MediaRecorder) return setStatus('Video export needs Chrome or another supported browser'); const originalFrame = state.timeline.frame; stopPlayback(); const videoCanvas = document.createElement('canvas'); videoCanvas.width = state.width; videoCanvas.height = state.height; const fps = state.timeline.fps; const stream = videoCanvas.captureStream(fps); const supported = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'; const recorder = new MediaRecorder(stream, { mimeType: supported }); const chunks = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; const completed = new Promise(resolve => recorder.onstop = resolve); recorder.start(); $('export-video').disabled = true; setStatus('Rendering video…'); const ctx = videoCanvas.getContext('2d'); for (let frame = 0; frame < state.timeline.duration; frame++) { renderComposite(ctx, frame); stream.getVideoTracks()[0].requestFrame?.(); await new Promise(resolve => setTimeout(resolve, 1000 / fps)); } recorder.stop(); await completed; stream.getTracks().forEach(track => track.stop()); download(new Blob(chunks, { type: supported }), 'fourNine-animatic.webm'); $('export-video').disabled = false; setFrame(originalFrame); setStatus('Video exported'); };
  $('add-layer').onclick=()=>{makeLayer();commitHistory();setStatus('New layer added');};
  function moveLayer(direction){const i=state.layers.findIndex(l=>l.id===state.activeId), target=i+direction;if(target<0||target>=state.layers.length)return;[state.layers[i],state.layers[target]]=[state.layers[target],state.layers[i]];renderLayers();commitHistory();}
  $('move-layer-up').onclick=()=>moveLayer(-1);$('move-layer-down').onclick=()=>moveLayer(1);
  $('merge-layer-down').onclick=()=>{const i=state.layers.findIndex(l=>l.id===state.activeId);if(i<0||i===state.layers.length-1){setStatus('There is no layer below to merge with');return;}const source=state.layers[i],target=state.layers[i+1],merged=document.createElement('canvas'),ctx=merged.getContext('2d');merged.width=state.width;merged.height=state.height;if(target.visible){ctx.globalAlpha=target.opacity;ctx.drawImage(target.canvas,0,0);}if(source.visible){ctx.globalAlpha=source.opacity;ctx.drawImage(source.canvas,0,0);}ctx.globalAlpha=1;target.canvas.getContext('2d').clearRect(0,0,state.width,state.height);target.canvas.getContext('2d').drawImage(merged,0,0);target.opacity=1;target.visible=target.visible||source.visible;target.start=Math.min(target.start,source.start);target.end=Math.max(target.end,source.end);source.canvas.remove();state.layers.splice(i,1);state.activeId=target.id;renderLayers();commitHistory();setStatus('Layers merged');};
  $('delete-layer').onclick=()=>{if(state.layers.length===1){setStatus('A document needs at least one layer');return;}const i=state.layers.findIndex(l=>l.id===state.activeId);state.layers[i].canvas.remove();state.layers.splice(i,1);state.activeId=state.layers[Math.min(i,state.layers.length-1)].id;renderLayers();commitHistory();setStatus('Layer deleted');};
  function resizeCanvas(){const w=+$('canvas-width').value,h=+$('canvas-height').value;if(!w||!h)return;clearSelection(true);const scaleX=w/state.width,scaleY=h/state.height;if(state.reference.src){state.reference.x*=scaleX;state.reference.y*=scaleY;state.reference.width*=scaleX;state.reference.height*=scaleY;state.reference.ratio=state.reference.width/state.reference.height;}state.layers.forEach(l=>{const old=l.canvas, next=document.createElement('canvas'),ctx=next.getContext('2d');next.width=w;next.height=h;next.className='paint-layer';ctx.drawImage(old,0,0);old.replaceWith(next);l.canvas=next;});state.width=w;state.height=h;placeCanvas();updateReferenceElement();renderLayers();fitCanvas();commitHistory();setStatus(`Canvas resized to ${w} × ${h}`);}
  $('resize-canvas').onclick=resizeCanvas;$('fit-canvas').onclick=fitCanvas;
  function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  $('export-png').onclick=()=>{const out=document.createElement('canvas');out.width=state.width;out.height=state.height;renderComposite(out.getContext('2d'),state.timeline.frame);out.toBlob(b=>download(b,'fourNine-frame.png'));setStatus(`Frame ${state.timeline.frame + 1} exported`);};
  $('export-layers').onclick=async()=>{const format=$('layer-export-format').value,extension=format==='png'?'png':'jpg',mime=format==='png'?'image/png':'image/jpeg';$('export-layers').disabled=true;for(let index=0;index<state.layers.length;index++){const layer=state.layers[index],out=document.createElement('canvas'),ctx=out.getContext('2d');out.width=state.width;out.height=state.height;if(format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,state.width,state.height);}ctx.globalAlpha=layer.opacity;ctx.drawImage(layer.canvas,0,0);const blob=await new Promise(resolve=>out.toBlob(resolve,mime,.95));const safeName=layer.name.trim().replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'')||`layer-${index+1}`;if(blob)download(blob,`fourNine-layer-${String(index+1).padStart(2,'0')}-${safeName}.${extension}`);setStatus(`Exported ${index+1} of ${state.layers.length} layers`);await new Promise(resolve=>setTimeout(resolve,120));} $('export-layers').disabled=false;setStatus('Layer export complete');};
  function projectData() {
    return {
      version: 3, width: state.width, height: state.height,
      reference: state.reference.src ? { src: state.reference.src, x: state.reference.x, y: state.reference.y, width: state.reference.width, height: state.reference.height, ratio: state.reference.ratio, opacity: state.reference.opacity } : null,
      timeline: { frame: state.timeline.frame, duration: state.timeline.duration, fps: state.timeline.fps, loop: state.timeline.loop, onion: state.timeline.onion },
      layers: state.layers.map(layer => ({ id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, start: layer.start, end: layer.end, image: layer.canvas.toDataURL() }))
    };
  }
  async function saveProject() {
    const contents = JSON.stringify(projectData());
    if ('showSaveFilePicker' in window) {
      try {
        if (!state.projectFileHandle) {
          state.projectFileHandle = await window.showSaveFilePicker({
            suggestedName: 'untitled.vibeart',
            types: [{ description: 'fourNine project', accept: { 'application/json': ['.vibeart'] } }]
          });
        }
        const writable = await state.projectFileHandle.createWritable();
        await writable.write(contents);
        await writable.close();
        setStatus(`Project saved: ${state.projectFileHandle.name}`);
      } catch (error) {
        if (error?.name === 'AbortError') setStatus('Save canceled');
        else { state.projectFileHandle = null; setStatus('Could not save project'); }
      }
    } else {
      download(new Blob([contents], { type: 'application/json' }), 'fourNine-art.vibeart');
      setStatus('Project downloaded — your browser chooses the save location');
    }
  }
  $('save-project').onclick = saveProject;
  $('open-project').onchange=async(e)=>{const file=e.target.files[0];if(!file)return;try{const doc=JSON.parse(await file.text());if(!doc.layers?.length)throw Error();await restoreDocument({...doc,activeId:null});state.projectFileHandle=null;state.history=[captureDocument()];state.redo=[];fitCanvas();setStatus('Project opened');}catch{setStatus('That file could not be opened');}e.target.value='';};
  $('new-file').onclick=()=>{if(confirm('Start a new blank canvas? Unsaved work will be lost.')){clearSelection(true);clearReference(true);state.projectFileHandle=null;state.layers.forEach(l=>l.canvas.remove());state.layers=[];makeLayer('Layer 1');placeCanvas();fitCanvas();commitHistory();setStatus('New canvas created');}};
  function changeBrushSize(amount) { controls.size.value = Math.max(+controls.size.min, Math.min(+controls.size.max, +controls.size.value + amount)); controls.size.dispatchEvent(new Event('input')); setStatus(`Brush size: ${controls.size.value} px`); }
  function changeSoftness(amount) { controls.softness.value = Math.max(+controls.softness.min, Math.min(+controls.softness.max, +controls.softness.value + amount)); controls.softness.dispatchEvent(new Event('input')); setStatus(`Edge softness: ${controls.softness.value}%`); }
  document.addEventListener('keydown',e=>{const modifier=e.metaKey||e.ctrlKey;if(modifier&&e.key.toLowerCase()==='s'){e.preventDefault();$('save-project').click();return;}if(modifier&&e.key.toLowerCase()==='e'){e.preventDefault();$('export-png').click();return;}if(modifier&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();return;}if(e.target.matches('input, textarea'))return;if(e.key===' '){e.preventDefault();if(e.repeat||state.spaceHeld)return;state.spaceHeld=true;state.spaceTimer=setTimeout(()=>{state.spacePan=true;wrap.classList.add('panning');},180);return;}if(e.key==='Escape'){clearSelection();return;}if(e.key==='Enter'){e.preventDefault();togglePlayback();return;}if(e.shiftKey&&e.key.toLowerCase()==='n'){$('add-layer').click();return;}if(e.shiftKey&&e.key.toLowerCase()==='m'){$('merge-layer-down').click();return;}if(e.key.toLowerCase()==='b')chooseTool('brush');if(e.key.toLowerCase()==='e')chooseTool('eraser');if(e.key.toLowerCase()==='h')chooseTool('pan');if(e.key.toLowerCase()==='l')chooseTool('lasso');if(e.key.toLowerCase()==='r')chooseTool('reference');if(e.key==='[')changeBrushSize(-2);if(e.key===']')changeBrushSize(2);if(e.key==='{')changeSoftness(5);if(e.key==='}')changeSoftness(-5);if(e.key==='+'||e.key==='=')zoomAtCenter(1.2);if(e.key==='-')zoomAtCenter(1/1.2);if(e.key==='1')fitCanvas();if(e.key==='Delete'||e.key==='Backspace'){if(!deleteSelectedPixels())$('delete-layer').click();}});document.addEventListener('keyup',e=>{if(e.key!==' '||e.target.matches('input, textarea'))return;clearTimeout(state.spaceTimer);const wasPanning=state.spacePan;state.spaceHeld=false;state.spacePan=false;if(state.tool!=='pan')wrap.classList.remove('panning');if(!wasPanning)togglePlayback();});
  $('pressure-range-control').classList.add('disabled'); makeLayer('Layer 1');placeCanvas();commitHistory();requestAnimationFrame(fitCanvas);
})();
