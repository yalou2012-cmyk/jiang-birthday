'use strict';

const events = window.events;

const routeStart = { x: 11.66, y: 60.04 };
// Скорость движения маркера между главами. Значения указаны в миллисекундах.
const routeTiming = { min: 5200, max: 8500, msPerSvgPixel: 15 };
const W = 1672, H = 941;
const $ = (id) => document.getElementById(id);
const dialog = $('memory');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const paths = [], buttons = [], labels = [];
let reached = -1, selected = -1, moving = false, finished = false, animation = 0;
let photoVersion = 0;
// Время показа одного фото и мягкого перехода, в миллисекундах.
const slideshowTiming = { hold: 6500, fade: 1600 };
let slideTimer = 0, slideIndex = 0, slideMedia = [], slidePaused = false, labelTimer = 0;
function stopSlideshow() {
  ++photoVersion;
  clearTimeout(slideTimer);
  $('slides').replaceChildren();
  slideMedia = [];
}
function scheduleSlide() {
  clearTimeout(slideTimer);
  if (dialog.open && !slidePaused && !document.hidden && slideMedia.length > 1) {
    slideTimer = setTimeout(() => showSlide(slideIndex + 1), slideshowTiming.hold);
  }
}
function showSlide(index) {
  if (!slideMedia.length) return;
  slideIndex = (index + slideMedia.length) % slideMedia.length;
  const item = slideMedia[slideIndex];
  const media = item.type === 'video' ? document.createElement('video') : new Image();
  media.src = item.src;
  media.className = `memory-slide media-${item.layout}`;
  media.dataset.layout = item.layout;
  media.setAttribute('aria-label', `${events[selected].title} — media ${slideIndex + 1}`);
  if (item.type === 'video') {
    media.preload = 'metadata';
    media.playsInline = true;
    media.muted = item.muted ?? true;
    media.loop = Boolean(item.loop);
    media.controls = item.controls ?? !item.autoplay;
    if (item.autoplay) media.autoplay = true;
  } else {
    media.alt = `${events[selected].title} — photo ${slideIndex + 1}`;
  }
  $('memory').dataset.layout = item.layout;
  const previous = $('slides').lastElementChild;
  // При быстрых ручных кликах сохраняем только текущий и входящий кадры.
  [...$('slides').children].forEach((child) => { if (child !== previous) child.remove(); });
  $('slides').append(media);
  const motionPresets = [
    [
      { transform: 'scale(1.01) translate3d(0, 0, 0)' },
      { transform: 'scale(1.055) translate3d(0, 0, 0)' }
    ],
    [
      { transform: 'scale(1.055) translate3d(0, 0, 0)' },
      { transform: 'scale(1.01) translate3d(0, 0, 0)' }
    ],
    [
      { transform: 'scale(1.045) translate3d(-1.1%, 0.5%, 0)' },
      { transform: 'scale(1.055) translate3d(1.1%, -0.5%, 0)' }
    ],
    [
      { transform: 'scale(1.05) translate3d(1%, -0.6%, 0)' },
      { transform: 'scale(1.035) translate3d(-1%, 0.6%, 0)' }
    ]
  ];
  const motion = media.animate(motionPresets[slideIndex % motionPresets.length], {
    duration: slideshowTiming.hold + slideshowTiming.fade,
    fill: 'forwards',
    easing: 'ease-in-out'
  });
  motion.id = 'photo-zoom';
  if (reducedMotion.matches || events[selected].final) motion.cancel();
  else if (slidePaused) motion.pause();
  media.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion.matches ? 0 : slideshowTiming.fade, fill: 'forwards' });
  if (item.type === 'video' && item.autoplay) media.play().catch(() => {});
  if (previous) {
    const currentScale = getComputedStyle(previous).transform;
    previous.getAnimations().forEach((animation) => animation.cancel());
    const leaving = previous.animate(
      [{ opacity: 1, transform: currentScale }, { opacity: 0, transform: 'scale(1)' }],
      { duration: reducedMotion.matches ? 0 : slideshowTiming.fade, fill: 'forwards', easing: 'ease-in-out' }
    );
    leaving.onfinish = () => previous.remove();
  }
  $('photo-count').textContent = `${String(slideIndex + 1).padStart(2, '0')} / ${String(slideMedia.length).padStart(2, '0')}`;
  scheduleSlide();
}
function normalizeMedia(event) {
  const source = event.media?.length ? event.media : event.photos?.length ? event.photos : event.image ? [event.image] : [];
  return source.map((item) => typeof item === 'string'
    ? { src: item, type: /\.(mp4|webm|mov)$/i.test(item) ? 'video' : 'image', layout: 'auto' }
    : { type: /\.(mp4|webm|mov)$/i.test(item.src) ? 'video' : 'image', layout: 'auto', ...item });
}
function resolveMedia(item) {
  return new Promise((resolve) => {
    if (item.type === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve({ ...item, layout: item.layout === 'auto' ? (video.videoWidth >= video.videoHeight ? 'landscape' : 'portrait') : item.layout });
      video.onerror = () => resolve(null);
      video.src = item.src;
    } else {
      const image = new Image();
      image.onload = () => resolve({ ...item, layout: item.layout === 'auto' ? (image.naturalWidth >= image.naturalHeight ? 'landscape' : 'portrait') : item.layout });
      image.onerror = () => resolve(null);
      image.src = item.src;
    }
  });
}
function startSlideshow(event) {
  stopSlideshow();
  const version = photoVersion;
  slidePaused = reducedMotion.matches;
  $('photo-pause').textContent = slidePaused ? 'Play' : 'Pause';
  $('photo-pause').setAttribute('aria-label', slidePaused ? 'Resume slideshow' : 'Pause slideshow');
  $('photo-controls').hidden = true;
  $('placeholder').hidden = false;
  Promise.all(normalizeMedia(event).map(resolveMedia)).then((loaded) => {
    if (version !== photoVersion || !dialog.open) return;
    slideMedia = loaded.filter(Boolean);
    if (!slideMedia.length) return;
    $('placeholder').hidden = true;
    $('photo-controls').hidden = slideMedia.length < 2;
    showSlide(0);
  });
}
const position = (p) => `${p.x * W / 100},${p.y * H / 100}`;

