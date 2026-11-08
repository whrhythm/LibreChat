import { useMemo } from 'react';
import { useSetAtom } from 'jotai';
import { useRecoilValue } from 'recoil';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import { getConfigDefaults, getEndpointField } from 'librechat-data-provider';
import { BarChart3, FolderKanban, MessagesSquare, Rocket } from 'lucide-react';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import { useGetEndpointsQuery, useGetStartupConfig, useInsightsAccessQuery } from '~/data-provider';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';
import PersonalSpace, { DeploymentPanel } from '~/components/CodeChat/Space';
import UsagePanel, { UsageIcon } from '~/components/CodeChat/Usage';
import { activePanelAtom } from '~/Providers/ActivePanelContext';
import { isCodeChatEnabled } from '~/components/CodeChat/config';
import { spaceNavigation } from '~/components/CodeChat/dock';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import useSideNavLinks from '~/hooks/Nav/useSideNavLinks';
import { useAuthContext } from '~/hooks';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

export default function useUnifiedSidebarLinks() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthContext();
  const setSpaceNavigation = useSetAtom(spaceNavigation(user?.id ?? 'anonymous'));
  const setActive = useSetAtom(activePanelAtom);
  const { setSidebarOpen } = useSidebarToggle();
  /** Selector instead of the full conversation atom: the links only depend on
   * the endpoint, so parameter edits and other conversation writes stay out. */
  const endpoint = useRecoilValue(store.conversationEndpointByIndex(0)) ?? undefined;
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );
  const insightsFeatureEnabled = startupConfig?.insightsEnabled === true;
  const isInsightsRoute = location.pathname.startsWith('/insights');
  const { data: insightsAccess, isLoading: isInsightsAccessLoading } = useInsightsAccessQuery(
    user?.id,
    {
      enabled: !!user && insightsFeatureEnabled && !isInsightsRoute,
    },
  );

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, endpoint, 'type'),
    [endpoint, endpointsConfig],
  );

  const userProvidesKey = useMemo(
    () => !!(endpointsConfig?.[endpoint ?? '']?.userProvide ?? false),
    [endpointsConfig, endpoint],
  );

  const { data: keyExpiry = { expiresAt: undefined } } = useUserKeyQuery(endpoint ?? '');

  const keyProvided = useMemo(
    () => (userProvidesKey ? !!(keyExpiry.expiresAt ?? '') : true),
    [keyExpiry.expiresAt, userProvidesKey],
  );

  const sideNavLinks = useSideNavLinks({
    keyProvided,
    endpoint,
    endpointType,
    interfaceConfig,
    endpointsConfig,
    includeHidePanel: false,
  });

  const links = useMemo(() => {
    const conversationLink: NavLink = {
      title: 'com_ui_chat_history',
      label: '',
      icon: MessagesSquare,
      id: 'conversations',
      Component: ConversationsSection,
    };
    const workspace: NavLink[] =
      user?.id && isCodeChatEnabled()
        ? [
            {
              id: 'personal-space',
              title: 'com_codechat_workspace',
              label: '',
              icon: FolderKanban,
              Component: PersonalSpace,
              onClick: () => {
                setSpaceNavigation((view) => ({ ...view, pane: 'files' }));
                setActive('personal-space');
                setSidebarOpen(true);
              },
            },
            {
              id: 'deployed-apps',
              title: 'com_assets_deployments',
              label: '',
              icon: Rocket,
              Component: DeploymentPanel,
            },
            ...(startupConfig?.codechat?.capacity?.enabled
              ? [
                  {
                    id: 'resource-usage',
                    title: 'com_assets_usage' as const,
                    label: '',
                    icon: UsageIcon,
                    Component: UsagePanel,
                  },
                ]
              : []),
          ]
        : [];
    if (
      !insightsFeatureEnabled ||
      (!isInsightsRoute && !isInsightsAccessLoading && insightsAccess?.access !== true)
    ) {
      return [
        conversationLink,
        ...sideNavLinks.filter((link) => ['agents', 'skills'].includes(link.id)),
        ...workspace,
        ...sideNavLinks.filter((link) => !['agents', 'skills'].includes(link.id)),
      ];
    }

    const insightsLink: NavLink = {
      title: 'com_insights_navigation',
      label: '',
      icon: BarChart3,
      id: 'insights',
      disabled: !isInsightsRoute && isInsightsAccessLoading,
      onClick: () => {
        if (!location.pathname.startsWith('/insights')) {
          navigate('/insights');
        }
      },
    };
    const mcpIndex = sideNavLinks.findIndex((link) => link.id === 'mcp-builder');
    const nextLinks = [...sideNavLinks];
    nextLinks.splice(mcpIndex >= 0 ? mcpIndex + 1 : nextLinks.length, 0, insightsLink);

    return [conversationLink, ...workspace, ...nextLinks];
  }, [
    insightsAccess?.access,
    insightsFeatureEnabled,
    isInsightsAccessLoading,
    isInsightsRoute,
    location.pathname,
    navigate,
    sideNavLinks,
    user?.id,
    setSpaceNavigation,
    setActive,
    setSidebarOpen,
    startupConfig?.codechat?.capacity?.enabled,
  ]);

  return links;
}
