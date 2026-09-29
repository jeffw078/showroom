const products = [
  { name: 'ADHARA', file: 'ADHARA.jpg', phrase: 'Seu melhor dia começa em uma noite realmente bem dormida.', detailFile: 'ADHARA.jpg' },
  { name: 'AMORE', file: 'AMORE.jpg', phrase: 'Conforto que acolhe o corpo e desacelera a mente.' },
  { name: 'ASTO', file: 'ASTO.jpg', phrase: 'Equilíbrio para descansar com leveza e acordar renovado.' },
  { name: 'AUSTIN', file: 'AUSTIN.jpg', phrase: 'O encontro entre suporte, conforto e tranquilidade.' },
  { name: 'ELON', file: 'ELON.jpg', phrase: 'Uma noite serena pode transformar todo o seu dia.' },
  { name: 'FLORENCE', file: 'FLORENCE.jpg', phrase: 'Elegância para o quarto, conforto para cada noite.' },
  { name: 'MADRI', file: 'MADRI.jpg', phrase: 'Descanse profundamente. Recomece com mais energia.' },
  { name: 'PREMIUM HIBRYD', file: 'PREMIUM HIBRYD.jpg', phrase: 'Tecnologia e conforto em uma experiência de sono superior.' },
  { name: 'RAVENA', file: 'RAVENA.jpg', phrase: 'Aconchego na medida certa para noites mais completas.' },
  { name: 'SÉRIE ESPECIAL', file: 'SÉRIE ESPECIAL.jpg', phrase: 'Detalhes pensados para tornar o descanso extraordinário.' },
  { name: 'SLEPP WELL', file: 'SLEPP WELL.jpg', phrase: 'Dormir bem é o primeiro passo para viver melhor.' },
  { name: 'SUAVITTA', file: 'SUAVITTA.jpg', phrase: 'Suavidade, suporte e bem-estar em perfeita harmonia.' },
  { name: 'VENEZA', file: 'VENEZA.jpg', phrase: 'Um convite ao descanso, noite após noite.' }
];

const AUTOPLAY_MS = 5000;
const SYSTEM_URL = 'https://www.pellens.com.br/sistema';
const TRANSITION_MS = 620;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SHOWROOM_SCREEN = matchMedia('(min-width: 1px)');
const COMPONENTS = {
  base: { label: 'Base', folder: 'bases', prefix: 'base', options: ['Clássica', 'Bipartida', 'Flutuante'] },
  mattress: { label: 'Colchão', folder: 'colchoes', prefix: 'colchao', options: ['Reto', 'Alto', 'Borda larga'] },
  headboard: { label: 'Cabeceira', folder: 'cabeceiras', prefix: 'cabeceira', options: ['Inteira', 'Painéis', 'Faixas'] }
};
const CATEGORY_KEYS = Object.keys(COMPONENTS);
// 30% de uma volta completa: 108° ao todo, distribuídos em ±54°.
const CAMERA = { angleLimit: 54, elevation: 75 };
const DETAIL_FILES = {
  AMORE: 'AMORE.jpg', AUSTIN: 'AUSTIN.jpg', FLORENCE: 'FLORENCE.jpg',
  'PREMIUM HIBRYD': 'PREMIUM HIBRID.jpg', RAVENA: 'RAVENA.jpg',
  'SÉRIE ESPECIAL': 'SERIE ESPECIAL.jpg', 'SLEPP WELL': 'SLEEP WEELL.jpg',
  SUAVITTA: 'SUAVITTA.jpg', VENEZA: 'VENEZA.jpg'
};
products.forEach(p => { p.detailFile ??= DETAIL_FILES[p.name]; });

const state = {
  index: 0,
  zoom: 1,
  animating: false,
  dragging: false,
  railStartX: 0,
  railScrollLeft: 0,
  railMoved: false,
  stageStartX: null,
  autoplayTimer: null,
  resumeTimer: null,
  wheelLocked: false,
  preloaded: new Set(),
  mode: 'photo',
  mediaRequest: 0,
  viewer: null,
  modelTimeout: null,
  fabricColors: null,
  colors: { base: '#a99d90', headboard: '#82766c' },
  category: 'base',
  configuration: { base: 0, mattress: 0, headboard: 0 }
};

