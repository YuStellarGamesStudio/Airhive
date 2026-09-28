import { STRINGS } from './strings.js';
import { UI } from '../data/settings.js';

export function detectLanguage(saved, locationLanguage, browserLanguage = '') {
  if (UI.languages.includes(locationLanguage)) return locationLanguage;
  if (UI.languages.includes(saved)) return saved;
  const language = browserLanguage.toLowerCase().split('-')[0];
  return UI.languages.includes(language) ? language : 'en';
}

export class I18n {
  constructor(language = 'en') { this.language = language; }
  t = (key) => STRINGS[this.language]?.[key] ?? STRINGS.en[key] ?? key;
  set(language) {
    if (!UI.languages.includes(language)) return;
    this.language = language;
    const url = new URL(location.href);
    url.searchParams.set('lang', language);
    history.replaceState(null, '', url);
    this.apply();
  }
  apply(root = document) {
    document.documentElement.lang = this.language === 'zh' ? 'zh-Hant' : this.language;
    document.title = `${this.t('title')} | Airhive`;
    for (const element of root.querySelectorAll('[data-i18n]')) element.textContent = this.t(element.dataset.i18n);
    for (const element of root.querySelectorAll('[data-i18n-label]')) element.setAttribute('aria-label', this.t(element.dataset.i18nLabel));
    for (const element of root.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = this.t(element.dataset.i18nPlaceholder);
  }
}