// A single continuous base avoids seams between the animated segments.
const routeBase = document.createElementNS('http://www.w3.org/2000/svg', 'path');
routeBase.setAttribute('class', 'route-base');
$('segments').append(routeBase);
let continuousRoute = '';
events.forEach((event, index) => {
  const start = index ? events[index - 1] : routeStart;
  const curve = event.curve;
  const d = `M ${position(start)} ` + (curve
    ? `C ${position({ x: curve[0], y: curve[1] })} ${position({ x: curve[2], y: curve[3] })} ${position(event)}`
    : `L ${position(event)}`);
  continuousRoute += index ? ' ' + d.slice(d.indexOf(event.curve ? 'C ' : 'L ')) : d;
  routeBase.setAttribute('d', continuousRoute);
  ['route-lit'].forEach((className) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className);
    $('segments').append(path);
    if (className === 'route-lit') {
      const length = path.getTotalLength();
      path.style.strokeDasharray = `${length} ${length}`;
      path.style.strokeDashoffset = length;
      paths.push({ path, length });
    }
  });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'point';
  button.style.left = `${event.x}%`;
  button.style.top = `${event.y}%`;
  button.setAttribute('aria-label', `${index + 1}. ${event.title}`);
  const label = document.createElement('span');
  label.className = `point-label ${event.x > 76 ? 'label-left' : 'label-right'}`;
  label.textContent = event.title.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  button.append(label);
  button.disabled = true;
  button.addEventListener('click', () => openMemory(index));
  $('points').append(button);
  buttons.push(button);
  labels.push(label);
});

function hideChapterLabels() {
  clearTimeout(labelTimer);
  labels.forEach((label) => label.classList.remove('visible'));
}

function showChapterLabel(index) {
  hideChapterLabels();
  const label = labels[index];
  if (!label) return;
  requestAnimationFrame(() => label.classList.add('visible'));
  labelTimer = setTimeout(() => label.classList.remove('visible'), 3400);
}

