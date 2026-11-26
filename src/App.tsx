import { Link, Route, Switch, useLocation } from 'wouter';
import { useT } from './i18n';
import { InstallButton } from './ui/common/InstallButton';
import { LangSwitch } from './ui/common/LangSwitch';
import { PwaToast } from './ui/common/PwaToast';
import { DiagnosticsPage } from './ui/diagnostics/DiagnosticsPage';
import { EditorPage } from './ui/editor/EditorPage';
import { PanicButton } from './ui/live/PanicButton';

export function App() {
  const { t } = useT();
  const [location] = useLocation();
  const navClass = (path: string) => (location === path ? 'active' : '');
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand" title={t('app.slogan')}>
          GhostEQ
        </Link>
        <nav>
          <Link href="/" className={navClass('/')}>
            {t('nav.editor')}
          </Link>
          <Link href="/diagnostico" className={navClass('/diagnostico')}>
            {t('nav.diagnostics')}
          </Link>
        </nav>
        <InstallButton />
        <LangSwitch />
      </header>
      <Switch>
        <Route path="/diagnostico" component={DiagnosticsPage} />
        <Route component={EditorPage} />
      </Switch>
      <PanicButton />
      <PwaToast />
    </>
  );
}