const $ = s => document.querySelector(s);
const els = {
  rail: $('#productRail'), track: $('#imageTrack'), main: $('#mainImage'),
  name: $('#productName'), phrase: $('#productPhrase'), copy: $('#heroCopy'),
  current: $('#currentIndex'), total: $('#totalCount'), stage: $('#stage'),
  modal: $('#detailModal'), detailButton: $('#detailButton'), detailImage: $('#detailImage'),
  detailTitle: $('#detailTitle'), detailFallback: $('#detailFallback'),
  systemButton: $('#systemButton'), smallSystemButton: $('#smallScreenSystemButton'),
  modelStage: $('#modelStage'), photoMode: $('#photoMode'), modelMode: $('#modelMode'),
  mediaStatus: $('#mediaStatus'), autoplayLabel: $('#autoplayLabel'),
  tabs: $('#componentTabs'), selectorLabel: $('#selectorLabel'),
  selector: $('.selector-wrap'), counter: $('.counter'),
  prev: $('#prevProduct'), next: $('#nextProduct'), fabrics: $('#fabricControls')
};

const pad = n => String(n).padStart(2, '0');
const stem = file => file.replace(/\.[^.]+$/, '');
const productPath = (p, width = 1920) => `assets/products/optimized/${stem(p.file)}-${width}.webp`;
const thumbnailPath = p => `assets/products/thumbs/${stem(p.file)}.webp`;
const productSrcset = p => `${productPath(p, 1280)} 1280w, ${productPath(p)} 1920w`;
const detailPath = p => `assets/products/details/optimized/${stem(p.detailFile)}.webp`;
function setPhotoSource(img, p) {
  img.sizes = '100vw';
  img.srcset = productSrcset(p);
  img.src = productPath(p);
}
function showMediaStatus(message = '') {
  els.mediaStatus.textContent = message;
  els.mediaStatus.hidden = !message;
}

els.total.textContent = pad(products.length);
els.systemButton.href = SYSTEM_URL;
els.smallSystemButton.href = SYSTEM_URL;

function createCards() {
  if (state.mode === 'model') {
    const category = COMPONENTS[state.category];
    els.rail.setAttribute('role', 'tabpanel');
    els.rail.setAttribute('aria-labelledby', els.tabs.querySelector(`[data-category="${state.category}"]`).id);
    els.rail.innerHTML = category.options.map((name, i) => `
      <button class="product-card component-card ${state.configuration[state.category] === i ? 'active' : ''}" data-option="${i}" type="button" aria-label="Selecionar ${category.label}: ${name}" aria-pressed="${state.configuration[state.category] === i}">
        <img src="${thumbnailPath(products[i])}" alt="" width="320" height="230" draggable="false" decoding="async">
        <span class="index">${pad(i + 1)}</span><strong>${name}</strong>
      </button>`).join('');
    return;
  }
  els.rail.removeAttribute('role');
  els.rail.removeAttribute('aria-labelledby');
  els.rail.innerHTML = products.map((p, i) => `
    <button class="product-card ${i === state.index ? 'active' : ''}" data-index="${i}" type="button" aria-label="Selecionar ${p.name}">
      <img src="${thumbnailPath(p)}" alt="${p.name}" width="320" height="230" draggable="false" loading="lazy" decoding="async" fetchpriority="low">
      <span class="index">${pad(i + 1)}</span><strong>${p.name}</strong>
    </button>`).join('');

}

els.rail.addEventListener('click', e => {
    if (state.railMoved) { e.preventDefault(); return; }
    const card = e.target.closest('.product-card');
    if (!card) return;
    if (state.mode === 'model') {
      state.configuration[state.category] = Number(card.dataset.option);
      createCards();
      updateConfigurationCopy();
      showModel();
      return;
    }
    const next = Number(card.dataset.index);
    selectProduct(next, next >= state.index ? 1 : -1, true);
    pauseAutoplay();
});

