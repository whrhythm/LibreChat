import { Button } from '@librechat/client';
import type { CodeChatEnvironment } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type Props = {
  hasProject: boolean;
  loading: boolean;
  failed: boolean;
  environment: CodeChatEnvironment | null | undefined;
  requesting: boolean;
  requestFailed: boolean;
  onRetry: () => void;
  onRequest: () => void;
};

export default function SpaceStatus(props: Props) {
  const localize = useLocalize();
  let content;
  if (!props.hasProject) {
    content = (
      <p className="text-text-secondary mt-2">{localize('com_codechat_space_needs_project')}</p>
    );
  } else if (props.loading) {
    content = (
      <p role="status" className="mt-2">
        {localize('com_codechat_space_checking')}
      </p>
    );
  } else if (props.failed || props.environment === undefined) {
    content = (
      <div role="alert" className="mt-2">
        <p>{localize('com_codechat_space_error')}</p>
        <Button variant="outline" onClick={props.onRetry}>
          {localize('com_codechat_retry')}
        </Button>
      </div>
    );
  } else if (props.environment === null) {
    content = (
      <div className="mt-2">
        <p>{localize('com_codechat_space_not_found')}</p>
        <p className="text-text-secondary">{localize('com_codechat_space_request_notice')}</p>
        <Button variant="outline" disabled={props.requesting} onClick={props.onRequest}>
          {localize('com_codechat_space_request')}
        </Button>
        {props.requestFailed && <p role="alert">{localize('com_codechat_space_error')}</p>}
      </div>
    );
  } else if (props.environment.mode === 'plan' || !props.environment.executable) {
    content = (
      <div className="mt-2" role="status">
        <p>{localize('com_codechat_space_planned')}</p>
        <p className="text-text-secondary">{localize('com_codechat_space_plan_notice')}</p>
      </div>
    );
  } else {
    content = (
      <p className="mt-2" role="status">
        {localize(
          props.environment.status === 'ready'
            ? 'com_codechat_space_ready'
            : 'com_codechat_space_pending',
        )}
      </p>
    );
  }
  return (
    <section
      aria-labelledby="codechat-space-title"
      className="border-border-light rounded-lg border p-4"
    >
      <h2 id="codechat-space-title" className="text-lg font-semibold">
        {localize('com_codechat_personal_space')}
      </h2>
      {content}
    </section>
  );
}
