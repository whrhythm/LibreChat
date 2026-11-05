import { useLocalize } from '~/hooks';

export default function EditorLoading() {
  const localize = useLocalize();
  return (
    <div
      role="status"
      className="text-text-secondary flex h-full items-center justify-center text-sm"
    >
      {localize('com_ui_loading')}
    </div>
  );
}