function selectCategory(key, focus = false) {
  state.category = key;
  els.tabs.querySelectorAll('[role="tab"]').forEach(tab => {
    const selected = tab.dataset.category === key;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  createCards();
  els.rail.scrollLeft = 0;
}
els.tabs.addEventListener('click', e => {
  const tab = e.target.closest('[data-category]');
  if (tab) selectCategory(tab.dataset.category);
});
els.tabs.addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const current = CATEGORY_KEYS.indexOf(e.target.dataset.category || state.category);
  const index = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (current + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
  selectCategory(CATEGORY_KEYS[index], true);
});

function updateConfigurationCopy() {
  els.name.textContent = 'Seu conjunto';
  els.phrase.textContent = CATEGORY_KEYS.map(key => `${COMPONENTS[key].label}: ${COMPONENTS[key].options[state.configuration[key]]}`).join(' · ');
}

function preload(index) {
  if (!SHOWROOM_SCREEN.matches || document.hidden || state.mode !== 'photo' || navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '')) return;
  const i = (index + products.length) % products.length;
  if (state.preloaded.has(i)) return;
  const img = new Image();
  img.decoding = 'async';
  img.fetchPriority = 'low';
  setPhotoSource(img, products[i]);
  img.onerror = () => state.preloaded.delete(i);
  state.preloaded.add(i);
}

function preloadNeighbors() {
  preload(state.index + 1);
  preload(state.index - 1);
}

function updateZoom() {
  if (state.mode === 'model') return;
  els.main.style.transform = `translate3d(0,0,0) scale(${state.zoom})`;
}

let viewerLibrary;
function ensureViewerLibrary() {
  viewerLibrary ??= import('./showroom-scene.js').catch(error => {
    viewerLibrary = null;
    throw error;
  });
  return viewerLibrary;
}

async function showModel() {
  const request = ++state.mediaRequest;
  const selection = { ...state.configuration };
  const paths = Object.fromEntries(CATEGORY_KEYS.map(key => {
    const category = COMPONENTS[key];
    return [key, `assets/models/${category.folder}/${category.prefix}_${pad(selection[key] + 1)}.glb`];
  }));
  clearTimeout(state.modelTimeout);
  els.modelStage.setAttribute('aria-busy', 'true');
  showMediaStatus(state.viewer?.loaded ? '' : 'Carregando seu conjunto 3D…');
  try {
    const library = await ensureViewerLibrary();
    if (request !== state.mediaRequest || state.mode !== 'model') return;
    state.viewer ??= new library.ShowroomScene(els.modelStage, CAMERA);
    state.fabricColors = library.FABRIC_COLORS;
    createFabricControls();
    state.viewer.setBaseColor(state.colors.base);
    state.viewer.setHeadboardColor(state.colors.headboard);
    state.viewer.setActive(true);
    state.modelTimeout = setTimeout(() => {
      if (request === state.mediaRequest) showMediaStatus('O conjunto está demorando para carregar. Selecione uma peça para tentar novamente ou volte a FOTOS.');
    }, 20000);
    const committed = await state.viewer.setConfiguration(paths, () => request === state.mediaRequest && state.mode === 'model');
    if (committed && request === state.mediaRequest) {
      clearTimeout(state.modelTimeout);
      showMediaStatus();
      els.modelStage.setAttribute('aria-busy', 'false');
    }
  } catch (_) {
    if (request === state.mediaRequest) {
      clearTimeout(state.modelTimeout);
      els.modelStage.setAttribute('aria-busy', 'false');
      showMediaStatus('Não foi possível carregar uma das peças. Selecione novamente para tentar ou volte a FOTOS.');
    }
  }
}

