import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@librechat/client';
import { personalPaymentRequest, QueryKeys } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

/** Local simulator only. Opening a checkout never grants entitlements. */
export default function Payment({ orderId, pending }: { orderId: string; pending: boolean }) {
  const { user, token } = useAuthContext();
  const localize = useLocalize();
  const client = useQueryClient();
  const key = [QueryKeys.codechatCapacity, user?.id, 'payment', orderId];
  const payment = useQuery({
    queryKey: key,
    queryFn: () => personalPaymentRequest(token!, orderId, 'payment'),
    enabled: !!token,
    refetchInterval: pending ? 3000 : false,
    retry: false,
  });
  const checkout = useMutation({
    mutationFn: () => personalPaymentRequest(token!, orderId, 'checkout'),
    onSuccess: (receipt) => client.setQueryData(key, receipt),
    onError: () => void client.invalidateQueries(key),
    retry: false,
  });
  const receipt = payment.data;
  const state = receipt?.state;
  return (
    <div className="mt-3 space-y-2 text-sm" aria-label={localize('com_codechat_payment_title')}>
      <p className="text-text-secondary">{localize('com_codechat_payment_local')}</p>
      {(payment.isError || checkout.isError) && (
        <p role="alert">{localize('com_codechat_payment_error')}</p>
      )}
      {pending && state === 'not_started' && (
        <Button disabled={checkout.isLoading} onClick={() => checkout.mutate()}>
          {localize('com_codechat_payment_create')}
        </Button>
      )}
      {pending && state === 'awaiting_payment' && receipt?.checkout_url && (
        <a
          className="text-text-primary border-border-light inline-flex rounded-lg border px-3 py-2 underline"
          href={receipt.checkout_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {localize('com_codechat_payment_open')}
        </a>
      )}
      {state === 'creating' && <p role="status">{localize('com_codechat_payment_creating')}</p>}
      {state === 'confirmed' && <p role="status">{localize('com_codechat_payment_confirmed')}</p>}
      {state === 'requires_review' && <p role="alert">{localize('com_codechat_payment_review')}</p>}
      <Button variant="ghost" disabled={payment.isFetching} onClick={() => void payment.refetch()}>
        {localize('com_codechat_payment_refresh')}
      </Button>
    </div>
  );
}
