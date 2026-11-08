import { useQuery } from '@tanstack/react-query';
import { personalCapacityRequest, QueryKeys } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks';

export default function useAccount(enabled = true) {
  const { user, token } = useAuthContext();
  return useQuery({
    queryKey: [QueryKeys.codechatCapacity, user?.id],
    queryFn: () => personalCapacityRequest(token!, 'account'),
    enabled: enabled && !!user?.id && !!token,
    staleTime: 10000,
    refetchInterval: enabled ? 30000 : false,
    retry: false,
  });
}