function createFabricControls() {
  if (!state.fabricColors) return;
  els.fabrics.innerHTML = ['base', 'headboard'].map(key => `
    <div class="fabric-group" role="group" aria-label="Cor da ${key === 'base' ? 'base' : 'cabeceira'}">
      <span>${key === 'base' ? 'Base' : 'Cabeceira'}</span>
      ${Object.entries(state.fabricColors).map(([name, color]) => `
        <button type="button" class="fabric-swatch" data-fabric="${key}" data-color="${color}" style="--fabric-color:${color}" aria-label="${key === 'base' ? 'Base' : 'Cabeceira'}: ${name}" title="${name}" aria-pressed="${state.colors[key] === color}"></button>`).join('')}
    </div>`).join('');
}
function setBaseColor(color) {
  state.viewer?.setBaseColor(color);
  state.colors.base = color;
  updateFabricSelection();
}
function setHeadboardColor(color) {
  state.viewer?.setHeadboardColor(color);
  state.colors.headboard = color;
  updateFabricSelection();
}
function updateFabricSelection() {
  els.fabrics.querySelectorAll('[data-fabric]').forEach(button => {
    button.setAttribute('aria-pressed', String(state.colors[button.dataset.fabric] === button.dataset.color));
  });
}
els.fabrics.addEventListener('click', e => {
  const swatch = e.target.closest('[data-fabric]');
  if (!swatch) return;
  if (swatch.dataset.fabric === 'base') setBaseColor(swatch.dataset.color);
  else setHeadboardColor(swatch.dataset.color);
});

function setMediaMode(mode) {
  if (state.animating) return;
  state.mode = mode;
  state.zoom = 1;
  ++state.mediaRequest;
  const model = mode === 'model';
  $('#showroom').classList.toggle('configuring', model);
  els.stage.classList.toggle('showing-model', model);
  els.modelStage.hidden = !model;
  els.photoMode.setAttribute('aria-pressed', String(!model));
  els.modelMode.setAttribute('aria-pressed', String(model));
  els.autoplayLabel.textContent = model ? 'MONTE SEU CONJUNTO' : 'TROCA AUTOMÁTICA · 5S';
  els.selectorLabel.textContent = model ? 'ESCOLHA UMA OPÇÃO PARA COMPOR SEU CONJUNTO' : 'DESLIZE PARA CONHECER A COLEÇÃO';
  els.tabs.hidden = !model;
  els.fabrics.hidden = !model;
  els.detailButton.hidden = model;
  els.prev.hidden = model;
  els.next.hidden = model;
  els.counter.hidden = model;
  createCards();
  els.rail.scrollLeft = 0;
  clearTimeout(state.autoplayTimer);
  clearTimeout(state.resumeTimer);
  showMediaStatus();
  if (model) { updateConfigurationCopy(); showModel(); }
  else {
    clearTimeout(state.modelTimeout);
    state.viewer?.setActive(false);
    els.name.textContent = products[state.index].name;
    els.phrase.textContent = products[state.index].phrase;
    updateZoom();
    scheduleAutoplay();
  }
}
els.photoMode.addEventListener('click', () => setMediaMode('photo'));
els.modelMode.addEventListener('click', () => setMediaMode('model'));

function updateMeta(p, direction) {
  els.copy.classList.remove('copy-out-left','copy-out-right','copy-in-left','copy-in-right');
  els.copy.classList.add(direction > 0 ? 'copy-out-left' : 'copy-out-right');
  setTimeout(() => {
    els.name.textContent = p.name;
    els.phrase.textContent = p.phrase;
    els.copy.classList.remove('copy-out-left','copy-out-right');
    els.copy.classList.add(direction > 0 ? 'copy-in-right' : 'copy-in-left');
    setTimeout(() => els.copy.classList.remove('copy-in-right','copy-in-left'), 360);
  }, 150);
}

