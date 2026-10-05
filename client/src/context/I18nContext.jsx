import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { HI } from '../lib/i18n-dict.js';

const I18nContext = createContext(null);

// Tags whose text is user data or code — never translate inside these.
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);

// Original text/attr values are remembered per-node so we can switch back to
// English without re-rendering. WeakMaps let the GC reclaim removed nodes.
const textOrig = new WeakMap();   // textNode -> original nodeValue
const attrOrig = new WeakMap();   // element  -> { placeholder, title }

function isTranslatable(node) {
  let el = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (el.isContentEditable) return false;
    if (el.dataset && el.dataset.noI18n !== undefined) return false;
    el = el.parentElement;
  }
  return true;
}

function applyText(node, lang) {
  if (lang === 'hi') {
    const baseline = textOrig.has(node) ? textOrig.get(node) : node.nodeValue;
    const key = baseline.trim();
    if (!key) return;
    const hit = HI[key];
    if (!hit) return;
    if (!textOrig.has(node)) textOrig.set(node, baseline);
    const desired = baseline.replace(key, hit);
    if (node.nodeValue !== desired) node.nodeValue = desired;
  } else if (textOrig.has(node)) {
    const desired = textOrig.get(node);
    if (node.nodeValue !== desired) node.nodeValue = desired;
  }
}

function applyAttrs(el, lang) {
  for (const attr of ['placeholder', 'title']) {
    if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
    const store = attrOrig.get(el) || {};
    const baseline = attr in store ? store[attr] : el.getAttribute(attr);
    if (lang === 'hi') {
      const hit = HI[(baseline || '').trim()];
      if (hit) {
        if (!(attr in store)) { store[attr] = baseline; attrOrig.set(el, store); }
        if (el.getAttribute(attr) !== hit) el.setAttribute(attr, hit);
      }
    } else if (attr in store) {
      if (el.getAttribute(attr) !== store[attr]) el.setAttribute(attr, store[attr]);
    }
  }
}

// Translate (or restore) an entire subtree.
function walk(root, lang) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (isTranslatable(root)) applyText(root, lang);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;

  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeValue.trim() && isTranslatable(n)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const nodes = [];
  while (tw.nextNode()) nodes.push(tw.currentNode);
  nodes.forEach((n) => applyText(n, lang));

  if (root.matches && root.matches('[placeholder],[title]')) applyAttrs(root, lang);
  root.querySelectorAll?.('[placeholder],[title]').forEach((el) => applyAttrs(el, lang));
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('epc_lang') || 'en');
  const langRef = useRef(lang);
  langRef.current = lang;

  // Re-translate the whole document whenever the language changes.
  useEffect(() => {
    localStorage.setItem('epc_lang', lang);
    document.documentElement.lang = lang;
    walk(document.body, lang);
  }, [lang]);

  // Keep newly-rendered content (route changes, modals, toasts) in sync.
  useEffect(() => {
    const obs = new MutationObserver((mutations) => {
      const lng = langRef.current;
      if (lng !== 'hi') return; // English is the source; nothing to do
      for (const m of mutations) {
        if (m.type === 'characterData') {
          if (m.target.nodeType === Node.TEXT_NODE && isTranslatable(m.target)) applyText(m.target, lng);
        } else if (m.type === 'attributes' && m.target.nodeType === Node.ELEMENT_NODE) {
          applyAttrs(m.target, lng);
        } else {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === Node.TEXT_NODE) { if (isTranslatable(n)) applyText(n, lng); }
            else if (n.nodeType === Node.ELEMENT_NODE) walk(n, lng);
          });
        }
      }
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title'],
    });
    return () => obs.disconnect();
  }, []);

  const setLang = useCallback((l) => setLangState(l === 'hi' ? 'hi' : 'en'), []);
  const toggle = useCallback(() => setLangState((l) => (l === 'hi' ? 'en' : 'hi')), []);
  // Imperative translate, for content rendered conditionally by components.
  const t = useCallback((s) => (langRef.current === 'hi' ? HI[s] || s : s), []);

  return (
    <I18nContext.Provider value={{ lang, setLang, toggle, t }}>{children}</I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext) || { lang: 'en', t: (s) => s, toggle: () => {}, setLang: () => {} };
