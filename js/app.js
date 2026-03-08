'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let allTexts = [];
let sourceLanguages = [];
let selectedLanguage = '';
let currentTextIndex = 0;
let currentWordIndex = 0;
let results = {};   // { language: [ { textId, title, words: [ { word, status } ] } ] }
// status values: 'not_important' | 'correct' | 'wrong'

// ── DOM refs ───────────────────────────────────────────────────────────────
const langScreen       = document.getElementById('lang-screen');
const evalScreen       = document.getElementById('eval-screen');
const doneScreen       = document.getElementById('done-screen');
const langSelect       = document.getElementById('lang-select');
const startBtn         = document.getElementById('start-btn');
const resumeNotice     = document.getElementById('resume-notice');
const resumeBtn        = document.getElementById('resume-btn');
const restartBtn       = document.getElementById('restart-btn');
const songTitle        = document.getElementById('song-title');
const progressLabel    = document.getElementById('progress-label');
const originalTextEl   = document.getElementById('original-text');
const translationTextEl= document.getElementById('translation-text');
const translationHead  = document.getElementById('translation-heading');
const originalHead     = document.getElementById('original-heading');
const exportBtn        = document.getElementById('export-btn');
const exportFinalBtn   = document.getElementById('export-final-btn');
const changeLangBtn    = document.getElementById('change-lang-btn');
const backBtn          = document.getElementById('back-btn');
const nextSongBtn      = document.getElementById('next-song-btn');
const starRatingEl     = document.getElementById('star-rating');

