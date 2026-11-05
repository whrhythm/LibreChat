import { useEffect, memo } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { ResizableHandleAlt, ResizablePanel } from '@librechat/client';
import useDirection from '~/hooks/Nav/useDirection';

interface ArtifactsPanelProps {
  panel: React.ReactNode | null;
  minSizeMain: string;
  shouldRender: boolean;
  onRenderChange: (shouldRender: boolean) => void;
  /** Rendered before the messages panel (RTL), so the handle follows the panel. */
  reversed?: boolean;
  defaultSize?: string;
  managePresence?: boolean;
  inert?: boolean;
}

const ArtifactsPanel = memo(function ArtifactsPanel({
  panel,
  minSizeMain,
  shouldRender,
  onRenderChange,
  reversed = false,
  defaultSize = '50',
  managePresence = true,
  inert = false,
}: ArtifactsPanelProps) {
  const artifactsPanelRef = usePanelRef();
  const direction = useDirection();

  useEffect(() => {
    if (!managePresence) return;
    if (panel != null) {
      onRenderChange(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          artifactsPanelRef.current?.expand();
        });
      });
    } else if (shouldRender) {
      onRenderChange(false);
    }
  }, [panel, shouldRender, onRenderChange, artifactsPanelRef, managePresence]);

  if (!shouldRender) {
    return null;
  }

  const handle = panel != null && (
    <ResizableHandleAlt disabled={inert} withHandle className="text-text-primary" />
  );

  return (
    <>
      {!reversed && handle}
      <ResizablePanel
        defaultSize={defaultSize}
        maxSize="70"
        collapsedSize="0"
        collapsible={true}
        minSize={minSizeMain}
        panelRef={artifactsPanelRef}
        id="artifacts-panel"
        dir={direction}
      >
        <div
          inert={inert ? '' : undefined}
          className="h-full min-w-[min(25rem,100%)] overflow-hidden"
        >
          {panel}
        </div>
      </ResizablePanel>
      {reversed && handle}
    </>
  );
});

ArtifactsPanel.displayName = 'ArtifactsPanel';

export default ArtifactsPanel;