function update() {
  buttons.forEach((button, i) => {
    button.disabled = i > reached || moving;
    button.classList.toggle('active', i === reached && !moving && !finished);
    button.classList.toggle('visited', i < reached || finished);
    if (i === reached) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  $('counter').textContent = `${String(reached + 1).padStart(2, '0')} / ${String(events.length).padStart(2, '0')}`;
  $('open-current').disabled = moving || reached < 0;
  $('restart').hidden = !finished;
  $('status').textContent = moving ? 'The next memory is getting closer…' : finished ? 'Happy birthday. The story continues.' : events[reached]?.title || 'The story is about to begin.';
}

function travel(index, focusOnArrival = false) {
  if (index >= events.length) return;
  moving = true;
  hideChapterLabels();
  update();
  const { path, length } = paths[index];
  const duration = reducedMotion.matches
    ? 0
    : Math.min(routeTiming.max, Math.max(routeTiming.min, length * routeTiming.msPerSvgPixel));
  let began, labelShown = false;
  function frame(time) {
    began ??= time;
    const t = duration ? Math.min(1, (time - began) / duration) : 1;
    const progress = t * t * (3 - 2 * t);
    const point = path.getPointAtLength(length * progress);
    path.style.strokeDashoffset = length * (1 - progress);
    $('traveler').setAttribute('cx', point.x);
    $('traveler').setAttribute('cy', point.y);
    if (!labelShown && t >= .72) {
      labelShown = true;
      showChapterLabel(index);
    }
    if (t < 1) animation = requestAnimationFrame(frame);
    else {
      path.style.strokeDasharray = 'none';
      reached = index;
      moving = false;
      update();
      if (focusOnArrival) buttons[index].focus({ preventScroll: true });
    }
  }
  animation = requestAnimationFrame(frame);
}

function openMemory(index) {
  if (moving || index < 0 || index > reached) return;
  selected = index;
  const event = events[index];
  dialog.classList.toggle('final-scene', Boolean(event.final));
  $('envelope-greeting').hidden = !event.final;
  $('envelope-greeting').textContent = event.greeting || '';
  $('memory-title').textContent = event.title;
  $('memory-date').textContent = event.date;
  $('memory-text').textContent = event.text;
  $('memory-text').hidden = Boolean(event.final);
  $('final-message').hidden = !event.final;
  $('previous').disabled = index === 0;
  $('continue').textContent = index < reached ? 'Next →' : index === events.length - 1 ? 'Finish the story →' : 'Continue the journey →';
  if (!dialog.open) {
    document.body.classList.add('modal-open');
    dialog.showModal();
  }
  resetLetter();
  startSlideshow(event);
  $('close-memory').focus({ preventScroll: true });
}

function closeAndContinue() {
  if (!dialog.open) return;
  const shouldAdvance = selected === reached && !finished;
  stopSlideshow();
  dialog.close();
  document.body.classList.remove('modal-open');
  if (shouldAdvance && reached < events.length - 1) travel(reached + 1, true);
  else {
    if (shouldAdvance) finished = true;
    update();
    (finished ? $('restart') : buttons[reached])?.focus({ preventScroll: true });
  }
}

$('previous').addEventListener('click', () => openMemory(selected - 1));
$('photo-prev').addEventListener('click', () => showSlide(slideIndex - 1));
$('photo-next').addEventListener('click', () => showSlide(slideIndex + 1));
$('photo-pause').addEventListener('click', () => {
  slidePaused = !slidePaused;
  $('photo-pause').textContent = slidePaused ? 'Play' : 'Pause';
  $('photo-pause').setAttribute('aria-label', slidePaused ? 'Resume slideshow' : 'Pause slideshow');
  $('slides').lastElementChild?.getAnimations().filter((animation) => animation.id === 'photo-zoom').forEach((animation) => slidePaused ? animation.pause() : animation.play());
  scheduleSlide();
});
document.addEventListener('visibilitychange', scheduleSlide);
dialog.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    showSlide(slideIndex + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
$('continue').addEventListener('click', () => selected < reached ? openMemory(selected + 1) : closeAndContinue());
$('close-memory').addEventListener('click', closeAndContinue);
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeAndContinue(); });
dialog.addEventListener('click', (event) => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeAndContinue();
});
$('open-current').addEventListener('click', () => openMemory(reached));
$('restart').addEventListener('click', () => {
  cancelAnimationFrame(animation);
  reached = -1;
  finished = false;
  paths.forEach(({ path, length }) => { path.style.strokeDasharray = `${length} ${length}`; path.style.strokeDashoffset = length; });
  travel(0, true);
});
update();
if (events.length) travel(0);
else $('traveler').hidden = true;

// Letter contents live alongside the other chapter content in data/events.js.
let letterPage = 0;
function resetLetter() {
  letterPage = 0;
  dialog.classList.remove('reading-letter');
  $('envelope-open').hidden = false;
  $('letter-paper').hidden = true;
}
function renderLetter() {
  const pages = events[selected].letter;
  $('letter-words').textContent = pages[letterPage];
  $('letter-next').textContent = letterPage === pages.length - 1 ? 'Read again ↺' : 'Continue reading →';
  if (!reducedMotion.matches) $('letter-words').animate([{opacity:0, filter:'blur(3px)'},{opacity:1, filter:'blur(0)'}], {duration:1100, easing:'ease-out'});
}
$('envelope-open').addEventListener('click', () => {
  $('slides').querySelector('video')?.pause();
  dialog.classList.add('reading-letter');
  $('envelope-open').hidden = true;
  $('letter-paper').hidden = false;
  renderLetter();
  dialog.scrollTop = 0;
  $('letter-next').focus({preventScroll:true});
});
$('letter-next').addEventListener('click', () => {
  letterPage = (letterPage + 1) % events[selected].letter.length;
  renderLetter();
});