// ── Helpers ────────────────────────────────────────────────────────────────
function showScreen(screen) {
  [langScreen, evalScreen, doneScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

function storageKey(lang) {
  return `folksong_mt_${lang}`;
}

function saveProgress() {
  localStorage.setItem(storageKey(selectedLanguage), JSON.stringify({
    currentTextIndex,
    currentWordIndex,
    results: results[selectedLanguage]
  }));
}

function loadProgress(lang) {
  const raw = localStorage.getItem(storageKey(lang));
  return raw ? JSON.parse(raw) : null;
}

function clearProgress(lang) {
  localStorage.removeItem(storageKey(lang));
}

function exportJSON() {
  const data = {
    language: selectedLanguage,
    exportedAt: new Date().toISOString(),
    evaluations: results[selectedLanguage]
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = selectedLanguage.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  a.download = `folksong_mt_${slug}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Build word spans for the original-language text (left panel) ───────────
function renderOriginal(textEntry, langResults) {
  const words = textEntry.original.split(/\s+/).filter(w => w.length > 0);
  originalTextEl.innerHTML = '';
  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = word;
    span.dataset.index = i;
    // Static pre-coloured words (semantically rich/not) from source data
    if (textEntry.coloredWords && textEntry.coloredWords.includes(i)) {
      span.classList.add('highlighted');
    }
    if (langResults && langResults.words[i]) {
      const status = langResults.words[i].status;
      if (status === 'correct') span.classList.add('marked-correct');
      else if (status === 'wrong') span.classList.add('marked-wrong');
    }
    originalTextEl.appendChild(span);
    if (i < words.length - 1) {
      originalTextEl.appendChild(document.createTextNode(' '));
    }
  });
}

function getWordSpans() {
  return Array.from(originalTextEl.querySelectorAll('.word'));
}

function setActiveWord(index) {
  const spans = getWordSpans();
  spans.forEach(s => s.classList.remove('active'));
  if (index < spans.length) {
    spans[index].classList.add('active');
    spans[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ── Render the star rating widget for the given text index ─────────────────
function renderStarRating(textIndex) {
  const rating = results[selectedLanguage][textIndex].overallRating;
  const stars = Array.from(starRatingEl.querySelectorAll('.star'));
  stars.forEach((btn, i) => {
    btn.classList.toggle('selected', rating !== null && i < rating);
  });
}

// ── Load a specific text into the evaluation screen ────────────────────────
function loadText(textIndex, wordIndex) {
  const text = allTexts[textIndex];
  const langResults = results[selectedLanguage][textIndex];

  songTitle.textContent = text.title;
  progressLabel.textContent = `(${textIndex + 1} / ${allTexts.length})`;
  translationHead.textContent = 'Translation (English)';
  originalHead.textContent = `Original (${selectedLanguage})`;

  renderOriginal(text, langResults);
  translationTextEl.textContent = text.english;

  currentWordIndex = wordIndex;
  setActiveWord(currentWordIndex);
  renderStarRating(textIndex);
}

// ── Initialise results for a language (fresh) ─────────────────────────────
function initResults(lang) {
  results[lang] = allTexts.map(t => ({
    textId: t.id,
    title: t.title,
    overallRating: null,
    words: t.original.split(/\s+/).filter(w => w.length > 0).map(w => ({
      word: w,
      status: 'not_important'
    }))
  }));
}

// ── Load language-specific data file then start/resume evaluation ──────────
function loadLanguageData(callback) {
  const langEntry = sourceLanguages.find(l => l.name === selectedLanguage);
  if (!langEntry) {
    document.body.innerHTML = `<p style="padding:2rem;color:red">Unknown source language: ${selectedLanguage}. Please reload.</p>`;
    return;
  }
  fetch(langEntry.file)
    .then(r => r.json())
    .then(data => {
      allTexts = data.texts;
      callback();
    })
    .catch(err => {
      console.error('Failed to load language data:', err);
      document.body.innerHTML = `<p style="padding:2rem;color:red">Error loading data for ${selectedLanguage}: ${err.message}. Please check the file exists and reload.</p>`;
    });
}

// ── Start / resume evaluation ──────────────────────────────────────────────
function startEvaluation(resume) {
  loadLanguageData(() => {
    if (!resume) {
      initResults(selectedLanguage);
      currentTextIndex = 0;
      currentWordIndex = 0;
    }
    showScreen(evalScreen);
    loadText(currentTextIndex, currentWordIndex);
    evalScreen.focus();
  });
}

// ── Keyboard navigation ────────────────────────────────────────────────────
document.addEventListener('keydown', handleKey);

function handleKey(e) {
  if (!evalScreen.classList.contains('active')) return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    moveCursor(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    moveCursor(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    markCurrentWord('correct');
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    markCurrentWord('wrong');
  }
}

function goToNextSong() {
  if (!results[selectedLanguage]) return;
  currentTextIndex++;
  saveProgress();
  if (currentTextIndex >= allTexts.length) {
    clearProgress(selectedLanguage);
    showScreen(doneScreen);
    return;
  }
  currentWordIndex = 0;
  loadText(currentTextIndex, currentWordIndex);
}

function moveCursor(direction) {
  if (!results[selectedLanguage]) return;
  const spans = getWordSpans();
  const newIndex = currentWordIndex + direction;
  if (direction > 0 && newIndex >= spans.length) {
    goToNextSong();
  } else if (direction < 0 && newIndex < 0) {
    // Don't move before the first word
    return;
  } else {
    currentWordIndex = newIndex;
    setActiveWord(currentWordIndex);
    saveProgress();
  }
}

function markCurrentWord(status) {
  const spans = getWordSpans();
  if (currentWordIndex >= spans.length) return;
  const span = spans[currentWordIndex];
  const wordResult = results[selectedLanguage][currentTextIndex].words[currentWordIndex];
  // Toggle off if same status pressed again
  const newStatus = wordResult.status === status ? 'not_important' : status;
  span.classList.remove('marked-correct', 'marked-wrong');
  if (newStatus === 'correct') span.classList.add('marked-correct');
  else if (newStatus === 'wrong') span.classList.add('marked-wrong');
  wordResult.status = newStatus;
  saveProgress();
}

// ── Star rating interaction ────────────────────────────────────────────────
if (starRatingEl) {
  starRatingEl.addEventListener('click', e => {
    const btn = e.target.closest('.star');
    if (!btn || !results[selectedLanguage]) return;
    const value = parseInt(btn.dataset.value, 10);
    const current = results[selectedLanguage][currentTextIndex].overallRating;
    // Click the same star again to clear the rating
    results[selectedLanguage][currentTextIndex].overallRating = current === value ? null : value;
    renderStarRating(currentTextIndex);
    saveProgress();
  });

  starRatingEl.addEventListener('mouseover', e => {
    const btn = e.target.closest('.star');
    if (!btn) return;
    const value = parseInt(btn.dataset.value, 10);
    Array.from(starRatingEl.querySelectorAll('.star')).forEach((s, i) => {
      s.classList.toggle('hovered', i < value);
    });
  });

  starRatingEl.addEventListener('mouseleave', () => {
    Array.from(starRatingEl.querySelectorAll('.star')).forEach(s => s.classList.remove('hovered'));
  });
}

// ── Language selector logic ────────────────────────────────────────────────
langSelect.addEventListener('change', () => {
  const lang = langSelect.value;
  startBtn.disabled = !lang;
  if (lang && loadProgress(lang)) {
    resumeNotice.classList.remove('hidden');
  } else {
    resumeNotice.classList.add('hidden');
  }
});

startBtn.addEventListener('click', () => {
  selectedLanguage = langSelect.value;
  startEvaluation(false);
});

resumeBtn.addEventListener('click', () => {
  selectedLanguage = langSelect.value;
  const saved = loadProgress(selectedLanguage);
  if (!saved) { startEvaluation(false); return; }
  results[selectedLanguage] = saved.results;
  currentTextIndex = saved.currentTextIndex;
  currentWordIndex = saved.currentWordIndex;
  startEvaluation(true);
});

restartBtn.addEventListener('click', () => {
  selectedLanguage = langSelect.value;
  clearProgress(selectedLanguage);
  resumeNotice.classList.add('hidden');
  startEvaluation(false);
});

changeLangBtn.addEventListener('click', () => {
  showScreen(langScreen);
});

nextSongBtn.addEventListener('click', goToNextSong);

exportBtn.addEventListener('click', exportJSON);
exportFinalBtn.addEventListener('click', exportJSON);

if (backBtn) {
  backBtn.addEventListener('click', () => {
    showScreen(langScreen);
    langSelect.value = '';
    startBtn.disabled = true;
    resumeNotice.classList.add('hidden');
  });
}

// ── Bootstrap: fetch manifest and populate language dropdown ──────────────
fetch('data/texts.json')
  .then(r => r.json())
  .then(manifest => {
    sourceLanguages = manifest.sourceLanguages;

    sourceLanguages.forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang.name;
      opt.textContent = lang.name;
      langSelect.appendChild(opt);
    });
  })
  .catch(err => {
    console.error('Failed to load texts.json:', err);
    document.body.innerHTML = `<p style="padding:2rem;color:red">Error loading data/texts.json: ${err.message}. Please check the file exists and reload.</p>`;
  });
