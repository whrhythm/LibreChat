import { Suspense, useEffect, useState } from 'react';
import type { NavLink } from '~/common';
import { useActivePanel, resolveActivePanel } from '~/Providers';

export default function Nav({ links }: { links: NavLink[] }) {
  const { active } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);
  const [visitedWorkspace, setVisitedWorkspace] = useState(false);
  const [visitedKnowledge, setVisitedKnowledge] = useState(false);
  useEffect(() => {
    if (effectiveActive === 'personal-space') setVisitedWorkspace(true);
    if (effectiveActive === 'knowledge-libraries') setVisitedKnowledge(true);
  }, [effectiveActive]);
  return (
    <div className="text-text-primary flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto">
      {links.map((link) => {
        if (!link.Component) return null;
        // Project/file drafts survive visits to the native builder and chat history.
        if (link.id === 'personal-space' || link.id === 'knowledge-libraries') {
          const visited = link.id === 'personal-space' ? visitedWorkspace : visitedKnowledge;
          if (!visited && effectiveActive !== link.id) return null;
          return (
            <div key={link.id} hidden={effectiveActive !== link.id} className="h-full min-h-0">
              <Suspense fallback={null}>
                <link.Component />
              </Suspense>
            </div>
          );
        }
        return link.id === effectiveActive ? <link.Component key={link.id} /> : null;
      })}
    </div>
  );
}
