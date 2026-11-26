import { setLang, useT, type Lang } from '../../i18n';

export function LangSwitch() {
  const { lang, t } = useT();
  return (
    <label className="lang">
      <span className="sr-only">{t('lang.label')}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        <option value="pt-BR">PT</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}
