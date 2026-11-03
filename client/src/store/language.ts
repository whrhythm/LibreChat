import { atom } from 'recoil';
import { detectInitialLanguage } from '~/locales/i18n';
import { atomWithLocalStorage } from './utils';

const lang = atomWithLocalStorage<string>('lang', detectInitialLanguage());
const languageLoading = atom<boolean>({
  key: 'languageLoading',
  default: false,
});

export default { lang, languageLoading };