async function selectProduct(index, direction = 1, centerCard = true) {
  if (state.mode !== 'photo') return;
  const nextIndex = (index + products.length) % products.length;
  if (state.animating || nextIndex === state.index) return;
  state.animating = true;
  state.zoom = 1;
  showMediaStatus();

  const p = products[nextIndex];
  const oldImg = els.main;
  const nextImg = new Image();
  nextImg.className = `main-image ${direction > 0 ? 'from-right' : 'from-left'}`;
  nextImg.alt = `Conjunto ${p.name}`;
  nextImg.draggable = false;
  nextImg.decoding = 'async';
  nextImg.fetchPriority = 'high';
  setPhotoSource(nextImg, p);
  // decode() também rejeita se o erro já aconteceu; não aguardar outro evento de load.
  let imageTimeout;
  try {
    await Promise.race([
      nextImg.decode(),
      new Promise((_, reject) => { imageTimeout = setTimeout(() => reject(new Error('timeout')), 15000); })
    ]);
  } catch (_) {
    state.animating = false;
    showMediaStatus('Não foi possível carregar a foto. Selecione outro produto ou tente novamente.');
    return;
  } finally { clearTimeout(imageTimeout); }

  if (!document.body.contains(oldImg)) {
    state.animating = false;
    return;
  }

  els.track.appendChild(nextImg);
  updateMeta(p, direction);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    nextImg.classList.add('moving','current');
    nextImg.classList.remove('from-right','from-left');
    oldImg.classList.add('moving', direction > 0 ? 'to-left' : 'to-right');
  }));

  await new Promise(resolve => setTimeout(() => {
    if (oldImg.parentNode === els.track) oldImg.remove();
    nextImg.classList.remove('moving');
    els.main = nextImg;
    state.index = nextIndex;
    els.current.textContent = pad(nextIndex + 1);

    els.rail.querySelectorAll('.product-card').forEach((card, i) => card.classList.toggle('active', i === nextIndex));
    if (centerCard) {
      els.rail.querySelector(`[data-index="${nextIndex}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    state.animating = false;
    if (state.mode === 'model') showModel();
    else preloadNeighbors();
    resolve();
  }, REDUCED_MOTION ? 50 : TRANSITION_MS + 40));
}

function shiftProduct(delta, manual = true) {
  if (state.mode !== 'photo') return;
  if (manual) pauseAutoplay();
  selectProduct(state.index + delta, delta >= 0 ? 1 : -1, true);
}

function scheduleAutoplay(delay = AUTOPLAY_MS) {
  clearTimeout(state.autoplayTimer);
  if (document.hidden || els.modal.open || state.mode === 'model' || !SHOWROOM_SCREEN.matches) return;
  state.autoplayTimer = setTimeout(async () => {
    if (!state.animating && !document.hidden && !els.modal.open && state.mode === 'photo') {
      await selectProduct(state.index + 1, 1, true);
    }
    scheduleAutoplay();
  }, delay);
}

function pauseAutoplay() {
  clearTimeout(state.autoplayTimer);
  clearTimeout(state.resumeTimer);
  if (state.mode === 'model') return;
  state.resumeTimer = setTimeout(() => scheduleAutoplay(), AUTOPLAY_MS);
}

$('#prevProduct').addEventListener('click', () => shiftProduct(-1));
$('#nextProduct').addEventListener('click', () => shiftProduct(1));
function changeZoom(direction) {
  if (state.mode === 'model') {
    if (!state.viewer?.loaded) return;
    state.viewer.zoom(direction);
  } else {
    state.zoom = Math.max(1, Math.min(2.1, state.zoom + direction * .15));
    updateZoom();
  }
  pauseAutoplay();
}
$('#zoomIn').addEventListener('click', () => changeZoom(1));
$('#zoomOut').addEventListener('click', () => changeZoom(-1));
$('#resetZoom').addEventListener('click', () => {
  state.zoom = 1;
  if (state.mode === 'model') state.viewer?.resetCamera();
  updateZoom(); pauseAutoplay();
});
$('#fullscreen').addEventListener('click', async () => {
  try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); } catch (_) {}
  pauseAutoplay();
});

document.addEventListener('keydown', e => {
  if (els.modal.open) return;
  if (e.target.closest('canvas, button, a, input, textarea, select, [contenteditable]')) return;
  if (e.key === 'ArrowRight') shiftProduct(1);
  else if (e.key === 'ArrowLeft') shiftProduct(-1);
});

els.rail.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  state.dragging = true;
  state.railMoved = false;
  state.railStartX = e.clientX;
  state.railScrollLeft = els.rail.scrollLeft;
  pauseAutoplay();
});
els.rail.addEventListener('pointermove', e => {
  if (!state.dragging) return;
  const distance = e.clientX - state.railStartX;
  if (!state.railMoved && Math.abs(distance) > 6) {
    state.railMoved = true;
    els.rail.classList.add('dragging');
    els.rail.setPointerCapture?.(e.pointerId);
  }
  if (state.railMoved) els.rail.scrollLeft = state.railScrollLeft - distance;
});
function stopRailDrag(e) {
  state.dragging = false;
  els.rail.classList.remove('dragging');
  if (e?.pointerId != null && els.rail.hasPointerCapture?.(e.pointerId)) els.rail.releasePointerCapture(e.pointerId);
}
els.rail.addEventListener('pointerup', stopRailDrag);
els.rail.addEventListener('pointercancel', stopRailDrag);
els.rail.addEventListener('pointerleave', e => { if (!state.railMoved) stopRailDrag(e); });

els.stage.addEventListener('pointerdown', e => {
  if (state.mode === 'model' || e.target.closest('button, a')) return;
  state.stageStartX = e.clientX; pauseAutoplay();
});
els.stage.addEventListener('pointerup', e => {
  if (state.stageStartX == null) return;
  const dx = e.clientX - state.stageStartX;
  state.stageStartX = null;
  if (Math.abs(dx) > 70) shiftProduct(dx < 0 ? 1 : -1);
});
els.stage.addEventListener('pointercancel', () => { state.stageStartX = null; });

els.stage.addEventListener('wheel', e => {
  if (state.mode === 'model' || e.target.closest('button, a')) return;
  if (state.wheelLocked || state.animating || Math.abs(e.deltaY) < 20) return;
  e.preventDefault();
  state.wheelLocked = true;
  shiftProduct(e.deltaY > 0 ? 1 : -1);
  setTimeout(() => state.wheelLocked = false, 700);
}, { passive: false });

els.detailButton.addEventListener('click', () => {
  const p = products[state.index];
  els.detailTitle.textContent = p.name;
  els.detailImage.removeAttribute('src');
  els.detailImage.hidden = true;
  els.detailFallback.hidden = true;

  if (!p.detailFile) {
    els.detailFallback.hidden = false;
  } else {
    els.detailImage.onload = () => { els.detailImage.hidden = false; els.detailFallback.hidden = true; };
    els.detailImage.onerror = () => { els.detailImage.hidden = true; els.detailFallback.hidden = false; };
    els.detailImage.src = detailPath(p);
  }

  clearTimeout(state.autoplayTimer);
  clearTimeout(state.resumeTimer);
  els.modal.showModal();
});

$('#closeModal').addEventListener('click', () => els.modal.close());
els.modal.addEventListener('click', e => { if (e.target === els.modal) els.modal.close(); });
els.modal.addEventListener('close', () => scheduleAutoplay());

document.addEventListener('visibilitychange', () => {
  clearTimeout(state.autoplayTimer);
  if (!document.hidden) scheduleAutoplay();
});

let initialized = false;
function initializeShowroom() {
  if (!SHOWROOM_SCREEN.matches) return;
  if (!initialized) {
    createCards();
    initialized = true;
    els.main.decode().catch(() => {}).then(() => {
      if ('requestIdleCallback' in window) requestIdleCallback(preloadNeighbors, { timeout: 2000 });
      else setTimeout(preloadNeighbors, 500);
    });
  }
  scheduleAutoplay();
}
SHOWROOM_SCREEN.addEventListener('change', () => {
  clearTimeout(state.autoplayTimer);
  clearTimeout(state.resumeTimer);
  if (!SHOWROOM_SCREEN.matches && state.mode === 'model') setMediaMode('photo');
  initializeShowroom();
});
initializeShowroom();
